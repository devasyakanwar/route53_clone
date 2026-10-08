from fastapi import APIRouter, Query

from app.deps import DbSession, OwnedZone
from app.schemas.records import ChangeBatch, ChangeIn, ChangeResponse, RecordSetList, RecordSetOut
from app.services import records as record_service
from app.services.changes import change_info

router = APIRouter(prefix="/hostedzones/{zone_id}", tags=["records"])


@router.get("/recordsets", response_model=RecordSetList)
def list_record_sets(
    zone: OwnedZone,
    db: DbSession,
    search: str | None = None,
    type: str | None = None,
    routing_policy: str | None = None,
    alias: bool | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(300, ge=1, le=1000),
) -> RecordSetList:
    rows, total = record_service.list_records(
        db, zone, search=search, rtype=type, routing_policy=routing_policy, alias=alias, page=page, page_size=page_size
    )
    return RecordSetList(
        items=[record_service.record_out(r) for r in rows], total=total, page=page, page_size=page_size
    )


@router.get("/recordsets/{record_id}", response_model=RecordSetOut)
def get_record_set(zone: OwnedZone, record_id: int, db: DbSession) -> RecordSetOut:
    return record_service.record_out(record_service.get_record(db, zone, record_id))


@router.post("/rrset", response_model=ChangeResponse)
def change_resource_record_sets(zone: OwnedZone, body: ChangeBatch, db: DbSession) -> ChangeResponse:
    """ChangeResourceRecordSets: an atomic batch of CREATE / UPSERT / DELETE changes."""
    return ChangeResponse(change_info=change_info(record_service.apply_change_batch(db, zone, body)))


@router.delete("/recordsets/{record_id}", response_model=ChangeResponse)
def delete_record_set(zone: OwnedZone, record_id: int, db: DbSession) -> ChangeResponse:
    row = record_service.get_record(db, zone, record_id)
    record_set = record_service.draft_to_input(record_service.Draft.from_row(row))
    batch = ChangeBatch(changes=[ChangeIn(action="DELETE", record_set=record_set)])
    return ChangeResponse(change_info=change_info(record_service.apply_change_batch(db, zone, batch)))
