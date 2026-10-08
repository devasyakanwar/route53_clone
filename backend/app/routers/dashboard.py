from fastapi import APIRouter
from sqlalchemy import func, select

from app.deps import CurrentUser, DbSession
from app.models import HostedZone
from app.schemas.health_checks import DashboardSummary
from app.services import health_checks as hc_service

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("", response_model=DashboardSummary)
def dashboard(db: DbSession, user: CurrentUser) -> DashboardSummary:
    zones = db.execute(
        select(HostedZone.is_private, func.count(), func.coalesce(func.sum(HostedZone.record_count), 0))
        .where(HostedZone.owner_id == user.id)
        .group_by(HostedZone.is_private)
    ).all()
    public = sum(count for private, count, _ in zones if not private)
    private = sum(count for private, count, _ in zones if private)
    records = sum(int(total) for _, _, total in zones)

    by_id = hc_service.index(db, user)
    statuses = [hc_service.compute_status(hc, by_id) for hc in by_id.values()]
    return DashboardSummary(
        hosted_zones=public + private,
        public_hosted_zones=public,
        private_hosted_zones=private,
        record_sets=records,
        health_checks=len(statuses),
        healthy_health_checks=statuses.count("Healthy"),
        unhealthy_health_checks=statuses.count("Unhealthy"),
        unknown_health_checks=statuses.count("Unknown"),
    )
