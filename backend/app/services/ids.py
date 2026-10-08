import secrets
import string

_ALPHABET = string.ascii_uppercase + string.digits


def _random_id(prefix: str, length: int = 20) -> str:
    return prefix + "".join(secrets.choice(_ALPHABET) for _ in range(length))


def new_zone_id() -> str:
    """Hosted zone IDs look like Z0812345ABCDEFGHIJKLM: 'Z' + 20 uppercase alphanumerics."""
    return _random_id("Z")


def new_change_id() -> str:
    return _random_id("C")
