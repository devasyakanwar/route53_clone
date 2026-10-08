from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.common import ChangeInfo


class Vpc(BaseModel):
    vpc_id: str
    vpc_region: str


class Tag(BaseModel):
    key: str
    value: str = ""


class ZoneCreate(BaseModel):
    name: str
    comment: str | None = None
    private_zone: bool = False
    vpcs: list[Vpc] = Field(default_factory=list)
    tags: list[Tag] = Field(default_factory=list)
    caller_reference: str | None = None


class ZoneUpdate(BaseModel):
    comment: str | None = None


class TagsReplace(BaseModel):
    tags: list[Tag]


class ZoneBatchDelete(BaseModel):
    ids: list[str] = Field(min_length=1, max_length=100)


class ZoneBatchDeleteResponse(BaseModel):
    changes: list[ChangeInfo]


class ZoneOut(BaseModel):
    id: str
    name: str
    comment: str | None
    private_zone: bool
    record_count: int
    created_by: str = "Route 53"
    caller_reference: str
    created_at: datetime
    updated_at: datetime


class ZoneDetail(ZoneOut):
    name_servers: list[str]
    vpcs: list[Vpc]
    tags: list[Tag]


class ZoneList(BaseModel):
    items: list[ZoneOut]
    total: int
    page: int
    page_size: int


class DelegationSet(BaseModel):
    name_servers: list[str]


class ZoneCreateResponse(BaseModel):
    hosted_zone: ZoneDetail
    change_info: ChangeInfo
    delegation_set: DelegationSet
