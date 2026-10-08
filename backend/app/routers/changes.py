from fastapi import APIRouter

from app.deps import CurrentUser, DbSession
from app.errors import ApiError
from app.models import Change, HostedZone
from app.schemas.common import ChangeInfo
from app.services.changes import change_info

router = APIRouter(prefix="/changes", tags=["changes"])


@router.get("/{change_id}", response_model=ChangeInfo)
def get_change(change_id: str, db: DbSession, user: CurrentUser) -> ChangeInfo:
    change = db.get(Change, change_id)
    if change is not None and change.zone_id is not None:
        zone = db.get(HostedZone, change.zone_id)
        if zone is None or zone.owner_id != user.id:
            change = None
    if change is None:
        raise ApiError(404, "NoSuchChange", f"A change with the specified change ID does not exist: {change_id}")
    return change_info(change)
