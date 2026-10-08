import uuid
from collections.abc import Callable
from datetime import timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.db import SessionLocal
from app.models import HealthCheck, utcnow

URL = "/api/v1/healthchecks"


def age_all() -> None:
    """Skip the initial 'Unknown' period by backdating every health check."""
    with SessionLocal() as db:
        for hc in db.query(HealthCheck):
            hc.created_at = utcnow() - timedelta(hours=1)
        db.commit()


@pytest.fixture
def make_hc(client: TestClient) -> Callable[..., dict[str, Any]]:
    def _make(**kwargs: Any) -> dict[str, Any]:
        body = {"name": "web", "type": "HTTPS", "fqdn": "www.example.com", **kwargs}
        r = client.post(URL, json=body)
        assert r.status_code == 201, r.text
        return r.json()

    return _make


def test_create_endpoint_check_defaults(make_hc: Callable[..., dict[str, Any]]) -> None:
    hc = make_hc()
    uuid.UUID(hc["id"])
    assert hc["port"] == 443 and hc["resource_path"] == "/" and hc["enable_sni"] is True
    assert hc["status"] == "Unknown"  # no checker has reported yet
    assert hc["description"] == "https://www.example.com:443/"
    assert hc["alarms"] == "No alarms configured"
    tcp = make_hc(name="db", type="TCP", fqdn=None, ip_address="198.51.100.7", port=5432)
    assert tcp["resource_path"] is None and tcp["description"] == "tcp://198.51.100.7:5432"


def test_simulated_status_rules(client: TestClient, make_hc: Callable[..., dict[str, Any]]) -> None:
    ok = make_hc(name="ok")
    bad = make_hc(name="bad", type="HTTP", fqdn=None, ip_address="203.0.113.9")
    inverted = make_hc(name="inv", type="HTTP", fqdn=None, ip_address="203.0.113.9", inverted=True)
    disabled = make_hc(name="off", fqdn="down.example.com", disabled=True)
    calc = make_hc(name="calc", type="CALCULATED", fqdn=None, child_health_checks=[ok["id"], bad["id"]], health_threshold=2)
    cw = make_hc(name="cw", type="CLOUDWATCH_METRIC", fqdn=None,
                 cloudwatch_alarm={"alarm_name": "cpu-high", "region": "us-east-1", "insufficient_data_status": "Unhealthy"})
    age_all()
    status = {h["name"]: h["status"] for h in client.get(URL).json()["items"]}
    assert status == {"ok": "Healthy", "bad": "Unhealthy", "inv": "Healthy", "off": "Healthy", "calc": "Unhealthy", "cw": "Unhealthy"}
    del inverted, disabled, calc, cw


@pytest.mark.parametrize(
    ("body", "field"),
    [
        ({"name": ""}, "name"),
        ({"fqdn": None}, "ip_address"),
        ({"fqdn": None, "ip_address": "not-an-ip"}, "ip_address"),
        ({"fqdn": None, "ip_address": "127.0.0.1"}, "ip_address"),
        ({"fqdn": "bad host"}, "fqdn"),
        ({"port": 70000}, "port"),
        ({"type": "HTTPS_STR_MATCH"}, "search_string"),
        ({"failure_threshold": 11}, "failure_threshold"),
        ({"regions": ["us-east-1"]}, "regions"),
        ({"regions": ["mars-1", "us-east-1", "eu-west-1"]}, "regions"),
        ({"type": "CALCULATED", "fqdn": None}, "child_health_checks"),
        ({"type": "CLOUDWATCH_METRIC", "fqdn": None}, "cloudwatch_alarm"),
        ({"notification": {"sns_topic": "t", "emails": ["nope"]}}, "notification.emails[0]"),
    ],
)
def test_validation(client: TestClient, body: dict[str, Any], field: str) -> None:
    r = client.post(URL, json={"name": "x", "type": "HTTPS", "fqdn": "www.example.com", **body})
    assert r.status_code == 400, r.text
    assert r.json()["error"]["field"] == field


def test_update_rules(client: TestClient, make_hc: Callable[..., dict[str, Any]]) -> None:
    hc = make_hc()
    base = {k: hc[k] for k in ("name", "type", "fqdn", "port", "resource_path", "request_interval", "failure_threshold")}
    r = client.put(f"{URL}/{hc['id']}", json={**base, "resource_path": "/health", "failure_threshold": 5})
    assert r.status_code == 200 and r.json()["resource_path"] == "/health" and r.json()["version"] == 2
    assert client.put(f"{URL}/{hc['id']}", json={**base, "type": "HTTP"}).json()["error"]["field"] == "type"
    assert client.put(f"{URL}/{hc['id']}", json={**base, "request_interval": 10}).status_code == 400


def test_delete_guards(client: TestClient, make_hc: Callable[..., dict[str, Any]], make_zone: Callable[..., dict[str, Any]], change: Any) -> None:
    child = make_hc(name="child")
    parent = make_hc(name="parent", type="CALCULATED", fqdn=None, child_health_checks=[child["id"]])
    r = client.delete(f"{URL}/{child['id']}")
    assert r.status_code == 400 and r.json()["error"]["code"] == "HealthCheckInUse"
    # Deleting the parent together with its child is allowed.
    assert client.post(f"{URL}/batch-delete", json={"ids": [child["id"], parent["id"]]}).status_code == 204

    hc = make_hc(name="used")
    zone = make_zone()
    record = {"name": "www.example.com", "type": "A", "ttl": 60, "values": ["192.0.2.1"],
              "routing_policy": "FAILOVER", "set_identifier": "p", "failover": "PRIMARY", "health_check_id": hc["id"]}
    assert change(zone["id"], ("CREATE", record)).status_code == 200
    assert client.delete(f"{URL}/{hc['id']}").json()["error"]["message"].endswith("hosted zone example.com.")
    assert change(zone["id"], ("DELETE", record)).status_code == 200
    assert client.delete(f"{URL}/{hc['id']}").status_code == 204
    assert client.get(f"{URL}/{hc['id']}").status_code == 404


def test_records_reject_unknown_health_check(make_zone: Callable[..., dict[str, Any]], change: Any) -> None:
    zone = make_zone()
    r = change(zone["id"], ("CREATE", {"name": "www.example.com", "type": "A", "ttl": 60, "values": ["192.0.2.1"],
                                       "health_check_id": "00000000-0000-0000-0000-000000000000"}))
    assert r.status_code == 400 and r.json()["error"]["field"] == "changes[0].health_check_id"


def test_status_metrics_tags_and_dashboard(client: TestClient, make_hc: Callable[..., dict[str, Any]], make_zone: Callable[..., dict[str, Any]]) -> None:
    hc = make_hc(measure_latency=True, regions=["us-east-1", "eu-west-1", "ap-southeast-1"],
                 notification={"sns_topic": "alerts", "emails": ["ops@example.com"]})
    assert client.get(f"{URL}/{hc['id']}/status").json()["observations"] == []  # Unknown: nothing yet
    age_all()
    obs = client.get(f"{URL}/{hc['id']}/status").json()["observations"]
    assert [o["region"] for o in obs] == ["us-east-1", "eu-west-1", "ap-southeast-1"]
    assert obs[0]["status"].startswith("Success: HTTP Status Code 200")
    points = client.get(f"{URL}/{hc['id']}/metrics").json()["points"]
    assert len(points) == 61 and all(p["latency_ms"] for p in points)
    assert client.get(f"{URL}/{hc['id']}").json()["alarms"] == "1 of 1 in OK"

    r = client.put(f"{URL}/{hc['id']}/tags", json={"tags": [{"key": "Team", "value": "web"}]})
    assert r.json()["tags"] == [{"key": "Team", "value": "web"}]

    make_zone("a.com")
    make_zone("b.corp", private_zone=True, vpcs=[{"vpc_id": "vpc-0a1b2c3d", "vpc_region": "us-east-1"}])
    dash = client.get("/api/v1/dashboard").json()
    assert dash["hosted_zones"] == 2 and dash["public_hosted_zones"] == 1 and dash["private_hosted_zones"] == 1
    assert dash["record_sets"] == 4 and dash["health_checks"] == 1 and dash["healthy_health_checks"] == 1


def test_health_checks_isolated_per_user(client: TestClient, make_hc: Callable[..., dict[str, Any]]) -> None:
    hc = make_hc()
    client.post("/api/v1/auth/logout")
    client.post("/api/v1/auth/login", json={"email": "other@example.com", "password": "other"})
    assert client.get(URL).json()["total"] == 0
    assert client.get(f"{URL}/{hc['id']}").status_code == 404
