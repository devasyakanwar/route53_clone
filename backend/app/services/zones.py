import re
import uuid
from typing import Literal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.errors import ApiError, FieldError, invalid_input, not_found_zone
from app.models import Change, HostedZone, RecordSet, ResourceRecord, User, ZoneTag, ZoneVpc
from app.schemas.zones import Tag, Vpc, ZoneCreate, ZoneDetail, ZoneOut
from app.services.changes import record_change
from app.services.ids import new_zone_id
from app.services.nameservers import NS_TTL, SOA_TTL, name_servers_for, soa_value
from app.services.validation import ValidationError, normalize_zone_name

MAX_COMMENT = 256
MAX_TAGS = 50
_VPC_RE = re.compile(r"^vpc-[0-9a-f]{8,17}$")


def zone_out(zone: HostedZone) -> ZoneOut:
    return ZoneOut(
        id=zone.id,
        name=zone.name,
        comment=zone.comment,
        private_zone=zone.is_private,
        record_count=zone.record_count,
        caller_reference=zone.caller_reference,
        created_at=zone.created_at,
        updated_at=zone.updated_at,
    )


def zone_detail(zone: HostedZone) -> ZoneDetail:
    return ZoneDetail(
        **zone_out(zone).model_dump(),
        name_servers=list(zone.name_servers),
        vpcs=[Vpc(vpc_id=v.vpc_id, vpc_region=v.vpc_region) for v in zone.vpcs],
        tags=[Tag(key=t.key, value=t.value) for t in zone.tags],
    )


def get_zone(db: Session, user: User, zone_id: str) -> HostedZone:
    zone = db.get(HostedZone, zone_id)
    if zone is None or zone.owner_id != user.id:
        raise not_found_zone(zone_id)
    return zone


SortField = Literal["name", "type", "record_count", "comment", "id", "created_at"]


def list_zones(
    db: Session,
    user: User,
    *,
    search: str | None = None,
    zone_type: str | None = None,
    sort: SortField = "name",
    order: Literal["asc", "desc"] = "asc",
    page: int = 1,
    page_size: int = 50,
) -> tuple[list[HostedZone], int]:
    zones = list(db.scalars(select(HostedZone).where(HostedZone.owner_id == user.id)))
    if search:
        s = search.lower().strip()
        zones = [z for z in zones if s in z.name or s in (z.comment or "").lower() or s in z.id.lower()]
    if zone_type in ("public", "private"):
        zones = [z for z in zones if z.is_private == (zone_type == "private")]

    def key(z: HostedZone) -> object:
        match sort:
            case "type":
                return (z.is_private, z.name)
            case "record_count":
                return (z.record_count, z.name)
            case "comment":
                return ((z.comment or "").lower(), z.name)
            case "id":
                return z.id
            case "created_at":
                return z.created_at
            case _:
                return (z.name, z.id)

    zones.sort(key=key, reverse=order == "desc")
    total = len(zones)
    start = (page - 1) * page_size
    return zones[start : start + page_size], total


def _validate_comment(comment: str | None) -> str | None:
    if comment is None:
        return None
    comment = comment.strip()
    if len(comment) > MAX_COMMENT:
        raise invalid_input(f"The description can have up to {MAX_COMMENT} characters.", "comment")
    return comment or None


def _validate_tags(tags: list[Tag]) -> list[Tag]:
    if len(tags) > MAX_TAGS:
        raise invalid_input(f"You can add up to {MAX_TAGS} tags.", "tags")
    seen: set[str] = set()
    for i, tag in enumerate(tags):
        key = tag.key.strip()
        if not key:
            raise invalid_input("Enter a tag key.", f"tags[{i}].key")
        if len(key) > 128:
            raise invalid_input("Tag keys can have up to 128 characters.", f"tags[{i}].key")
        if key.lower().startswith("aws:"):
            raise invalid_input('Tag keys can\'t start with "aws:".', f"tags[{i}].key")
        if len(tag.value) > 256:
            raise invalid_input("Tag values can have up to 256 characters.", f"tags[{i}].value")
        if key in seen:
            raise invalid_input("You must specify a unique key for each tag.", f"tags[{i}].key")
        seen.add(key)
    return [Tag(key=t.key.strip(), value=t.value) for t in tags]


def create_zone(db: Session, user: User, data: ZoneCreate) -> tuple[HostedZone, Change]:
    try:
        name = normalize_zone_name(data.name)
    except ValidationError as e:
        raise invalid_input(str(e), "name") from None
    comment = _validate_comment(data.comment)
    tags = _validate_tags(data.tags)

    vpcs: list[Vpc] = []
    if data.private_zone:
        if not data.vpcs:
            raise invalid_input("A private hosted zone must be associated with at least one VPC.", "vpcs")
        seen: set[tuple[str, str]] = set()
        for i, vpc in enumerate(data.vpcs):
            if not _VPC_RE.match(vpc.vpc_id):
                raise invalid_input(f"{vpc.vpc_id} is not a valid VPC ID.", f"vpcs[{i}].vpc_id")
            if not vpc.vpc_region:
                raise invalid_input("Choose a Region.", f"vpcs[{i}].vpc_region")
            if (vpc.vpc_id, vpc.vpc_region) in seen:
                raise invalid_input("Each VPC can be associated only once.", f"vpcs[{i}].vpc_id")
            seen.add((vpc.vpc_id, vpc.vpc_region))
            vpcs.append(vpc)
    elif data.vpcs:
        raise invalid_input("You can associate VPCs only with private hosted zones.", "vpcs")

    caller_reference = data.caller_reference or str(uuid.uuid4())
    existing = db.scalar(
        select(HostedZone).where(HostedZone.owner_id == user.id, HostedZone.caller_reference == caller_reference)
    )
    if existing is not None:
        raise ApiError(
            409,
            "HostedZoneAlreadyExists",
            "The hosted zone you're trying to create already exists (the caller reference has been used).",
        )

    zone_id = new_zone_id()
    name_servers = name_servers_for(zone_id)
    zone = HostedZone(
        id=zone_id,
        owner_id=user.id,
        name=name,
        comment=comment,
        is_private=data.private_zone,
        caller_reference=caller_reference,
        name_servers=name_servers,
        record_count=2,
    )
    zone.vpcs = [ZoneVpc(vpc_id=v.vpc_id, vpc_region=v.vpc_region) for v in vpcs]
    zone.tags = [ZoneTag(key=t.key, value=t.value) for t in tags]
    zone.record_sets = [
        RecordSet(
            name=name,
            type="NS",
            ttl=NS_TTL,
            is_default=True,
            resource_records=[ResourceRecord(value=ns, position=i) for i, ns in enumerate(name_servers)],
        ),
        RecordSet(
            name=name,
            type="SOA",
            ttl=SOA_TTL,
            is_default=True,
            resource_records=[ResourceRecord(value=soa_value(name_servers), position=0)],
        ),
    ]
    db.add(zone)
    db.flush()
    change = record_change(
        db, zone.id, "CreateHostedZone", {"action": "CreateHostedZone", "name": name, "private": data.private_zone}
    )
    db.commit()
    return zone, change


def update_comment(db: Session, user: User, zone_id: str, comment: str | None) -> HostedZone:
    zone = get_zone(db, user, zone_id)
    zone.comment = _validate_comment(comment)
    db.commit()
    return zone


def replace_tags(db: Session, user: User, zone_id: str, tags: list[Tag]) -> HostedZone:
    zone = get_zone(db, user, zone_id)
    cleaned = _validate_tags(tags)
    zone.tags.clear()
    db.flush()
    zone.tags.extend(ZoneTag(key=t.key, value=t.value) for t in cleaned)
    db.commit()
    db.refresh(zone)
    return zone


def _has_custom_records(db: Session, zone: HostedZone) -> bool:
    return (
        db.scalar(select(RecordSet.id).where(RecordSet.zone_id == zone.id, RecordSet.is_default.is_(False)).limit(1))
        is not None
    )


def delete_zone(db: Session, user: User, zone_id: str) -> Change:
    return delete_zones(db, user, [zone_id])[0]


def delete_zones(db: Session, user: User, zone_ids: list[str]) -> list[Change]:
    """Delete one or more hosted zones atomically: if any zone still has records, nothing is deleted."""
    if not zone_ids:
        raise invalid_input("Choose at least one hosted zone to delete.", "ids")
    zones = [get_zone(db, user, zone_id) for zone_id in dict.fromkeys(zone_ids)]
    not_empty = [(i, z) for i, z in enumerate(zones) if _has_custom_records(db, z)]
    if not_empty:
        raise ApiError(
            400,
            "HostedZoneNotEmpty",
            "The specified hosted zone contains non-required resource record sets and so cannot be deleted."
            if len(zones) == 1
            else f"{len(not_empty)} of the selected hosted zones contain non-required resource record sets "
            "and so cannot be deleted. No hosted zones were deleted.",
            field=None if len(zones) == 1 else f"ids[{not_empty[0][0]}]",
            errors=[
                FieldError(
                    f"Before you delete {z.name.rstrip('.')}, you must delete all records except the default NS "
                    "and SOA records.",
                    f"ids[{i}]",
                )
                for i, z in not_empty
            ],
        )
    changes = []
    for zone in zones:
        changes.append(
            record_change(db, None, "DeleteHostedZone", {"action": "DeleteHostedZone", "id": zone.id, "name": zone.name})
        )
        db.delete(zone)
    db.commit()
    return changes
