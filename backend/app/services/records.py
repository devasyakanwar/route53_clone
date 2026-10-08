"""Record sets and the atomic ChangeResourceRecordSets engine (PLAN §4, §6)."""

from __future__ import annotations

from dataclasses import dataclass, field, replace
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.errors import ApiError, FieldError
from app.models import RECORD_TYPES, Change, HealthCheck, HostedZone, RecordSet, ResourceRecord
from app.schemas.records import (
    AliasTarget,
    ChangeBatch,
    ChangeIn,
    CidrRouting,
    GeoLocation,
    Geoproximity,
    RecordSetIn,
    RecordSetOut,
)
from app.services.changes import record_change
from app.services.validation import (
    ValidationError,
    escape_name,
    is_domain_value,
    normalize_record_name,
    validate_ttl,
    validate_values,
)

ROUTING_POLICIES = ("SIMPLE", "WEIGHTED", "GEOLOCATION", "LATENCY", "FAILOVER", "MULTIVALUE", "IP_BASED", "GEOPROXIMITY")
ALIAS_TYPES = ("A", "AAAA", "CAA", "CNAME", "MX", "NAPTR", "PTR", "SPF", "SRV", "TXT")
# Order used when sorting records of the same name, like the console (SOA/NS first at the apex).
_TYPE_ORDER = {t: i for i, t in enumerate(("NS", "SOA", *[t for t in RECORD_TYPES if t not in ("NS", "SOA")]))}

Key = tuple[str, str, str]


@dataclass
class Draft:
    """A normalised record set, independent of the ORM, so a batch can be simulated before writing."""

    name: str
    type: str
    ttl: int | None = None
    values: list[str] = field(default_factory=list)
    routing_policy: str = "SIMPLE"
    set_identifier: str | None = None
    weight: int | None = None
    region: str | None = None
    failover: str | None = None
    geo_location: dict[str, Any] | None = None
    multivalue: bool | None = None
    cidr_routing: dict[str, Any] | None = None
    geoproximity: dict[str, Any] | None = None
    health_check_id: str | None = None
    alias_target: dict[str, Any] | None = None
    is_default: bool = False

    @property
    def key(self) -> Key:
        return (self.name, self.type, self.set_identifier or "")

    def describe(self) -> str:
        parts = [f"name='{self.name}'", f"type='{self.type}'"]
        if self.set_identifier:
            parts.append(f"set-identifier='{self.set_identifier}'")
        return "[" + ", ".join(parts) + "]"

    @classmethod
    def from_row(cls, row: RecordSet) -> Draft:
        return cls(
            name=row.name,
            type=row.type,
            ttl=row.ttl,
            values=row.values,
            routing_policy=row.routing_policy,
            set_identifier=row.set_identifier,
            weight=row.weight,
            region=row.region,
            failover=row.failover,
            geo_location=row.geo_location,
            multivalue=row.multivalue,
            cidr_routing=row.cidr_routing,
            geoproximity=row.geoproximity,
            health_check_id=row.health_check_id,
            alias_target=row.alias_target,
            is_default=row.is_default,
        )


# --------------------------------------------------------------------------- output


def record_out(row: RecordSet) -> RecordSetOut:
    return RecordSetOut(
        id=row.id,
        zone_id=row.zone_id,
        name=escape_name(row.name),
        type=row.type,
        ttl=row.ttl,
        values=row.values,
        routing_policy=row.routing_policy,
        set_identifier=row.set_identifier,
        weight=row.weight,
        region=row.region,
        failover=row.failover,
        geo_location=GeoLocation(**row.geo_location) if row.geo_location else None,
        multivalue=row.multivalue,
        cidr_routing=CidrRouting(**row.cidr_routing) if row.cidr_routing else None,
        geoproximity=Geoproximity(**row.geoproximity) if row.geoproximity else None,
        health_check_id=row.health_check_id,
        alias_target=AliasTarget(**row.alias_target) if row.alias_target else None,
        is_default=row.is_default,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def draft_to_input(d: Draft) -> RecordSetIn:
    return RecordSetIn.model_validate(
        {k: v for k, v in d.__dict__.items() if k != "is_default"} | {"name": escape_name(d.name)}
    )


def _sort_key(row: RecordSet) -> tuple[Any, ...]:
    # Sort like the console: by name read left-to-right, apex first, then by type and Record ID.
    zone_name = row.zone.name if row.zone else ""
    return (row.name != zone_name, row.name, _TYPE_ORDER.get(row.type, 99), row.set_identifier or "")


# --------------------------------------------------------------------------- queries


def _zone_rows(db: Session, zone: HostedZone) -> list[RecordSet]:
    return list(
        db.scalars(
            select(RecordSet)
            .where(RecordSet.zone_id == zone.id)
            .options(selectinload(RecordSet.resource_records))
        )
    )


def list_records(
    db: Session,
    zone: HostedZone,
    *,
    search: str | None = None,
    rtype: str | None = None,
    routing_policy: str | None = None,
    alias: bool | None = None,
    page: int = 1,
    page_size: int = 300,
) -> tuple[list[RecordSet], int]:
    rows = _zone_rows(db, zone)
    if rtype:
        rows = [r for r in rows if r.type == rtype.upper()]
    if routing_policy:
        rows = [r for r in rows if r.routing_policy == routing_policy.upper()]
    if alias is not None:
        rows = [r for r in rows if (r.alias_target is not None) == alias]
    if search:
        s = search.lower().strip()
        rows = [
            r
            for r in rows
            if s in r.name
            or s == r.type.lower()
            or any(s in v.lower() for v in r.values)
            or s in (r.set_identifier or "").lower()
            or (r.alias_target is not None and s in str(r.alias_target.get("dns_name", "")).lower())
        ]
    rows.sort(key=_sort_key)
    total = len(rows)
    start = (page - 1) * page_size
    return rows[start : start + page_size], total


def get_record(db: Session, zone: HostedZone, record_id: int) -> RecordSet:
    row = db.get(RecordSet, record_id)
    if row is None or row.zone_id != zone.id:
        raise ApiError(404, "NoSuchResourceRecordSet", f"No record found with ID: {record_id}")
    return row


# --------------------------------------------------------------------------- normalisation


def normalize_record_set(rs: RecordSetIn, zone_name: str, prefix: str) -> tuple[Draft | None, list[FieldError]]:
    errors: list[FieldError] = []

    def err(message: str, fld: str) -> None:
        errors.append(FieldError(message, f"{prefix}.{fld}"))

    rtype = rs.type.strip().upper()
    if rtype not in RECORD_TYPES:
        err(f"{rs.type} is not a supported record type.", "type")
        return None, errors

    try:
        name = normalize_record_name(rs.name, zone_name)
    except ValidationError as e:
        err(str(e), "name")
        return None, errors

    policy = (rs.routing_policy or "SIMPLE").strip().upper()
    if policy not in ROUTING_POLICIES:
        err(f"{rs.routing_policy} is not a valid routing policy.", "routing_policy")
        return None, errors

    d = Draft(name=name, type=rtype, routing_policy=policy, health_check_id=(rs.health_check_id or "").strip() or None)

    if rtype == "CNAME" and name == zone_name:
        err(
            f"RRSet of type CNAME with DNS name {name} is not permitted at apex in zone {zone_name}",
            "name",
        )
    if rtype == "SOA" and name != zone_name:
        err("SOA records can exist only at the zone apex.", "name")

    # Alias vs. value records
    if rs.alias_target is not None:
        if rtype not in ALIAS_TYPES:
            err(f"Alias records aren't supported for {rtype} records.", "alias_target")
        if policy == "MULTIVALUE":
            err("Multivalue answer records can't be alias records.", "alias_target")
        target = rs.alias_target.dns_name.strip().lower()
        if not target or not is_domain_value(target):
            err("Enter a valid endpoint to route traffic to.", "alias_target.dns_name")
        elif not target.endswith("."):
            target += "."
        if rs.ttl is not None:
            err("Alias records don't have a TTL. Route 53 uses the TTL of the alias target.", "ttl")
        d.alias_target = {
            "dns_name": target,
            "hosted_zone_id": rs.alias_target.hosted_zone_id.strip(),
            "evaluate_target_health": rs.alias_target.evaluate_target_health,
            "endpoint_type": rs.alias_target.endpoint_type,
            "region": rs.alias_target.region,
        }
    else:
        ttl_error = validate_ttl(rs.ttl)
        if ttl_error:
            err(ttl_error, "ttl")
        d.ttl = rs.ttl
        values, value_errors = validate_values(rtype, rs.values)
        for index, message in value_errors:
            err(message, "values" if index is None else f"values[{index}]")
        d.values = values

    # Routing policy specifics (stored, not evaluated)
    set_id = (rs.set_identifier or "").strip()
    if policy == "SIMPLE":
        if set_id:
            err("Record ID is only used with routing policies other than simple routing.", "set_identifier")
    else:
        if rtype == "SOA":
            err("SOA records support only simple routing.", "routing_policy")
        if not set_id:
            err("Enter a record ID. It must be unique among records with the same name and type.", "set_identifier")
        elif len(set_id) > 128:
            err("The record ID can have up to 128 characters.", "set_identifier")
        d.set_identifier = set_id or None

    if policy == "WEIGHTED":
        if rs.weight is None or not 0 <= rs.weight <= 255:
            err("Enter a weight between 0 and 255.", "weight")
        d.weight = rs.weight
    elif policy == "LATENCY":
        if not rs.region:
            err("Choose a Region.", "region")
        d.region = rs.region
    elif policy == "FAILOVER":
        failover = (rs.failover or "").upper()
        if failover not in ("PRIMARY", "SECONDARY"):
            err("Choose a failover record type: Primary or Secondary.", "failover")
        d.failover = failover or None
    elif policy == "GEOLOCATION":
        geo = rs.geo_location.model_dump(exclude_none=True) if rs.geo_location else {}
        if not geo:
            err("Choose a location.", "geo_location")
        d.geo_location = geo or None
    elif policy == "MULTIVALUE":
        d.multivalue = True
    elif policy == "IP_BASED":
        if rs.cidr_routing is None or not rs.cidr_routing.collection_id or not rs.cidr_routing.location_name:
            err("Choose a CIDR collection and location.", "cidr_routing")
        else:
            d.cidr_routing = rs.cidr_routing.model_dump()
    elif policy == "GEOPROXIMITY":
        geo_p = rs.geoproximity
        if geo_p is None or not (geo_p.aws_region or geo_p.local_zone_group or geo_p.coordinates):
            err("Choose an AWS Region, Local Zone group or coordinates.", "geoproximity")
        else:
            if geo_p.bias is not None and not -99 <= geo_p.bias <= 99:
                err("Bias must be between -99 and 99.", "geoproximity.bias")
            d.geoproximity = geo_p.model_dump(exclude_none=True)

    return (None, errors) if errors else (d, errors)


# --------------------------------------------------------------------------- change batches


def _apply_draft(row: RecordSet, d: Draft) -> None:
    row.ttl = d.ttl
    row.routing_policy = d.routing_policy
    row.set_identifier = d.set_identifier
    row.weight = d.weight
    row.region = d.region
    row.failover = d.failover
    row.geo_location = d.geo_location
    row.multivalue = d.multivalue
    row.cidr_routing = d.cidr_routing
    row.geoproximity = d.geoproximity
    row.health_check_id = d.health_check_id
    row.alias_target = d.alias_target
    row.is_default = d.is_default
    row.resource_records = [ResourceRecord(value=v, position=i) for i, v in enumerate(d.values)]


def apply_change_batch(db: Session, zone: HostedZone, batch: ChangeBatch) -> Change:
    """Validate the whole batch against a simulated zone, then write everything or nothing."""
    rows = {Draft.from_row(r).key: r for r in _zone_rows(db, zone)}
    state: dict[Key, Draft] = {k: Draft.from_row(r) for k, r in rows.items()}
    touched: set[Key] = set()
    first_change_for_name: dict[str, int] = {}
    errors: list[FieldError] = []
    health_check_ids: set[str] | None = None

    for i, ch in enumerate(batch.changes):
        prefix = f"changes[{i}]"
        draft, errs = normalize_record_set(ch.record_set, zone.name, prefix)
        if draft is None:
            # A DELETE only needs the identity; tolerate value errors so stale data can still be removed.
            if ch.action == "DELETE" and not any(e.field and e.field.endswith((".name", ".type")) for e in errs):
                draft = _identity_only(ch, zone.name)
            if draft is None:
                errors.extend(errs)
                continue
        if ch.action != "DELETE" and draft.health_check_id:
            if health_check_ids is None:
                health_check_ids = owned_health_check_ids(db, zone.owner_id)
            if draft.health_check_id not in health_check_ids:
                errors.append(
                    FieldError(
                        f"No health check exists with the specified ID {draft.health_check_id}.",
                        f"{prefix}.health_check_id",
                    )
                )
                continue
        key = draft.key
        current = state.get(key)
        first_change_for_name.setdefault(draft.name, i)

        if ch.action == "CREATE":
            if current is not None:
                errors.append(
                    FieldError(
                        f"Tried to create resource record set {draft.describe()} but it already exists",
                        f"{prefix}.name",
                    )
                )
                continue
            if draft.type == "SOA":
                errors.append(FieldError("A hosted zone can have only one SOA record. Edit the existing one.", f"{prefix}.type"))
                continue
            state[key] = draft
        elif ch.action == "UPSERT":
            if current is None and draft.type == "SOA":
                errors.append(FieldError("A hosted zone can have only one SOA record. Edit the existing one.", f"{prefix}.type"))
                continue
            if current is not None and current.is_default:
                draft = replace(draft, is_default=True)
            state[key] = draft
        else:  # DELETE
            if current is None:
                errors.append(
                    FieldError(
                        f"Tried to delete resource record set {draft.describe()} but it was not found",
                        f"{prefix}.name",
                    )
                )
                continue
            if current.is_default:
                errors.append(
                    FieldError(
                        "You can't delete the NS and SOA records that Route 53 created for the hosted zone.",
                        f"{prefix}.type",
                    )
                )
                continue
            del state[key]
        touched.add(key)

    if not errors:
        errors.extend(_check_zone_consistency(state, zone.name, first_change_for_name))

    if errors:
        raise ApiError(400, "InvalidChangeBatch", errors[0].message, errors[0].field, errors)

    for key in touched:
        row = rows.get(key)
        draft = state.get(key)
        if draft is None:
            if row is not None:
                db.delete(row)
        elif row is None:
            new_row = RecordSet(zone_id=zone.id, name=draft.name, type=draft.type)
            _apply_draft(new_row, draft)
            db.add(new_row)
        else:
            _apply_draft(row, draft)

    zone.record_count = len(state)
    change = record_change(db, zone.id, batch.comment, batch.model_dump(mode="json"))
    db.commit()
    return change


def owned_health_check_ids(db: Session, owner_id: int) -> set[str]:
    return set(db.scalars(select(HealthCheck.id).where(HealthCheck.owner_id == owner_id)))


def _identity_only(ch: ChangeIn, zone_name: str) -> Draft | None:
    try:
        name = normalize_record_name(ch.record_set.name, zone_name)
    except ValidationError:
        return None
    return Draft(
        name=name,
        type=ch.record_set.type.strip().upper(),
        set_identifier=(ch.record_set.set_identifier or "").strip() or None,
    )


def _check_zone_consistency(state: dict[Key, Draft], zone_name: str, first_change: dict[str, int]) -> list[FieldError]:
    errors: list[FieldError] = []
    by_name: dict[str, set[str]] = {}
    by_name_type: dict[tuple[str, str], set[str]] = {}
    for d in state.values():
        by_name.setdefault(d.name, set()).add(d.type)
        by_name_type.setdefault((d.name, d.type), set()).add(d.routing_policy)

    for name, types in by_name.items():
        if name not in first_change:
            continue
        if "CNAME" in types and len(types) > 1:
            errors.append(
                FieldError(
                    f"RRSet of type CNAME with DNS name {name} is not permitted as it conflicts with other records "
                    f"with the same DNS name in zone {zone_name}",
                    f"changes[{first_change[name]}].type",
                )
            )
    for (name, rtype), policies in by_name_type.items():
        if name in first_change and len(policies) > 1:
            errors.append(
                FieldError(
                    f"RRSet with DNS name {name}, type {rtype} can't use different routing policies. "
                    "All records with the same name and type must use the same routing policy.",
                    f"changes[{first_change[name]}].routing_policy",
                )
            )
    return errors
