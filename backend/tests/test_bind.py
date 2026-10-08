from collections.abc import Callable
from typing import Any

from fastapi.testclient import TestClient

ZONE_FILE = """$ORIGIN example.com.
$TTL 3600
@       IN SOA ns1.example.com. admin.example.com. 2024010101 7200 900 1209600 86400
@       IN NS  ns1.example.com.
@       IN A   192.0.2.10
www     300 IN CNAME example.com.
mail    IN MX  10 mx.example.com.
@       IN TXT "v=spf1 -all"
*.dev   IN A   203.0.113.5
sub     IN NS  ns.other.net.
_sip._tcp IN SRV 10 60 5060 sip.example.com.
@       IN CAA 0 issue "amazon.com"
"""


def test_import_dry_run_then_apply(client: TestClient, make_zone: Callable[..., dict[str, Any]]) -> None:
    zone = make_zone("example.com")
    url = f"/api/v1/hostedzones/{zone['id']}/import"

    preview = client.post(url, params={"dry_run": True}, json={"zone_file": ZONE_FILE}).json()
    types = sorted(r["type"] for r in preview["record_sets"])
    assert types == ["A", "A", "CAA", "CNAME", "MX", "NS", "SRV", "TXT"]
    assert len(preview["skipped"]) == 2  # SOA + apex NS
    assert preview["change_info"] is None
    assert client.get(f"/api/v1/hostedzones/{zone['id']}").json()["record_count"] == 2

    applied = client.post(url, json={"zone_file": ZONE_FILE})
    assert applied.status_code == 200 and applied.json()["change_info"]["status"] == "PENDING"
    assert client.get(f"/api/v1/hostedzones/{zone['id']}").json()["record_count"] == 10

    # Importing again collides with existing records, atomically.
    again = client.post(url, json={"zone_file": ZONE_FILE})
    assert again.status_code == 400 and again.json()["error"]["code"] == "InvalidChangeBatch"


def test_import_rejects_garbage(client: TestClient, make_zone: Callable[..., dict[str, Any]]) -> None:
    zone = make_zone("example.com")
    url = f"/api/v1/hostedzones/{zone['id']}/import"
    assert client.post(url, json={"zone_file": "   "}).status_code == 400
    r = client.post(url, json={"zone_file": "www IN A not-an-ip\n"})
    assert r.status_code == 400 and r.json()["error"]["field"] == "zone_file"


def test_export_json_and_bind(client: TestClient, make_zone: Callable[..., dict[str, Any]], change: Any) -> None:
    zone = make_zone("example.com")
    change(
        zone["id"],
        ("CREATE", {"name": "www.example.com", "type": "A", "ttl": 60, "values": ["192.0.2.1"]}),
        ("CREATE", {"name": "cdn.example.com", "type": "A",
                    "alias_target": {"dns_name": "d1.cloudfront.net", "hosted_zone_id": "Z2FDTNDATAQYW2"}}),
        ("CREATE", {"name": "*.example.com", "type": "A", "ttl": 60, "values": ["192.0.2.9"],
                    "routing_policy": "WEIGHTED", "set_identifier": "w", "weight": 5}),
    )
    js = client.get(f"/api/v1/hostedzones/{zone['id']}/export", params={"format": "json"}).json()
    sets = {(s["Name"], s["Type"]): s for s in js["ResourceRecordSets"]}
    assert sets[("www.example.com.", "A")]["ResourceRecords"] == [{"Value": "192.0.2.1"}]
    assert sets[("cdn.example.com.", "A")]["AliasTarget"]["DNSName"] == "d1.cloudfront.net."
    assert sets[("\\052.example.com.", "A")]["Weight"] == 5

    r = client.get(f"/api/v1/hostedzones/{zone['id']}/export", params={"format": "bind"})
    assert r.headers["content-type"].startswith("text/plain")
    assert "attachment" in r.headers["content-disposition"]
    text = r.text
    assert "$ORIGIN example.com." in text
    assert "www.example.com.\t60\tIN\tA\t192.0.2.1" in text
    assert "ALIAS d1.cloudfront.net." in text


def test_export_round_trips_through_import(client: TestClient, make_zone: Callable[..., dict[str, Any]], change: Any) -> None:
    src = make_zone("example.com")
    change(
        src["id"],
        ("CREATE", {"name": "www.example.com", "type": "A", "ttl": 60, "values": ["192.0.2.1"]}),
        ("CREATE", {"name": "example.com", "type": "TXT", "ttl": 60, "values": ['"hello world"']}),
    )
    text = client.get(f"/api/v1/hostedzones/{src['id']}/export", params={"format": "bind"}).text
    dst = make_zone("example.com")
    r = client.post(f"/api/v1/hostedzones/{dst['id']}/import", json={"zone_file": text})
    assert r.status_code == 200, r.text
    assert client.get(f"/api/v1/hostedzones/{dst['id']}").json()["record_count"] == 4
