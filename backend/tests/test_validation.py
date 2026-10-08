import pytest

from app.services.validation import (
    ValidationError,
    escape_name,
    is_domain_value,
    normalize_record_name,
    normalize_zone_name,
    parse_character_strings,
    unescape_name,
    validate_ttl,
    validate_values,
)


def test_zone_name_normalisation() -> None:
    assert normalize_zone_name(" Example.COM ") == "example.com."
    assert normalize_zone_name("example.com.") == "example.com."
    assert normalize_zone_name("_sub-1.example.com") == "_sub-1.example.com."
    with pytest.raises(ValidationError):
        normalize_zone_name(".")
    with pytest.raises(ValidationError):
        normalize_zone_name("a" * 64 + ".com")


def test_record_name_normalisation() -> None:
    zone = "example.com."
    assert normalize_record_name("", zone) == zone
    assert normalize_record_name("@", zone) == zone
    assert normalize_record_name("WWW.example.com", zone) == "www.example.com."
    assert normalize_record_name("\\052.example.com.", zone) == "*.example.com."
    with pytest.raises(ValidationError):
        normalize_record_name("www.example.org", zone)
    with pytest.raises(ValidationError):
        normalize_record_name("a..example.com", zone)
    with pytest.raises(ValidationError):
        normalize_record_name("bad*.example.com", zone)


def test_escape_round_trip() -> None:
    assert escape_name("*.example.com.") == "\\052.example.com."
    assert unescape_name(escape_name("*.example.com.")) == "*.example.com."


def test_domain_values() -> None:
    assert is_domain_value("mail.example.com.")
    assert is_domain_value("Mail.Example.com")
    assert not is_domain_value(".")
    assert is_domain_value(".", allow_root=True)
    assert not is_domain_value("bad host")


def test_character_strings() -> None:
    assert parse_character_strings('"a" "b c"') == ["a", "b c"]
    assert parse_character_strings('"with \\"quote\\""') == ['with \\"quote\\"']
    with pytest.raises(ValidationError):
        parse_character_strings("plain")
    with pytest.raises(ValidationError):
        parse_character_strings('"a" b')


def test_txt_split_strings_allow_long_values() -> None:
    long_value = '"' + "a" * 255 + '" "' + "b" * 255 + '"'
    values, errors = validate_values("TXT", [long_value])
    assert errors == [] and values == [long_value]
    _, errors = validate_values("TXT", ['"' + "a" * 255 + '"'] * 16 + ['"' + "z" * 100 + '"'])
    assert errors and "4000" in errors[-1][1]


def test_values_normalised() -> None:
    assert validate_values("MX", ["10    mail.example.com"]) == (["10 mail.example.com"], [])
    assert validate_values("CAA", ['0 ISSUE "amazon.com"']) == (['0 issue "amazon.com"'], [])
    assert validate_values("A", ["192.0.2.1", "", "  "]) == (["192.0.2.1"], [])


def test_empty_and_duplicate_values() -> None:
    assert validate_values("A", [])[1] == [(None, "Enter at least one value.")]
    assert validate_values("A", ["192.0.2.1", "192.0.2.1"])[1][0][0] is None


def test_soa_values() -> None:
    ok = "ns-1.awsdns-01.com. hostmaster.example.com. 1 7200 900 1209600 86400"
    assert validate_values("SOA", [ok])[1] == []
    assert validate_values("SOA", ["ns-1.awsdns-01.com. 1 2 3"])[1]


def test_ttl() -> None:
    assert validate_ttl(0) is None
    assert validate_ttl(2147483647) is None
    assert validate_ttl(None)
    assert validate_ttl(-1)
