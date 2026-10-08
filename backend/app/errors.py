import dataclasses
from dataclasses import dataclass


@dataclass
class FieldError:
    message: str
    field: str | None = None


@dataclass
class ApiError(Exception):
    """An error rendered as {"error": {"code", "message", "field", "errors"}} with the given HTTP status."""

    status_code: int
    code: str
    message: str
    field: str | None = None
    errors: list[FieldError] = dataclasses.field(default_factory=list)

    def to_dict(self) -> dict[str, object]:
        body: dict[str, object] = {"code": self.code, "message": self.message, "field": self.field}
        if self.errors:
            body["errors"] = [{"message": e.message, "field": e.field} for e in self.errors]
        return {"error": body}


def not_found_zone(zone_id: str) -> ApiError:
    return ApiError(404, "NoSuchHostedZone", f"No hosted zone found with ID: {zone_id}")


def invalid_input(message: str, field: str | None = None) -> ApiError:
    return ApiError(400, "InvalidInput", message, field)
