import time
from collections.abc import Callable
from typing import Any

import pytest
from fastapi.testclient import TestClient

VALID = {
    "A": ["192.0.2.235"],
    "AAAA": ["2001:0db8:85a3:0:0:8a2e:0370:7334"],
    "CNAME": ["target.example.net"],
    "TXT": ['"v=spf1 include:_spf.example.com ~all"'],
    "MX": ["10 mail.example.com"],
    "NS": ["ns-1.awsdns-01.org"],
    "PTR": ["hostname.example.com"],
    "SRV": ["1 10 5269 xmpp-server.example.com"],
    "CAA": ['0 issue "amazon.com"'],
    "SPF": ['"v=spf1 -all"'],
    "DS": ["12345 13 2 1F987CC6583E92DF0890718C42"],
    "NAPTR": ['100 100 "U" "E2U+sip" "!^.*$!sip:info@example.com!" .'],
}


@pytest.fixture
def zone(make_zone: Callable[..., dict[str, Any]]) -> dict[str, Any]:
    return make_zone("example.com")


def rs(name: str, rtype: str, values: list[str] | None = None, **kw: Any) -> dict[str, Any]:
    return {"name": name, "type": rtype, "ttl": 300, "values": values or VALID[rtype], **kw}


def records(client: TestClient, zone_id: str, **params: Any) -> list[dict[str, Any]]:
    return client.get(f"/api/v1/hostedzones/{zone_id}/recordsets", params=params).json()["items"]


@pytest.mark.parametrize("rtype", list(VALID))
def test_create_every_type(client: TestClient, zone: dict[str, Any], change: Any, rtype: str) -> None:
    r = change(zone["id"], ("CREATE", rs(f"{rtype.lower()}.example.com", rtype)))
    assert r.status_code == 200, r.text
    created = [x for x in records(client, zone["id"]) if x["type"] == rtype and not x["is_default"]]
    assert len(created) == 1 and created[0]["name"] == f"{rtype.lower()}.example.com."


@pytest.mark.parametrize(
    ("rtype", "value"),
    [
        ("A", "999.1.1.1"),
        ("A", "1.2.3"),
        ("AAAA", "2001:::1"),
        ("CNAME", "not a domain"),
        ("TXT", "unquoted"),
        ("TXT", '"' + "x" * 256 + '"'),
        ("MX", "mail.example.com"),
        ("MX", "70000 mail.example.com"),
        ("SRV", "1 10 mail.example.com"),
        ("CAA", '0 badtag "amazon.com"'),
        ("CAA", "0 issue amazon.com"),
        ("PTR", "bad host!"),
        ("NS", "-"),
        ("DS", "1 2 3 XYZ"),
    ],
)
def test_invalid_values_rejected_with_field(zone: dict[str, Any], change: Any, rtype: str, value: str) -> None:
    r = change(zone["id"], ("CREATE", rs("x.example.com", rtype, [value])))
    assert r.status_code == 400, (rtype, value)
    err = r.json()["error"]
    assert err["code"] == "InvalidChangeBatch"
    assert err["field"] == "changes[0].values[0]"


def test_ttl_bounds_and_required(zone: dict[str, Any], change: Any) -> None:
    for ttl in (-1, 2147483648):
        r = change(zone["id"], ("CREATE", rs("a.example.com", "A", ttl=ttl)))
        assert r.status_code == 400 and r.json()["error"]["field"] == "changes[0].ttl"
    r = change(zone["id"], ("CREATE", {"name": "a.example.com", "type": "A", "values": ["192.0.2.1"]}))
    assert r.status_code == 400 and r.json()["error"]["field"] == "changes[0].ttl"
    assert change(zone["id"], ("CREATE", rs("a.example.com", "A", ttl=0))).status_code == 200


def test_record_count_tracks_changes(client: TestClient, zone: dict[str, Any], change: Any) -> None:
    change(zone["id"], ("CREATE", rs("a.example.com", "A")), ("CREATE", rs("b.example.com", "A")))
    assert client.get(f"/api/v1/hostedzones/{zone['id']}").json()["record_count"] == 4
    change(zone["id"], ("DELETE", rs("a.example.com", "A")))
    assert client.get(f"/api/v1/hostedzones/{zone['id']}").json()["record_count"] == 3


def test_batch_is_atomic(client: TestClient, zone: dict[str, Any], change: Any) -> None:
    r = change(
        zone["id"],
        ("CREATE", rs("one.example.com", "A")),
        ("CREATE", rs("two.example.com", "A")),
        ("CREATE", rs("three.example.com", "A", ["not-an-ip"])),
    )
    assert r.status_code == 400
    assert r.json()["error"]["field"] == "changes[2].values[0]"
    assert len(records(client, zone["id"])) == 2  # only NS + SOA


def test_three_rows_created_atomically(client: TestClient, zone: dict[str, Any], change: Any) -> None:
    r = change(
        zone["id"],
        ("CREATE", rs("one.example.com", "A")),
        ("CREATE", rs("two.example.com", "AAAA")),
        ("CREATE", rs("three.example.com", "TXT")),
    )
    assert r.status_code == 200
    assert len(records(client, zone["id"])) == 5


def test_duplicate_create_fails(zone: dict[str, Any], change: Any) -> None:
    assert change(zone["id"], ("CREATE", rs("www.example.com", "A"))).status_code == 200
    r = change(zone["id"], ("CREATE", rs("www.example.com", "A", ["192.0.2.9"])))
    assert r.status_code == 400
    assert "already exists" in r.json()["error"]["message"]
    # Same name, different type is fine.
    assert change(zone["id"], ("CREATE", rs("www.example.com", "AAAA"))).status_code == 200


def test_delete_missing_fails(zone: dict[str, Any], change: Any) -> None:
    r = change(zone["id"], ("DELETE", rs("ghost.example.com", "A")))
    assert r.status_code == 400 and "not found" in r.json()["error"]["message"]


def test_upsert_creates_then_replaces(client: TestClient, zone: dict[str, Any], change: Any) -> None:
    assert change(zone["id"], ("UPSERT", rs("www.example.com", "A", ["192.0.2.1"]))).status_code == 200
    assert change(zone["id"], ("UPSERT", rs("www.example.com", "A", ["192.0.2.2", "192.0.2.3"], ttl=60))).status_code == 200
    www = [r for r in records(client, zone["id"]) if r["name"] == "www.example.com."]
    assert len(www) == 1 and www[0]["values"] == ["192.0.2.2", "192.0.2.3"] and www[0]["ttl"] == 60


def test_cname_rules(zone: dict[str, Any], change: Any) -> None:
    r = change(zone["id"], ("CREATE", rs("example.com", "CNAME")))
    assert r.status_code == 400 and "apex" in r.json()["error"]["message"]

    r = change(zone["id"], ("CREATE", rs("www.example.com", "CNAME", ["a.example.net", "b.example.net"])))
    assert r.status_code == 400 and r.json()["error"]["field"] == "changes[0].values"

    assert change(zone["id"], ("CREATE", rs("www.example.com", "A"))).status_code == 200
    r = change(zone["id"], ("CREATE", rs("www.example.com", "CNAME")))
    assert r.status_code == 400 and "conflicts" in r.json()["error"]["message"]


def test_ns_soa_protection(client: TestClient, zone: dict[str, Any], change: Any) -> None:
    default = {r["type"]: r for r in records(client, zone["id"])}
    r = change(zone["id"], ("DELETE", {**default["NS"], "set_identifier": None}))
    assert r.status_code == 400 and "can't delete the NS and SOA" in r.json()["error"]["message"]
    r = client.delete(f"/api/v1/hostedzones/{zone['id']}/recordsets/{default['SOA']['id']}")
    assert r.status_code == 400

    # SOA cannot be created again, but can be edited.
    r = change(zone["id"], ("CREATE", rs("example.com", "SOA", default["SOA"]["values"])))
    assert r.status_code == 400
    new_soa = default["SOA"]["values"][0].replace(" 1 7200", " 2 7200")
    assert change(zone["id"], ("UPSERT", rs("example.com", "SOA", [new_soa], ttl=900))).status_code == 200

    # NS can be edited and stays protected.
    assert change(zone["id"], ("UPSERT", rs("example.com", "NS", default["NS"]["values"][:2], ttl=3600))).status_code == 200
    ns = [r for r in records(client, zone["id"]) if r["type"] == "NS"][0]
    assert ns["is_default"] and ns["ttl"] == 3600 and len(ns["values"]) == 2
    assert change(zone["id"], ("DELETE", rs("example.com", "NS", ns["values"]))).status_code == 400


def test_soa_only_at_apex(zone: dict[str, Any], change: Any) -> None:
    soa = "ns-1.awsdns-01.com. hostmaster.example.com. 1 7200 900 1209600 86400"
    r = change(zone["id"], ("UPSERT", rs("sub.example.com", "SOA", [soa])))
    assert r.status_code == 400


def test_names_must_be_in_zone(zone: dict[str, Any], change: Any) -> None:
    r = change(zone["id"], ("CREATE", rs("www.other.org", "A")))
    assert r.status_code == 400 and "not permitted in zone" in r.json()["error"]["message"]
    assert r.json()["error"]["field"] == "changes[0].name"
    r = change(zone["id"], ("CREATE", rs("notexample.com", "A")))
    assert r.status_code == 400


def test_wildcard_names_escaped(client: TestClient, zone: dict[str, Any], change: Any) -> None:
    assert change(zone["id"], ("CREATE", rs("*.example.com", "A"))).status_code == 200
    names = [r["name"] for r in records(client, zone["id"])]
    assert "\\052.example.com." in names
    assert change(zone["id"], ("DELETE", rs("\\052.example.com", "A"))).status_code == 200
    r = change(zone["id"], ("CREATE", rs("a.*.example.com", "A")))
    assert r.status_code == 400


def test_alias_records(client: TestClient, zone: dict[str, Any], change: Any) -> None:
    alias = {"dns_name": "d111.cloudfront.net", "hosted_zone_id": "Z2FDTNDATAQYW2", "evaluate_target_health": True}
    r = change(zone["id"], ("CREATE", {"name": "cdn.example.com", "type": "A", "alias_target": alias}))
    assert r.status_code == 200
    rec = [r for r in records(client, zone["id"], alias=True)][0]
    assert rec["ttl"] is None and rec["values"] == []
    assert rec["alias_target"]["dns_name"] == "d111.cloudfront.net."

    r = change(zone["id"], ("CREATE", {"name": "x.example.com", "type": "A", "ttl": 60, "alias_target": alias}))
    assert r.status_code == 400 and r.json()["error"]["field"] == "changes[0].ttl"
    r = change(zone["id"], ("CREATE", {"name": "x.example.com", "type": "NS", "alias_target": alias}))
    assert r.status_code == 400


def test_routing_policies(client: TestClient, zone: dict[str, Any], change: Any) -> None:
    r = change(zone["id"], ("CREATE", rs("api.example.com", "A", routing_policy="WEIGHTED", weight=10)))
    assert r.status_code == 400 and r.json()["error"]["field"] == "changes[0].set_identifier"
    r = change(zone["id"], ("CREATE", rs("api.example.com", "A", routing_policy="WEIGHTED", set_identifier="a", weight=300)))
    assert r.status_code == 400 and r.json()["error"]["field"] == "changes[0].weight"

    ok = change(
        zone["id"],
        ("CREATE", rs("api.example.com", "A", ["192.0.2.1"], routing_policy="WEIGHTED", set_identifier="blue", weight=70)),
        ("CREATE", rs("api.example.com", "A", ["192.0.2.2"], routing_policy="WEIGHTED", set_identifier="green", weight=30)),
    )
    assert ok.status_code == 200
    weighted = records(client, zone["id"], routing_policy="WEIGHTED")
    assert {r["set_identifier"]: r["weight"] for r in weighted} == {"blue": 70, "green": 30}

    # Can't mix policies at the same name and type.
    r = change(zone["id"], ("CREATE", rs("api.example.com", "A", ["192.0.2.3"])))
    assert r.status_code == 400 and "routing polic" in r.json()["error"]["message"]

    policies = [
        {"routing_policy": "LATENCY", "set_identifier": "l1", "region": "us-east-1"},
        {"routing_policy": "FAILOVER", "set_identifier": "f1", "failover": "PRIMARY"},
        {"routing_policy": "GEOLOCATION", "set_identifier": "g1", "geo_location": {"continent": "EU"}},
        {"routing_policy": "MULTIVALUE", "set_identifier": "m1"},
        {"routing_policy": "IP_BASED", "set_identifier": "i1",
         "cidr_routing": {"collection_id": "c-1", "location_name": "office"}},
        {"routing_policy": "GEOPROXIMITY", "set_identifier": "p1", "geoproximity": {"aws_region": "us-west-2", "bias": 10}},
    ]
    for i, extra in enumerate(policies):
        r = change(zone["id"], ("CREATE", rs(f"p{i}.example.com", "A", **extra)))
        assert r.status_code == 200, (extra, r.text)
    for i, extra in enumerate(policies):
        bare = {"routing_policy": extra["routing_policy"], "set_identifier": "x"}
        if extra["routing_policy"] == "MULTIVALUE":
            continue
        r = change(zone["id"], ("CREATE", rs(f"q{i}.example.com", "A", **bare)))
        assert r.status_code == 400, extra


def test_simple_rejects_set_identifier(zone: dict[str, Any], change: Any) -> None:
    r = change(zone["id"], ("CREATE", rs("a.example.com", "A", set_identifier="x")))
    assert r.status_code == 400 and r.json()["error"]["field"] == "changes[0].set_identifier"


def test_list_filters_and_search(client: TestClient, zone: dict[str, Any], change: Any) -> None:
    change(
        zone["id"],
        ("CREATE", rs("www.example.com", "A")),
        ("CREATE", rs("mail.example.com", "MX")),
        ("CREATE", rs("txt.example.com", "TXT")),
    )
    assert [r["name"] for r in records(client, zone["id"], type="MX")] == ["mail.example.com."]
    assert len(records(client, zone["id"], search="192.0.2.235")) == 1
    assert len(records(client, zone["id"], routing_policy="SIMPLE")) == 5
    assert records(client, zone["id"], alias=True) == []
    # Apex records first, NS before SOA.
    assert [r["type"] for r in records(client, zone["id"])[:2]] == ["NS", "SOA"]


def test_get_and_single_delete(client: TestClient, zone: dict[str, Any], change: Any) -> None:
    change(zone["id"], ("CREATE", rs("www.example.com", "A")))
    rec = [r for r in records(client, zone["id"]) if r["type"] == "A"][0]
    assert client.get(f"/api/v1/hostedzones/{zone['id']}/recordsets/{rec['id']}").json()["values"] == VALID["A"]
    assert client.delete(f"/api/v1/hostedzones/{zone['id']}/recordsets/{rec['id']}").status_code == 200
    assert client.get(f"/api/v1/hostedzones/{zone['id']}/recordsets/{rec['id']}").status_code == 404


def test_bulk_delete_in_one_batch(client: TestClient, zone: dict[str, Any], change: Any) -> None:
    created = [rs(f"r{i}.example.com", "A") for i in range(3)]
    change(zone["id"], *[("CREATE", c) for c in created])
    assert change(zone["id"], *[("DELETE", c) for c in created]).status_code == 200
    assert len(records(client, zone["id"])) == 2


def test_change_status_goes_insync(client: TestClient, zone: dict[str, Any], change: Any, monkeypatch: Any) -> None:
    info = change(zone["id"], ("CREATE", rs("www.example.com", "A"))).json()["change_info"]
    assert info["status"] == "PENDING"
    assert client.get(f"/api/v1/changes/{info['id']}").json()["status"] == "PENDING"
    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "change_propagation_seconds", 0.01)
    time.sleep(0.05)
    assert client.get(f"/api/v1/changes/{info['id']}").json()["status"] == "INSYNC"
    assert client.get("/api/v1/changes/CNOPE").status_code == 404


def test_request_validation_error_shape(zone: dict[str, Any], client: TestClient) -> None:
    r = client.post(f"/api/v1/hostedzones/{zone['id']}/rrset", json={"changes": []})
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "ValidationError"
