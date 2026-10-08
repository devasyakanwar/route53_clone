from typing import Any, Literal

from fastapi import APIRouter, Query, Response

from app.deps import CurrentUser, DbSession, OwnedZone
from app.schemas.common import ChangeInfo
from app.schemas.zones import (
    DelegationSet,
    TagsReplace,
    ZoneBatchDelete,
    ZoneBatchDeleteResponse,
    ZoneCreate,
    ZoneCreateResponse,
    ZoneDetail,
    ZoneList,
    ZoneUpdate,
)
from app.services import bind
from app.services import records as record_service
from app.services import zones as zone_service
from app.services.changes import change_info

router = APIRouter(prefix="/hostedzones", tags=["hosted zones"])


@router.get("", response_model=ZoneList)
def list_hosted_zones(
    db: DbSession,
    user: CurrentUser,
    search: str | None = None,
    type: Literal["public", "private"] | None = None,
    sort: zone_service.SortField = "name",
    order: Literal["asc", "desc"] = "asc",
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=1000),
) -> ZoneList:
    zones, total = zone_service.list_zones(
        db, user, search=search, zone_type=type, sort=sort, order=order, page=page, page_size=page_size
    )
    return ZoneList(items=[zone_service.zone_out(z) for z in zones], total=total, page=page, page_size=page_size)


@router.post("", response_model=ZoneCreateResponse, status_code=201)
def create_hosted_zone(body: ZoneCreate, db: DbSession, user: CurrentUser, response: Response) -> ZoneCreateResponse:
    zone, change = zone_service.create_zone(db, user, body)
    response.headers["Location"] = f"/api/v1/hostedzones/{zone.id}"
    return ZoneCreateResponse(
        hosted_zone=zone_service.zone_detail(zone),
        change_info=change_info(change),
        delegation_set=DelegationSet(name_servers=list(zone.name_servers)),
    )


@router.post("/batch-delete", response_model=ZoneBatchDeleteResponse)
def batch_delete_hosted_zones(body: ZoneBatchDelete, db: DbSession, user: CurrentUser) -> ZoneBatchDeleteResponse:
    """Delete several hosted zones in one transaction. Fails (and deletes nothing) if any zone has records."""
    changes = zone_service.delete_zones(db, user, body.ids)
    return ZoneBatchDeleteResponse(changes=[change_info(c) for c in changes])


@router.get("/export", response_model=None)
def export_hosted_zones(
    db: DbSession,
    user: CurrentUser,
    format: Literal["json", "bind"] = "json",
    ids: list[str] | None = Query(None, description="Hosted zone IDs to export; all zones when omitted"),
) -> Any:
    if ids:
        zones = [zone_service.get_zone(db, user, zone_id) for zone_id in dict.fromkeys(ids)]
    else:
        zones, _ = zone_service.list_zones(db, user, page_size=100000)
    data = [(zone, record_service.list_records(db, zone, page_size=100000)[0]) for zone in zones]
    if format == "bind":
        return Response(
            bind.export_zones_bind(data),
            media_type="text/plain; charset=utf-8",
            headers={"Content-Disposition": 'attachment; filename="hosted-zones.zone"'},
        )
    return bind.export_zones_json(data)


@router.get("/{zone_id}", response_model=ZoneDetail)
def get_hosted_zone(zone: OwnedZone) -> ZoneDetail:
    return zone_service.zone_detail(zone)


@router.patch("/{zone_id}", response_model=ZoneDetail)
def update_hosted_zone(zone_id: str, body: ZoneUpdate, db: DbSession, user: CurrentUser) -> ZoneDetail:
    return zone_service.zone_detail(zone_service.update_comment(db, user, zone_id, body.comment))


@router.put("/{zone_id}/tags", response_model=ZoneDetail)
def replace_hosted_zone_tags(zone_id: str, body: TagsReplace, db: DbSession, user: CurrentUser) -> ZoneDetail:
    return zone_service.zone_detail(zone_service.replace_tags(db, user, zone_id, body.tags))


@router.delete("/{zone_id}", response_model=ChangeInfo)
def delete_hosted_zone(zone_id: str, db: DbSession, user: CurrentUser) -> ChangeInfo:
    return change_info(zone_service.delete_zone(db, user, zone_id))
