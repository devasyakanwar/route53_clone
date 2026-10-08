"""Health checks (CreateHealthCheck / UpdateHealthCheck / DeleteHealthCheck semantics).

Nothing is actually probed. Status is simulated deterministically so the UI behaves like Route 53:
- a new check is "Unknown" for its first few seconds (no checker has reported yet);
- endpoint checks are Healthy, except endpoints in 203.0.113.0/24 (TEST-NET-3) or with a host name that
  starts with "down." or contains "unhealthy", which are Unhealthy;
- calculated checks are Healthy when at least `health_threshold` child checks are Healthy;
- CloudWatch alarm checks report their "insufficient data" setting (last known status counts as Healthy);
- disabled checks are always Healthy (as in Route 53), and "invert" flips Healthy/Unhealthy.
"""

from __future__ import annotations

import hashlib
import ipaddress
import re
import uuid
from datetime import timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.errors import ApiError, FieldError, invalid_input
from app.models import HealthCheck, HealthCheckTag, HostedZone, RecordSet, User, utcnow
from app.schemas.health_checks import (
    CheckerObservation,
    HealthCheckConfig,
    HealthCheckCreate,
    HealthCheckMetrics,
    HealthCheckOut,
    HealthCheckStatus,
    StatusPoint,
)
from app.schemas.zones import Tag
from app.services.validation import is_domain_value
from app.services.zones import MAX_TAGS

HEALTH_CHECKER_REGIONS: dict[str, str] = {
    "us-east-1": "US East (N. Virginia)",
    "us-west-1": "US West (N. California)",
    "us-west-2": "US West (Oregon)",
    "eu-west-1": "Europe (Ireland)",
    "ap-southeast-1": "Asia Pacific (Singapore)",
    "ap-southeast-2": "Asia Pacific (Sydney)",
    "ap-northeast-1": "Asia Pacific (Tokyo)",
    "sa-east-1": "South America (São Paulo)",
}
ENDPOINT_TYPES = ("HTTP", "HTTPS", "HTTP_STR_MATCH", "HTTPS_STR_MATCH", "TCP")
UNKNOWN_SECONDS = 8
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_UNHEALTHY_NET = ipaddress.ip_network("203.0.113.0/24")


# --------------------------------------------------------------------------- queries


def get_health_check(db: Session, user: User, health_check_id: str) -> HealthCheck:
    hc = db.get(HealthCheck, health_check_id)
    if hc is None or hc.owner_id != user.id:
        raise ApiError(404, "NoSuchHealthCheck", f"No health check exists with the specified ID {health_check_id}.")
    return hc


def list_health_checks(db: Session, user: User) -> list[HealthCheck]:
    return list(
        db.scalars(select(HealthCheck).where(HealthCheck.owner_id == user.id).order_by(HealthCheck.created_at))
    )


# --------------------------------------------------------------------------- status simulation


def _endpoint_healthy(hc: HealthCheck) -> bool:
    if hc.ip_address:
        try:
            if ipaddress.ip_address(hc.ip_address) in _UNHEALTHY_NET:
                return False
        except ValueError:
            pass
    host = (hc.fqdn or "").lower()
    return not (host.startswith("down.") or "unhealthy" in host)


def compute_status(hc: HealthCheck, by_id: dict[str, HealthCheck], _seen: frozenset[str] = frozenset()) -> str:
    if hc.disabled:
        return "Healthy"
    if (utcnow() - hc.created_at).total_seconds() < UNKNOWN_SECONDS:
        return "Unknown"
    if hc.type in ENDPOINT_TYPES:
        healthy = _endpoint_healthy(hc)
    elif hc.type == "CALCULATED":
        seen = _seen | {hc.id}
        children = [by_id[c] for c in hc.child_health_checks if c in by_id and c not in seen]
        healthy_children = sum(compute_status(c, by_id, seen) == "Healthy" for c in children)
        healthy = healthy_children >= (hc.health_threshold or 0)
    else:
        insufficient = (hc.cloudwatch_alarm or {}).get("insufficient_data_status", "LastKnownStatus")
        healthy = insufficient != "Unhealthy"
    if hc.inverted:
        healthy = not healthy
    return "Healthy" if healthy else "Unhealthy"


def describe(hc: HealthCheck, by_id: dict[str, HealthCheck]) -> str:
    """The console's Description column, e.g. https://example.com:443/health."""
    if hc.type in ENDPOINT_TYPES:
        scheme = "tcp" if hc.type == "TCP" else ("https" if hc.type.startswith("HTTPS") else "http")
        host = hc.fqdn or hc.ip_address or ""
        if hc.ip_address and ":" in hc.ip_address:
            host = f"[{hc.ip_address}]"
        path = "" if hc.type == "TCP" else (hc.resource_path or "/")
        return f"{scheme}://{host}:{hc.port}{path}"
    if hc.type == "CALCULATED":
        names = [by_id[c].name for c in hc.child_health_checks if c in by_id]
        return f"Calculated: at least {hc.health_threshold} of {len(names)} healthy ({', '.join(names)})"
    alarm = hc.cloudwatch_alarm or {}
    return f"CloudWatch alarm: {alarm.get('alarm_name', '-')} ({alarm.get('region', '-')})"


def alarms_text(hc: HealthCheck, status: str) -> str:
    if not hc.notification:
        return "No alarms configured"
    state = {"Healthy": "OK", "Unhealthy": "ALARM"}.get(status, "INSUFFICIENT_DATA")
    return f"1 of 1 in {state}"


def to_out(hc: HealthCheck, by_id: dict[str, HealthCheck]) -> HealthCheckOut:
    status = compute_status(hc, by_id)
    return HealthCheckOut(
        id=hc.id,
        caller_reference=hc.caller_reference,
        name=hc.name,
        type=hc.type,  # type: ignore[arg-type]
        ip_address=hc.ip_address,
        fqdn=hc.fqdn,
        port=hc.port,
        resource_path=hc.resource_path,
        search_string=hc.search_string,
        request_interval=hc.request_interval,  # type: ignore[arg-type]
        failure_threshold=hc.failure_threshold,
        measure_latency=hc.measure_latency,
        enable_sni=hc.enable_sni,
        regions=list(hc.regions),
        child_health_checks=list(hc.child_health_checks),
        health_threshold=hc.health_threshold,
        cloudwatch_alarm=hc.cloudwatch_alarm,  # type: ignore[arg-type]
        inverted=hc.inverted,
        disabled=hc.disabled,
        notification=hc.notification,  # type: ignore[arg-type]
        status=status,  # type: ignore[arg-type]
        description=describe(hc, by_id),
        alarms=alarms_text(hc, status),
        tags=[Tag(key=t.key, value=t.value) for t in hc.tags],
        version=hc.version,
        created_at=hc.created_at,
        updated_at=hc.updated_at,
    )


def index(db: Session, user: User) -> dict[str, HealthCheck]:
    return {hc.id: hc for hc in list_health_checks(db, user)}


def _seed(*parts: str) -> int:
    return int.from_bytes(hashlib.sha256("|".join(parts).encode()).digest()[:4], "big")


def checker_observations(hc: HealthCheck, by_id: dict[str, HealthCheck]) -> HealthCheckStatus:
    status = compute_status(hc, by_id)
    now = utcnow()
    observations = []
    if hc.type in ENDPOINT_TYPES and status != "Unknown":
        # Checkers report what they see on the wire; inversion only changes the health check's own status.
        reachable = _endpoint_healthy(hc)
        for region in hc.regions or list(HEALTH_CHECKER_REGIONS):
            n = _seed(hc.id, region)
            if hc.type == "TCP":
                detail = "Success: TCP connection established" if reachable else "Failure: Connection timed out."
            elif reachable:
                detail = "Success: HTTP Status Code 200, OK"
                if hc.search_string:
                    detail += f". Resolved search string \"{hc.search_string}\" in response body"
            else:
                detail = "Failure: Connection timed out. The endpoint or the internet connection is down, or requests are being blocked by your firewall."
            observations.append(
                CheckerObservation(
                    region=region,
                    region_name=HEALTH_CHECKER_REGIONS.get(region, region),
                    ip_address=f"15.177.{n % 64}.{(n >> 8) % 254 + 1}",
                    status=detail,
                    checked_at=now - timedelta(seconds=n % hc.request_interval),
                )
            )
    return HealthCheckStatus(id=hc.id, status=status, observations=observations)  # type: ignore[arg-type]


def metrics(hc: HealthCheck, by_id: dict[str, HealthCheck], minutes: int = 60) -> HealthCheckMetrics:
    """One point per minute for the last hour: percentage of checkers reporting healthy (and latency)."""
    now = utcnow().replace(second=0, microsecond=0)
    status = compute_status(hc, by_id)
    points = []
    for i in range(minutes, -1, -1):
        ts = now - timedelta(minutes=i)
        if ts < hc.created_at.replace(second=0, microsecond=0) or status == "Unknown":
            continue
        jitter = _seed(hc.id, ts.isoformat())
        pct = 100.0 if status == "Healthy" else 0.0
        if status == "Healthy" and jitter % 23 == 0:
            pct = 87.5  # an occasional single checker hiccup, as seen in real graphs
        latency = None
        if hc.measure_latency and hc.type in ENDPOINT_TYPES:
            latency = float(40 + jitter % 60)
        points.append(StatusPoint(timestamp=ts, healthy_percentage=pct, latency_ms=latency))
    return HealthCheckMetrics(id=hc.id, points=points)


# --------------------------------------------------------------------------- validation


def _validate(
    db: Session, user: User, cfg: HealthCheckConfig, existing: HealthCheck | None = None
) -> dict[str, Any]:
    def bad(message: str, field: str) -> ApiError:
        return invalid_input(message, field)

    name = cfg.name.strip()
    if not name:
        raise bad("Enter a name for the health check.", "name")
    if len(name) > 256:
        raise bad("The name can have up to 256 characters.", "name")
    if existing is not None and existing.type != cfg.type:
        # Route 53 can't change what a health check monitors or its protocol after creation.
        raise bad("You can't change the type or protocol of an existing health check.", "type")
    if not 1 <= cfg.failure_threshold <= 10:
        raise bad("The failure threshold must be between 1 and 10.", "failure_threshold")

    fields: dict[str, Any] = {
        "name": name,
        "type": cfg.type,
        "ip_address": None,
        "fqdn": None,
        "port": None,
        "resource_path": None,
        "search_string": None,
        "request_interval": cfg.request_interval,
        "failure_threshold": cfg.failure_threshold,
        "measure_latency": False,
        "enable_sni": False,
        "regions": [],
        "child_health_checks": [],
        "health_threshold": None,
        "cloudwatch_alarm": None,
        "inverted": cfg.inverted,
        "disabled": cfg.disabled,
        "notification": None,
    }

    if cfg.type in ENDPOINT_TYPES:
        ip = (cfg.ip_address or "").strip()
        fqdn = (cfg.fqdn or "").strip().rstrip(".").lower()
        if not ip and not fqdn:
            raise bad("Enter an IP address or a domain name.", "ip_address")
        if ip:
            try:
                parsed = ipaddress.ip_address(ip)
            except ValueError:
                raise bad(f"{ip} is not a valid IPv4 or IPv6 address.", "ip_address") from None
            if parsed.is_loopback or parsed.is_link_local or parsed.is_multicast or parsed.is_unspecified:
                raise bad("Route 53 can't check loopback, link-local, multicast or unspecified addresses.", "ip_address")
            fields["ip_address"] = str(parsed)
        if fqdn:
            if not is_domain_value(fqdn) or "*" in fqdn:
                raise bad(f"{fqdn} is not a valid domain name.", "fqdn")
            fields["fqdn"] = fqdn
        default_port = 443 if cfg.type.startswith("HTTPS") else 80
        port = cfg.port if cfg.port is not None else default_port
        if not 1 <= port <= 65535:
            raise bad("The port must be between 1 and 65535.", "port")
        fields["port"] = port
        if cfg.type != "TCP":
            path = (cfg.resource_path or "").strip()
            if path and not path.startswith("/"):
                path = "/" + path
            if len(path) > 255:
                raise bad("The path can have up to 255 characters.", "resource_path")
            fields["resource_path"] = path or "/"
        if cfg.type.endswith("STR_MATCH"):
            search = (cfg.search_string or "").strip()
            if not search:
                raise bad("Enter the string that Route 53 searches for in the response body.", "search_string")
            if len(search) > 255:
                raise bad("The search string can have up to 255 characters.", "search_string")
            fields["search_string"] = search
        regions = list(dict.fromkeys(cfg.regions))
        unknown = [r for r in regions if r not in HEALTH_CHECKER_REGIONS]
        if unknown:
            raise bad(f"{unknown[0]} isn't a health checker Region.", "regions")
        if regions and len(regions) < 3:
            raise bad("Choose at least three health checker Regions.", "regions")
        fields["regions"] = regions
        fields["measure_latency"] = cfg.measure_latency
        fields["enable_sni"] = cfg.type.startswith("HTTPS") if cfg.enable_sni is None else cfg.enable_sni
        if existing is not None:
            if existing.request_interval != cfg.request_interval:
                raise bad("You can't change the request interval of an existing health check.", "request_interval")
            if existing.measure_latency != cfg.measure_latency:
                raise bad("You can't change latency measurement of an existing health check.", "measure_latency")
    elif cfg.type == "CALCULATED":
        children = list(dict.fromkeys(cfg.child_health_checks))
        if not children:
            raise bad("Choose the health checks to monitor.", "child_health_checks")
        if len(children) > 256:
            raise bad("A calculated health check can monitor up to 256 health checks.", "child_health_checks")
        owned = index(db, user)
        for child in children:
            if child not in owned:
                raise bad(f"No health check exists with the ID {child}.", "child_health_checks")
            if existing is not None and child == existing.id:
                raise bad("A calculated health check can't monitor itself.", "child_health_checks")
        threshold = cfg.health_threshold if cfg.health_threshold is not None else len(children)
        if not 0 <= threshold <= len(children):
            raise bad(f"Enter a number between 0 and {len(children)}.", "health_threshold")
        fields["child_health_checks"] = children
        fields["health_threshold"] = threshold
    else:
        alarm = cfg.cloudwatch_alarm
        if alarm is None or not alarm.alarm_name.strip() or not alarm.region:
            raise bad("Choose a Region and a CloudWatch alarm.", "cloudwatch_alarm")
        fields["cloudwatch_alarm"] = alarm.model_dump()

    if cfg.notification is not None:
        topic = cfg.notification.sns_topic.strip()
        if not topic:
            raise bad("Enter an SNS topic name.", "notification.sns_topic")
        for i, email in enumerate(cfg.notification.emails):
            if not _EMAIL_RE.match(email.strip()):
                raise bad(f"{email} is not a valid email address.", f"notification.emails[{i}]")
        fields["notification"] = {"sns_topic": topic, "emails": [e.strip() for e in cfg.notification.emails]}
    return fields


def _validate_tags(tags: list[Tag]) -> list[Tag]:
    if len(tags) > MAX_TAGS:
        raise invalid_input(f"You can add up to {MAX_TAGS} tags.", "tags")
    keys = [t.key.strip() for t in tags]
    for i, key in enumerate(keys):
        if not key:
            raise invalid_input("Enter a tag key.", f"tags[{i}].key")
        if key in keys[:i]:
            raise invalid_input("You must specify a unique key for each tag.", f"tags[{i}].key")
    return [Tag(key=t.key.strip(), value=t.value) for t in tags]


# --------------------------------------------------------------------------- mutations


def create_health_check(db: Session, user: User, data: HealthCheckCreate) -> HealthCheck:
    fields = _validate(db, user, data)
    tags = _validate_tags(data.tags)
    caller_reference = data.caller_reference or str(uuid.uuid4())
    if db.scalar(
        select(HealthCheck.id).where(HealthCheck.owner_id == user.id, HealthCheck.caller_reference == caller_reference)
    ):
        raise ApiError(409, "HealthCheckAlreadyExists", "A health check with this caller reference already exists.")
    hc = HealthCheck(id=str(uuid.uuid4()), owner_id=user.id, caller_reference=caller_reference, **fields)
    hc.tags = [HealthCheckTag(key=t.key, value=t.value) for t in tags]
    db.add(hc)
    db.commit()
    return hc


def update_health_check(db: Session, user: User, health_check_id: str, data: HealthCheckConfig) -> HealthCheck:
    hc = get_health_check(db, user, health_check_id)
    for key, value in _validate(db, user, data, existing=hc).items():
        setattr(hc, key, value)
    hc.version += 1
    db.commit()
    return hc


def replace_tags(db: Session, user: User, health_check_id: str, tags: list[Tag]) -> HealthCheck:
    hc = get_health_check(db, user, health_check_id)
    cleaned = _validate_tags(tags)
    hc.tags.clear()
    db.flush()
    hc.tags.extend(HealthCheckTag(key=t.key, value=t.value) for t in cleaned)
    db.commit()
    db.refresh(hc)
    return hc


def _usage(db: Session, user: User, hc: HealthCheck, also_deleting: set[str]) -> str | None:
    """What still references this health check, ignoring calculated checks deleted in the same request."""
    zone_name = db.scalar(
        select(HostedZone.name)
        .join(RecordSet, RecordSet.zone_id == HostedZone.id)
        .where(HostedZone.owner_id == user.id, RecordSet.health_check_id == hc.id)
        .limit(1)
    )
    if zone_name:
        return f"a record in hosted zone {zone_name.rstrip('.')}"
    for other in list_health_checks(db, user):
        if other.id not in also_deleting and hc.id in other.child_health_checks:
            return f"calculated health check {other.name}"
    return None


def delete_health_checks(db: Session, user: User, ids: list[str]) -> int:
    """Delete one or more health checks atomically; fails if any is still referenced."""
    if not ids:
        raise invalid_input("Choose at least one health check to delete.", "ids")
    checks = [get_health_check(db, user, i) for i in dict.fromkeys(ids)]
    deleting = {hc.id for hc in checks}
    errors = []
    for i, hc in enumerate(checks):
        usage = _usage(db, user, hc, deleting)
        if usage:
            errors.append(FieldError(f"Health check {hc.name} is still used by {usage}.", f"ids[{i}]"))
    if errors:
        raise ApiError(
            400,
            "HealthCheckInUse",
            errors[0].message if len(errors) == 1 else f"{len(errors)} health checks are still in use. No health checks were deleted.",
            errors[0].field,
            errors,
        )
    for hc in checks:
        db.delete(hc)
    db.commit()
    return len(checks)


