from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.zones import Tag

HealthStatus = Literal["Healthy", "Unhealthy", "Unknown"]


class CloudWatchAlarm(BaseModel):
    alarm_name: str
    region: str
    insufficient_data_status: Literal["Healthy", "Unhealthy", "LastKnownStatus"] = "LastKnownStatus"


class Notification(BaseModel):
    sns_topic: str
    emails: list[str] = Field(default_factory=list)


class HealthCheckConfig(BaseModel):
    """Fields shared by create and update. Endpoint, calculated and CloudWatch checks use different subsets."""

    name: str
    type: Literal["HTTP", "HTTPS", "HTTP_STR_MATCH", "HTTPS_STR_MATCH", "TCP", "CALCULATED", "CLOUDWATCH_METRIC"]
    ip_address: str | None = None
    fqdn: str | None = None
    port: int | None = None
    resource_path: str | None = None
    search_string: str | None = None
    request_interval: Literal[10, 30] = 30
    failure_threshold: int = 3
    measure_latency: bool = False
    enable_sni: bool | None = None
    regions: list[str] = Field(default_factory=list)
    child_health_checks: list[str] = Field(default_factory=list)
    health_threshold: int | None = None
    cloudwatch_alarm: CloudWatchAlarm | None = None
    inverted: bool = False
    disabled: bool = False
    notification: Notification | None = None


class HealthCheckCreate(HealthCheckConfig):
    tags: list[Tag] = Field(default_factory=list)
    caller_reference: str | None = None


class HealthCheckUpdate(HealthCheckConfig):
    pass


class HealthCheckOut(HealthCheckConfig):
    id: str
    caller_reference: str
    status: HealthStatus
    description: str
    alarms: str
    tags: list[Tag]
    version: int
    created_at: datetime
    updated_at: datetime


class HealthCheckList(BaseModel):
    items: list[HealthCheckOut]
    total: int


class CheckerObservation(BaseModel):
    region: str
    region_name: str
    ip_address: str
    status: str
    checked_at: datetime


class HealthCheckStatus(BaseModel):
    id: str
    status: HealthStatus
    observations: list[CheckerObservation]


class StatusPoint(BaseModel):
    timestamp: datetime
    healthy_percentage: float
    latency_ms: float | None = None


class HealthCheckMetrics(BaseModel):
    id: str
    points: list[StatusPoint]


class DashboardSummary(BaseModel):
    hosted_zones: int
    public_hosted_zones: int
    private_hosted_zones: int
    record_sets: int
    health_checks: int
    healthy_health_checks: int
    unhealthy_health_checks: int
    unknown_health_checks: int
    traffic_policies: int = 0
    policy_records: int = 0
    registered_domains: int = 0
    pending_domain_requests: int = 0
