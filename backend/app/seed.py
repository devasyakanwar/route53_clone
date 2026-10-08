"""Demo data: `python -m app.seed` loads it, `python -m app.seed --reset` wipes and reloads it."""

import argparse
from datetime import timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import Base, SessionLocal, engine, init_db
from app.models import HealthCheck, User, utcnow
from app.schemas.health_checks import HealthCheckCreate, Notification
from app.schemas.records import ChangeBatch, ChangeIn, RecordSetIn
from app.schemas.zones import Tag, Vpc, ZoneCreate
from app.services.auth import hash_password
from app.services.health_checks import create_health_check
from app.services.records import apply_change_batch
from app.services.zones import create_zone

DEMO_EMAIL = "demo@example.com"
DEMO_PASSWORD = "demo"

ZONES: list[dict[str, Any]] = [
    {
        "zone": ZoneCreate(
            name="example.com",
            comment="Production website",
            caller_reference="seed-example-com",
            tags=[Tag(key="Environment", value="production"), Tag(key="Owner", value="web-team")],
        ),
        "records": [
            {"name": "example.com", "type": "A", "ttl": 300, "values": ["192.0.2.10", "192.0.2.11"]},
            {"name": "example.com", "type": "MX", "ttl": 3600, "values": ["10 mail.example.com", "20 mail2.example.com"]},
            {"name": "example.com", "type": "TXT", "ttl": 300, "values": ['"v=spf1 include:_spf.example.com ~all"']},
            {"name": "example.com", "type": "CAA", "ttl": 3600, "values": ['0 issue "amazon.com"', '0 iodef "mailto:security@example.com"']},
            {"name": "www.example.com", "type": "CNAME", "ttl": 300, "values": ["example.com"]},
            {"name": "ipv6.example.com", "type": "AAAA", "ttl": 300, "values": ["2001:db8:85a3::8a2e:370:7334"]},
            {"name": "_xmpp-server._tcp.example.com", "type": "SRV", "ttl": 300, "values": ["1 10 5269 xmpp-server.example.com"]},
            {"name": "api.example.com", "type": "A", "ttl": 60, "values": ["198.51.100.20"],
             "routing_policy": "WEIGHTED", "set_identifier": "api-blue", "weight": 80, "health_check": "api-blue"},
            {"name": "api.example.com", "type": "A", "ttl": 60, "values": ["198.51.100.21"],
             "routing_policy": "WEIGHTED", "set_identifier": "api-green", "weight": 20, "health_check": "api-green"},
            {"name": "cdn.example.com", "type": "A",
             "alias_target": {"dns_name": "d111111abcdef8.cloudfront.net", "hosted_zone_id": "Z2FDTNDATAQYW2",
                              "evaluate_target_health": False, "endpoint_type": "cloudfront"}},
            {"name": "*.dev.example.com", "type": "A", "ttl": 300, "values": ["203.0.113.5"]},
        ],
    },
    {
        "zone": ZoneCreate(name="mycompany.io", comment="Corporate domain", caller_reference="seed-mycompany-io"),
        "records": [
            {"name": "mycompany.io", "type": "A", "ttl": 300, "values": ["203.0.113.50"]},
            {"name": "mycompany.io", "type": "MX", "ttl": 300, "values": ["1 aspmx.l.google.com", "5 alt1.aspmx.l.google.com"]},
            {"name": "_dmarc.mycompany.io", "type": "TXT", "ttl": 300, "values": ['"v=DMARC1; p=quarantine; rua=mailto:dmarc@mycompany.io"']},
            {"name": "eu.mycompany.io", "type": "NS", "ttl": 172800,
             "values": ["ns-101.awsdns-12.com", "ns-700.awsdns-23.net", "ns-1200.awsdns-21.org", "ns-1800.awsdns-33.co.uk"]},
            {"name": "app.mycompany.io", "type": "A", "ttl": 60, "values": ["198.51.100.40"],
             "routing_policy": "LATENCY", "set_identifier": "app-us-east-1", "region": "us-east-1"},
            {"name": "app.mycompany.io", "type": "A", "ttl": 60, "values": ["198.51.100.41"],
             "routing_policy": "LATENCY", "set_identifier": "app-eu-west-1", "region": "eu-west-1"},
            {"name": "status.mycompany.io", "type": "CNAME", "ttl": 300, "values": ["mycompany.statuspage.io"]},
        ],
    },
    {
        "zone": ZoneCreate(
            name="internal.corp",
            comment="Internal services",
            private_zone=True,
            vpcs=[Vpc(vpc_id="vpc-0a1b2c3d", vpc_region="us-east-1")],
            caller_reference="seed-internal-corp",
            tags=[Tag(key="Environment", value="internal")],
        ),
        "records": [
            {"name": "db.internal.corp", "type": "A", "ttl": 60, "values": ["10.0.1.25"]},
            {"name": "cache.internal.corp", "type": "A", "ttl": 60, "values": ["10.0.1.40", "10.0.1.41"],
             "routing_policy": "MULTIVALUE", "set_identifier": "cache-1"},
            {"name": "25.1.0.10.internal.corp", "type": "PTR", "ttl": 300, "values": ["db.internal.corp"]},
            {"name": "_ldap._tcp.internal.corp", "type": "SRV", "ttl": 300, "values": ["0 100 389 ldap.internal.corp"]},
        ],
    },
]


def seed(db: Session) -> None:
    user = db.scalar(select(User).where(User.email == DEMO_EMAIL))
    if user is None:
        user = User(
            email=DEMO_EMAIL,
            display_name="demo-user",
            account_id="123456789012",
            password_hash=hash_password(DEMO_PASSWORD),
        )
        db.add(user)
        db.commit()
    checks = seed_health_checks(db, user)
    for spec in ZONES:
        zone, _ = create_zone(db, user, spec["zone"])
        records = [
            {**r, "health_check_id": checks[r["health_check"]]} if "health_check" in r else r for r in spec["records"]
        ]
        batch = ChangeBatch(
            comment="Seed data",
            changes=[
                ChangeIn(action="CREATE", record_set=RecordSetIn(**{k: v for k, v in r.items() if k != "health_check"}))
                for r in records
            ],
        )
        apply_change_batch(db, zone, batch)


def seed_health_checks(db: Session, user: User) -> dict[str, str]:
    """Creates demo health checks, backdated two days so they have status history. Returns name -> ID."""
    specs = [
        HealthCheckCreate(
            name="api-blue", type="HTTPS", fqdn="api-blue.example.com", port=443, resource_path="/health",
            measure_latency=True, caller_reference="seed-hc-api-blue",
            notification=Notification(sns_topic="route53-alerts", emails=["ops@example.com"]),
            tags=[Tag(key="Environment", value="production")],
        ),
        HealthCheckCreate(
            name="api-green", type="HTTP_STR_MATCH", ip_address="198.51.100.21", port=80, resource_path="/status",
            search_string="OK", caller_reference="seed-hc-api-green",
        ),
        HealthCheckCreate(
            name="legacy-backend", type="TCP", ip_address="203.0.113.50", port=8080,
            request_interval=10, failure_threshold=2, caller_reference="seed-hc-legacy",
            notification=Notification(sns_topic="route53-alerts", emails=["ops@example.com"]),
        ),
    ]
    ids: dict[str, str] = {}
    for spec in specs:
        ids[spec.name] = create_health_check(db, user, spec).id
    calculated = create_health_check(
        db,
        user,
        HealthCheckCreate(
            name="api-overall", type="CALCULATED", child_health_checks=[ids["api-blue"], ids["api-green"]],
            health_threshold=1, caller_reference="seed-hc-api-overall",
        ),
    )
    ids[calculated.name] = calculated.id
    backdated = utcnow() - timedelta(days=2)
    for hc in db.scalars(select(HealthCheck).where(HealthCheck.owner_id == user.id)):
        hc.created_at = hc.updated_at = backdated
    db.commit()
    return ids


def seed_if_empty(db: Session) -> None:
    if db.scalar(select(User.id).limit(1)) is None:
        seed(db)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--reset", action="store_true", help="drop all data and reseed")
    args = parser.parse_args()
    if args.reset:
        Base.metadata.drop_all(bind=engine)
    init_db()
    with SessionLocal() as db:
        if args.reset or db.scalar(select(User.id).limit(1)) is None:
            seed(db)
            print("Seeded demo user demo@example.com / demo, 3 hosted zones and 4 health checks.")
        else:
            print("Database already has data; use --reset to wipe and reseed.")


if __name__ == "__main__":
    main()
