from fastapi import APIRouter, Response

from app.deps import CurrentUser, DbSession
from app.schemas.health_checks import (
    HealthCheckCreate,
    HealthCheckList,
    HealthCheckMetrics,
    HealthCheckOut,
    HealthCheckStatus,
    HealthCheckUpdate,
)
from app.schemas.zones import TagsReplace, ZoneBatchDelete
from app.services import health_checks as service

router = APIRouter(prefix="/healthchecks", tags=["health checks"])


@router.get("", response_model=HealthCheckList)
def list_health_checks(db: DbSession, user: CurrentUser) -> HealthCheckList:
    by_id = service.index(db, user)
    return HealthCheckList(items=[service.to_out(hc, by_id) for hc in by_id.values()], total=len(by_id))


@router.post("", response_model=HealthCheckOut, status_code=201)
def create_health_check(body: HealthCheckCreate, db: DbSession, user: CurrentUser, response: Response) -> HealthCheckOut:
    hc = service.create_health_check(db, user, body)
    response.headers["Location"] = f"/api/v1/healthchecks/{hc.id}"
    return service.to_out(hc, service.index(db, user))


@router.post("/batch-delete", status_code=204)
def batch_delete_health_checks(body: ZoneBatchDelete, db: DbSession, user: CurrentUser) -> Response:
    service.delete_health_checks(db, user, body.ids)
    return Response(status_code=204)


@router.get("/{health_check_id}", response_model=HealthCheckOut)
def get_health_check(health_check_id: str, db: DbSession, user: CurrentUser) -> HealthCheckOut:
    hc = service.get_health_check(db, user, health_check_id)
    return service.to_out(hc, service.index(db, user))


@router.put("/{health_check_id}", response_model=HealthCheckOut)
def update_health_check(
    health_check_id: str, body: HealthCheckUpdate, db: DbSession, user: CurrentUser
) -> HealthCheckOut:
    hc = service.update_health_check(db, user, health_check_id, body)
    return service.to_out(hc, service.index(db, user))


@router.put("/{health_check_id}/tags", response_model=HealthCheckOut)
def replace_health_check_tags(
    health_check_id: str, body: TagsReplace, db: DbSession, user: CurrentUser
) -> HealthCheckOut:
    hc = service.replace_tags(db, user, health_check_id, body.tags)
    return service.to_out(hc, service.index(db, user))


@router.delete("/{health_check_id}", status_code=204)
def delete_health_check(health_check_id: str, db: DbSession, user: CurrentUser) -> Response:
    service.delete_health_checks(db, user, [health_check_id])
    return Response(status_code=204)


@router.get("/{health_check_id}/status", response_model=HealthCheckStatus)
def get_health_check_status(health_check_id: str, db: DbSession, user: CurrentUser) -> HealthCheckStatus:
    """GetHealthCheckStatus: what each health checker Region last observed."""
    hc = service.get_health_check(db, user, health_check_id)
    return service.checker_observations(hc, service.index(db, user))


@router.get("/{health_check_id}/metrics", response_model=HealthCheckMetrics)
def get_health_check_metrics(health_check_id: str, db: DbSession, user: CurrentUser) -> HealthCheckMetrics:
    """Mock CloudWatch metrics for the Monitoring tab (HealthCheckPercentageHealthy, TimeToFirstByte)."""
    hc = service.get_health_check(db, user, health_check_id)
    return service.metrics(hc, service.index(db, user))
