from typing import Any

from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import Change, utcnow
from app.schemas.common import ChangeInfo
from app.services.ids import new_change_id


def record_change(db: Session, zone_id: str | None, comment: str | None, payload: dict[str, Any]) -> Change:
    change = Change(id=new_change_id(), zone_id=zone_id, comment=comment, payload=payload, submitted_at=utcnow())
    db.add(change)
    return change


def change_status(change: Change) -> str:
    """Changes are PENDING for a couple of seconds to imitate Route 53 propagation, then INSYNC."""
    elapsed = (utcnow() - change.submitted_at).total_seconds()
    return "INSYNC" if elapsed > get_settings().change_propagation_seconds else "PENDING"


def change_info(change: Change) -> ChangeInfo:
    return ChangeInfo(
        id=change.id,
        status=change_status(change),  # type: ignore[arg-type]
        submitted_at=change.submitted_at,
        comment=change.comment,
    )
