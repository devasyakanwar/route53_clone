from collections.abc import Callable
from typing import Any

from fastapi.testclient import TestClient


def test_dashboard_requires_login(anon: TestClient) -> None:
    assert anon.get("/api/v1/dashboard").status_code == 401


def test_dashboard_counts_zones_and_records(client: TestClient, make_zone: Callable[..., dict[str, Any]], change: Any) -> None:
    empty = client.get("/api/v1/dashboard").json()
    assert empty["hosted_zones"] == 0 and empty["record_sets"] == 0

    public = make_zone("a.com")
    make_zone("b.corp", private_zone=True, vpcs=[{"vpc_id": "vpc-0a1b2c3d", "vpc_region": "us-east-1"}])
    change(public["id"], ("CREATE", {"name": "www.a.com", "type": "A", "ttl": 60, "values": ["192.0.2.1"]}))

    dash = client.get("/api/v1/dashboard").json()
    assert dash["hosted_zones"] == 2
    assert dash["public_hosted_zones"] == 1 and dash["private_hosted_zones"] == 1
    assert dash["record_sets"] == 5  # NS + SOA for each zone, plus the A record
    # Sections that are "Coming soon" report zero.
    assert dash["traffic_policies"] == dash["policy_records"] == dash["registered_domains"] == 0


def test_dashboard_only_counts_the_current_users_zones(client: TestClient, make_zone: Callable[..., dict[str, Any]]) -> None:
    make_zone("mine.com")
    client.post("/api/v1/auth/logout")
    client.post("/api/v1/auth/login", json={"email": "other@example.com", "password": "other"})
    assert client.get("/api/v1/dashboard").json()["hosted_zones"] == 0
