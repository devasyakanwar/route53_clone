from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base

RECORD_TYPES = ("A", "AAAA", "CAA", "CNAME", "DS", "MX", "NAPTR", "NS", "PTR", "SOA", "SPF", "SRV", "TXT")


def utcnow() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    display_name: Mapped[str] = mapped_column(String, nullable=False)
    account_id: Mapped[str] = mapped_column(String(12), nullable=False)
    password_hash: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)

    sessions: Mapped[list[UserSession]] = relationship(
        back_populates="user", cascade="all, delete-orphan", passive_deletes=True
    )


class UserSession(Base):
    __tablename__ = "sessions"

    token: Mapped[str] = mapped_column(String, primary_key=True)  # sha256 of the cookie value
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)

    user: Mapped[User] = relationship(back_populates="sessions")


class HostedZone(Base):
    __tablename__ = "hosted_zones"
    __table_args__ = (
        UniqueConstraint("owner_id", "caller_reference"),
        Index("ix_zones_owner_name", "owner_id", "name"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    comment: Mapped[str | None] = mapped_column(Text)
    is_private: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    caller_reference: Mapped[str] = mapped_column(String, nullable=False)
    record_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    name_servers: Mapped[list[str]] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    vpcs: Mapped[list[ZoneVpc]] = relationship(
        back_populates="zone", cascade="all, delete-orphan", passive_deletes=True, order_by="ZoneVpc.id"
    )
    tags: Mapped[list[ZoneTag]] = relationship(
        back_populates="zone", cascade="all, delete-orphan", passive_deletes=True, order_by="ZoneTag.key"
    )
    record_sets: Mapped[list[RecordSet]] = relationship(
        back_populates="zone", cascade="all, delete-orphan", passive_deletes=True
    )


class ZoneVpc(Base):
    __tablename__ = "zone_vpcs"
    __table_args__ = (UniqueConstraint("zone_id", "vpc_id", "vpc_region"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    zone_id: Mapped[str] = mapped_column(ForeignKey("hosted_zones.id", ondelete="CASCADE"), nullable=False)
    vpc_id: Mapped[str] = mapped_column(String, nullable=False)
    vpc_region: Mapped[str] = mapped_column(String, nullable=False)

    zone: Mapped[HostedZone] = relationship(back_populates="vpcs")


class ZoneTag(Base):
    __tablename__ = "zone_tags"

    zone_id: Mapped[str] = mapped_column(ForeignKey("hosted_zones.id", ondelete="CASCADE"), primary_key=True)
    key: Mapped[str] = mapped_column(String, primary_key=True)
    value: Mapped[str] = mapped_column(String, default="", nullable=False)

    zone: Mapped[HostedZone] = relationship(back_populates="tags")


class RecordSet(Base):
    __tablename__ = "record_sets"
    __table_args__ = (
        CheckConstraint("type IN (" + ",".join(f"'{t}'" for t in RECORD_TYPES) + ")", name="ck_record_type"),
        # SQLite treats NULLs as distinct in UNIQUE constraints, so COALESCE in an expression index.
        Index(
            "ux_record_identity",
            "zone_id",
            "name",
            "type",
            func.coalesce(text("set_identifier"), ""),
            unique=True,
        ),
        Index("ix_records_zone_type", "zone_id", "type"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    zone_id: Mapped[str] = mapped_column(ForeignKey("hosted_zones.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    type: Mapped[str] = mapped_column(String, nullable=False)
    ttl: Mapped[int | None] = mapped_column(Integer)
    set_identifier: Mapped[str | None] = mapped_column(String)
    routing_policy: Mapped[str] = mapped_column(String, default="SIMPLE", nullable=False)
    weight: Mapped[int | None] = mapped_column(Integer)
    region: Mapped[str | None] = mapped_column(String)
    failover: Mapped[str | None] = mapped_column(String)
    geo_location: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    multivalue: Mapped[bool | None] = mapped_column(Boolean)
    # Extra routing data for IP-based and geoproximity policies (stored, not evaluated).
    cidr_routing: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    geoproximity: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    health_check_id: Mapped[str | None] = mapped_column(String)
    alias_target: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    zone: Mapped[HostedZone] = relationship(back_populates="record_sets")
    resource_records: Mapped[list[ResourceRecord]] = relationship(
        back_populates="record_set",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="ResourceRecord.position",
    )

    @property
    def values(self) -> list[str]:
        return [rr.value for rr in self.resource_records]


class ResourceRecord(Base):
    __tablename__ = "resource_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    record_set_id: Mapped[int] = mapped_column(ForeignKey("record_sets.id", ondelete="CASCADE"), nullable=False)
    value: Mapped[str] = mapped_column(Text, nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False)

    record_set: Mapped[RecordSet] = relationship(back_populates="resource_records")


HEALTH_CHECK_TYPES = (
    "HTTP",
    "HTTPS",
    "HTTP_STR_MATCH",
    "HTTPS_STR_MATCH",
    "TCP",
    "CALCULATED",
    "CLOUDWATCH_METRIC",
)


class HealthCheck(Base):
    __tablename__ = "health_checks"
    __table_args__ = (
        UniqueConstraint("owner_id", "caller_reference"),
        CheckConstraint("type IN (" + ",".join(f"'{t}'" for t in HEALTH_CHECK_TYPES) + ")", name="ck_health_check_type"),
        Index("ix_health_checks_owner", "owner_id"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)  # UUID, like Route 53
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    caller_reference: Mapped[str] = mapped_column(String, nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    type: Mapped[str] = mapped_column(String, nullable=False)
    # Endpoint checks
    ip_address: Mapped[str | None] = mapped_column(String)
    fqdn: Mapped[str | None] = mapped_column(String)
    port: Mapped[int | None] = mapped_column(Integer)
    resource_path: Mapped[str | None] = mapped_column(String)
    search_string: Mapped[str | None] = mapped_column(String)
    request_interval: Mapped[int] = mapped_column(Integer, default=30, nullable=False)
    failure_threshold: Mapped[int] = mapped_column(Integer, default=3, nullable=False)
    measure_latency: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    enable_sni: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    regions: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    # Calculated checks
    child_health_checks: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    health_threshold: Mapped[int | None] = mapped_column(Integer)
    # CloudWatch alarm checks: {"alarm_name", "region", "insufficient_data_status"}
    cloudwatch_alarm: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    inverted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    disabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # "Get notified when health check fails": {"sns_topic", "emails": [...]} or NULL
    notification: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

    tags: Mapped[list[HealthCheckTag]] = relationship(
        back_populates="health_check", cascade="all, delete-orphan", passive_deletes=True, order_by="HealthCheckTag.key"
    )


class HealthCheckTag(Base):
    __tablename__ = "health_check_tags"

    health_check_id: Mapped[str] = mapped_column(
        ForeignKey("health_checks.id", ondelete="CASCADE"), primary_key=True
    )
    key: Mapped[str] = mapped_column(String, primary_key=True)
    value: Mapped[str] = mapped_column(String, default="", nullable=False)

    health_check: Mapped[HealthCheck] = relationship(back_populates="tags")


class Change(Base):
    __tablename__ = "changes"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    zone_id: Mapped[str | None] = mapped_column(ForeignKey("hosted_zones.id", ondelete="SET NULL"))
    comment: Mapped[str | None] = mapped_column(Text)
    submitted_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)
    payload: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
