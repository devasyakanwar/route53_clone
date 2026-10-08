from typing import Any, Literal

from fastapi import APIRouter, Response

from app.deps import DbSession, OwnedZone
from app.schemas.records import ChangeBatch, ChangeIn, ImportRequest, ImportResponse
from app.services import bind
from app.services import records as record_service
from app.services.changes import change_info

router = APIRouter(prefix="/hostedzones/{zone_id}", tags=["import / export"])


@router.post("/import", response_model=ImportResponse)
def import_zone_file(zone: OwnedZone, body: ImportRequest, db: DbSession, dry_run: bool = False) -> ImportResponse:
    record_sets, skipped = bind.parse_zone_file(body.zone_file, zone.name)
    if dry_run or not record_sets:
        return ImportResponse(record_sets=record_sets, skipped=skipped)
    batch = ChangeBatch(
        comment=body.comment or "Imported from zone file",
        changes=[ChangeIn(action="CREATE", record_set=rs) for rs in record_sets],
    )
    change = record_service.apply_change_batch(db, zone, batch)
    return ImportResponse(record_sets=record_sets, skipped=skipped, change_info=change_info(change))


@router.get("/export", response_model=None)
def export_zone(zone: OwnedZone, db: DbSession, format: Literal["json", "bind"] = "json") -> Any:
    rows, _ = record_service.list_records(db, zone, page_size=100000)
    filename = zone.name.rstrip(".")
    if format == "bind":
        return Response(
            bind.export_bind(zone, rows),
            media_type="text/plain; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="{filename}.zone"'},
        )
    return bind.export_json(rows)
