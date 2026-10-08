from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.common import ChangeInfo


class AliasTarget(BaseModel):
    dns_name: str
    hosted_zone_id: str = ""
    evaluate_target_health: bool = False
    # Console-only metadata: which "Route traffic to" endpoint type and region were chosen.
    endpoint_type: str | None = None
    region: str | None = None


class GeoLocation(BaseModel):
    continent: str | None = None
    country: str | None = None
    subdivision: str | None = None


class CidrRouting(BaseModel):
    collection_id: str
    location_name: str


class Coordinates(BaseModel):
    latitude: str
    longitude: str


class Geoproximity(BaseModel):
    aws_region: str | None = None
    local_zone_group: str | None = None
    coordinates: Coordinates | None = None
    bias: int | None = None


class RecordSetIn(BaseModel):
    name: str
    type: str
    ttl: int | None = None
    values: list[str] = Field(default_factory=list)
    routing_policy: str = "SIMPLE"
    set_identifier: str | None = None
    weight: int | None = None
    region: str | None = None
    failover: str | None = None
    geo_location: GeoLocation | None = None
    multivalue: bool | None = None
    cidr_routing: CidrRouting | None = None
    geoproximity: Geoproximity | None = None
    health_check_id: str | None = None
    alias_target: AliasTarget | None = None


class ChangeIn(BaseModel):
    action: Literal["CREATE", "UPSERT", "DELETE"]
    record_set: RecordSetIn


class ChangeBatch(BaseModel):
    comment: str | None = None
    changes: list[ChangeIn] = Field(min_length=1)


class RecordSetOut(BaseModel):
    id: int
    zone_id: str
    name: str
    type: str
    ttl: int | None
    values: list[str]
    routing_policy: str
    set_identifier: str | None
    weight: int | None
    region: str | None
    failover: str | None
    geo_location: GeoLocation | None
    multivalue: bool | None
    cidr_routing: CidrRouting | None
    geoproximity: Geoproximity | None
    health_check_id: str | None
    alias_target: AliasTarget | None
    is_default: bool
    created_at: datetime
    updated_at: datetime


class RecordSetList(BaseModel):
    items: list[RecordSetOut]
    total: int
    page: int
    page_size: int


class ChangeResponse(BaseModel):
    change_info: ChangeInfo


class ImportRequest(BaseModel):
    zone_file: str
    comment: str | None = None


class ImportResponse(BaseModel):
    record_sets: list[RecordSetIn]
    skipped: list[str]
    change_info: ChangeInfo | None = None
