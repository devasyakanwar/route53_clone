"""Domain-name and per-record-type value validation (PLAN §3.8).

The frontend mirrors these rules and messages in src/lib/validators.ts, so keep them in sync.
"""

from __future__ import annotations

import ipaddress
import re

MAX_DOMAIN_LENGTH = 253
MAX_TTL = 2147483647
MAX_TXT_STRING = 255
MAX_TXT_TOTAL = 4000

_LABEL_RE = re.compile(r"^[a-z0-9_-]{1,63}$")
_VALUE_LABEL_RE = re.compile(r"^(?!-)[A-Za-z0-9_-]{1,63}(?<!-)$")
_TXT_TOKEN_RE = re.compile(r'"((?:[^"\\]|\\.)*)"')
_CAA_RE = re.compile(r'^(\d+)\s+([A-Za-z0-9]+)\s+("(?:[^"\\]|\\.)*")$')
_CAA_TAGS = ("issue", "issuewild", "iodef", "issuemail", "issuevmc")
_HEX_RE = re.compile(r"^[0-9A-Fa-f]+$")


class ValidationError(ValueError):
    pass


# --------------------------------------------------------------------------- names


def unescape_name(raw: str) -> str:
    """Route 53 escapes '*' as \\052 in API output; accept both forms on input."""
    return raw.replace("\\052", "*")


def escape_name(name: str) -> str:
    return name.replace("*", "\\052")


def normalize_zone_name(raw: str) -> str:
    """Lower-case, fully qualified with a trailing dot. Raises ValidationError."""
    name = raw.strip().lower()
    if not name:
        raise ValidationError("Enter a domain name.")
    if name.endswith("."):
        name = name[:-1]
    if not name:
        raise ValidationError("The domain name can't be only a dot.")
    if len(name) > MAX_DOMAIN_LENGTH:
        raise ValidationError(f"The domain name can have up to {MAX_DOMAIN_LENGTH} characters.")
    for label in name.split("."):
        if not label:
            raise ValidationError("The domain name can't contain empty labels (two dots in a row).")
        if len(label) > 63:
            raise ValidationError("Each label in the domain name can have up to 63 characters.")
        if not _LABEL_RE.match(label):
            raise ValidationError(
                "The domain name can contain only the characters a-z, 0-9, - (hyphen), _ (underscore) and . (period)."
            )
    return name + "."


def normalize_record_name(raw: str, zone_name: str) -> str:
    """Normalise a fully qualified record name and check that it belongs to the zone."""
    name = unescape_name(raw.strip().lower())
    if name in ("", "@"):
        return zone_name
    if not name.endswith("."):
        name += "."
    bare = name[:-1]
    if len(bare) > MAX_DOMAIN_LENGTH:
        raise ValidationError(f"The record name can have up to {MAX_DOMAIN_LENGTH} characters.")
    labels = bare.split(".")
    for i, label in enumerate(labels):
        if label == "*" and i == 0:
            continue
        if not label:
            raise ValidationError("The record name can't contain empty labels (two dots in a row).")
        if "*" in label:
            raise ValidationError("A wildcard (*) can only be used as the leftmost label, for example *.example.com.")
        if len(label) > 63:
            raise ValidationError("Each label in the record name can have up to 63 characters.")
        if not _LABEL_RE.match(label):
            raise ValidationError(
                "The record name can contain only the characters a-z, 0-9, - (hyphen), _ (underscore), "
                "* (wildcard) and . (period)."
            )
    if name != zone_name and not name.endswith("." + zone_name):
        raise ValidationError(
            f"RRSet with DNS name {name} is not permitted in zone {zone_name}"
        )
    return name


def is_domain_value(value: str, allow_root: bool = False) -> bool:
    v = value[:-1] if value.endswith(".") else value
    if not v:
        return allow_root and value == "."
    if len(v) > MAX_DOMAIN_LENGTH:
        return False
    labels = v.split(".")
    for i, label in enumerate(labels):
        if label == "*" and i == 0:
            continue
        if not _VALUE_LABEL_RE.match(label):
            return False
    return True


# --------------------------------------------------------------------------- values


def _int_in(token: str, lo: int, hi: int) -> bool:
    # isascii() matters: str.isdigit() is also true for characters like '²' that int() can't parse.
    return token.isascii() and token.isdigit() and lo <= int(token) <= hi


def _string_length(content: str) -> int:
    """Length of a quoted character-string's content, counting escapes like \\" or \\065 as one."""
    return len(re.sub(r"\\(\d{3}|.)", "x", content))


def parse_character_strings(value: str) -> list[str]:
    """Split a TXT/SPF value into its quoted strings. Raises ValidationError."""
    s = value.strip()
    pos, out = 0, []
    while pos < len(s):
        m = _TXT_TOKEN_RE.match(s, pos)
        if not m:
            raise ValidationError('Enter the value in quotation marks, for example "v=spf1 -all".')
        out.append(m.group(1))
        pos = m.end()
        while pos < len(s) and s[pos] in " \t":
            pos += 1
    if not out:
        raise ValidationError('Enter the value in quotation marks, for example "v=spf1 -all".')
    return out


def _validate_a(v: str) -> str:
    try:
        return str(ipaddress.IPv4Address(v))
    except ValueError:
        raise ValidationError(f"{v} is not a valid IPv4 address. Use the format 192.0.2.235.") from None


def _validate_aaaa(v: str) -> str:
    try:
        if "%" in v:  # Python accepts zone ids like fe80::1%eth0; DNS records can't carry them
            raise ValueError(v)
        ipaddress.IPv6Address(v)
    except ValueError:
        raise ValidationError(
            f"{v} is not a valid IPv6 address. Use the format 2001:0db8:85a3:0:0:8a2e:0370:7334."
        ) from None
    return v.lower()


def _validate_domain(v: str) -> str:
    if not is_domain_value(v):
        raise ValidationError(f"{v} is not a valid domain name.")
    return v


def _validate_txt(v: str) -> str:
    strings = parse_character_strings(v)
    for content in strings:
        if _string_length(content) > MAX_TXT_STRING:
            raise ValidationError(
                f"Each string in a TXT value can have up to {MAX_TXT_STRING} characters. "
                'Split longer values into multiple quoted strings: "part1" "part2".'
            )
    return v


def _validate_mx(v: str) -> str:
    parts = v.split()
    if len(parts) != 2 or not _int_in(parts[0], 0, 65535) or not is_domain_value(parts[1]):
        raise ValidationError(
            "Enter the value in the format priority mailserver, for example 10 mail.example.com. "
            "Priority must be 0-65535."
        )
    return " ".join(parts)


def _validate_srv(v: str) -> str:
    parts = v.split()
    if (
        len(parts) != 4
        or not all(_int_in(p, 0, 65535) for p in parts[:3])
        or not is_domain_value(parts[3], allow_root=True)
    ):
        raise ValidationError(
            "Enter the value in the format priority weight port target, for example "
            "1 10 5269 xmpp-server.example.com. Priority, weight and port must be 0-65535."
        )
    return " ".join(parts)


def _validate_caa(v: str) -> str:
    m = _CAA_RE.match(v.strip())
    if not m or not _int_in(m.group(1), 0, 255) or m.group(2).lower() not in _CAA_TAGS:
        raise ValidationError(
            'Enter the value in the format flags tag "value", for example 0 issue "amazon.com". '
            "Flags must be 0-255 and tag must be one of issue, issuewild, iodef, issuemail or issuevmc."
        )
    return f"{m.group(1)} {m.group(2).lower()} {m.group(3)}"


def _validate_soa(v: str) -> str:
    parts = v.split()
    if (
        len(parts) != 7
        or not is_domain_value(parts[0])
        or not is_domain_value(parts[1])
        or not all(_int_in(p, 0, 4294967295) for p in parts[2:])
    ):
        raise ValidationError(
            "Enter the value in the format mname rname serial refresh retry expire minimum, for example "
            "ns-2048.awsdns-64.net. hostmaster.example.com. 1 7200 900 1209600 86400."
        )
    return " ".join(parts)


def _validate_ds(v: str) -> str:
    parts = v.split()
    if (
        len(parts) != 4
        or not _int_in(parts[0], 0, 65535)
        or not _int_in(parts[1], 0, 255)
        or not _int_in(parts[2], 0, 255)
        or not _HEX_RE.match(parts[3])
    ):
        raise ValidationError(
            "Enter the value in the format key-tag algorithm digest-type digest, for example "
            "12345 13 2 1F987CC6583E92DF0890718C42."
        )
    return " ".join(parts)


_NAPTR_RE = re.compile(r'^(\d+)\s+(\d+)\s+"([A-Za-z0-9]*)"\s+"((?:[^"\\]|\\.)*)"\s+"((?:[^"\\]|\\.)*)"\s+(\S+)$')


def _validate_naptr(v: str) -> str:
    m = _NAPTR_RE.match(v.strip())
    if (
        not m
        or not _int_in(m.group(1), 0, 65535)
        or not _int_in(m.group(2), 0, 65535)
        or not is_domain_value(m.group(6), allow_root=True)
    ):
        raise ValidationError(
            'Enter the value in the format order preference "flags" "services" "regexp" replacement, '
            'for example 100 100 "U" "" "!^.*$!sip:info@example.com!" .'
        )
    return v.strip()


_VALIDATORS = {
    "A": _validate_a,
    "AAAA": _validate_aaaa,
    "CAA": _validate_caa,
    "CNAME": _validate_domain,
    "DS": _validate_ds,
    "MX": _validate_mx,
    "NAPTR": _validate_naptr,
    "NS": _validate_domain,
    "PTR": _validate_domain,
    "SOA": _validate_soa,
    "SPF": _validate_txt,
    "SRV": _validate_srv,
    "TXT": _validate_txt,
}


def validate_values(rtype: str, values: list[str]) -> tuple[list[str], list[tuple[int | None, str]]]:
    """Validate and normalise the value lines of a record set.

    Returns (normalised values, errors) where each error is (value index or None, message).
    """
    errors: list[tuple[int | None, str]] = []
    cleaned = [v.strip() for v in values if v.strip()]
    if not cleaned:
        return [], [(None, "Enter at least one value.")]
    if rtype in ("CNAME", "SOA") and len(cleaned) > 1:
        what = "a domain name" if rtype == "CNAME" else "an SOA value"
        errors.append((None, f"A {rtype} record can contain only one value. Enter {what} on a single line."))
    validator = _VALIDATORS[rtype]
    out: list[str] = []
    for i, v in enumerate(cleaned):
        try:
            out.append(validator(v))
        except ValidationError as e:
            errors.append((i, str(e)))
    if rtype in ("TXT", "SPF") and not errors and sum(len(v) for v in out) > MAX_TXT_TOTAL:
        errors.append((None, f"The total length of all values can be up to {MAX_TXT_TOTAL} characters."))
    if not errors and len(set(out)) != len(out):
        errors.append((None, "Duplicate values aren't allowed in the same record."))
    return out, errors


def validate_ttl(ttl: int | None) -> str | None:
    if ttl is None:
        return "Enter a TTL."
    if ttl < 0 or ttl > MAX_TTL:
        return f"TTL must be between 0 and {MAX_TTL} seconds."
    return None
