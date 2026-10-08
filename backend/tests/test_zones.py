import re
from collections.abc import Callable
from typing import Any

from fastapi.testclient import TestClient

ZONE_ID_RE = re.compile(r"^Z[A-Z0-9]{20}$")


def test_create_public_zone_creates_ns_and_soa(client: TestClient) -> None:
    r = client.post("/api/v1/hostedzones", json={"name": "Example.COM", "comment": "My site"})
    assert r.status_code == 201
    body = r.json()
    zone = body["hosted_zone"]
    assert ZONE_ID_RE.match(zone["id"])
    assert zone["name"] == "example.com."
    assert zone["record_count"] == 2
    assert zone["private_zone"] is False
    assert len(body["delegation_set"]["name_servers"]) == 4
    assert body["change_info"]["status"] == "PENDING"
    assert re.match(r"^C[A-Z0-9]{20}$", body["change_info"]["id"])

    records = client.get(f"/api/v1/hostedzones/{zone['id']}/recordsets").json()["items"]
    by_type = {r["type"]: r for r in records}
    assert by_type["NS"]["ttl"] == 172800 and len(by_type["NS"]["values"]) == 4
    assert [v.rsplit(".", 2)[-2] for v in by_type["NS"]["values"]] == ["com", "net", "org", "uk"]
    assert by_type["SOA"]["ttl"] == 900
    assert by_type["SOA"]["values"][0].endswith("awsdns-hostmaster.amazon.com. 1 7200 900 1209600 86400")
    assert all(r["is_default"] for r in records)


def test_name_servers_are_deterministic(client: TestClient, make_zone: Callable[..., dict[str, Any]]) -> None:
    zone = make_zone()
    again = client.get(f"/api/v1/hostedzones/{zone['id']}").json()
    assert again["name_servers"] == zone["name_servers"]
    assert all(re.match(r"^ns-\d+\.awsdns-\d{2}\.", ns) for ns in zone["name_servers"])


def test_trailing_dot_normalised(make_zone: Callable[..., dict[str, Any]]) -> None:
    assert make_zone("example.org.")["name"] == "example.org."


def test_invalid_zone_names(client: TestClient) -> None:
    for bad in ["", "exa mple.com", "a..com", "x" * 64 + ".com", ("a" * 60 + ".") * 5 + "com", "bad!.com"]:
        r = client.post("/api/v1/hostedzones", json={"name": bad})
        assert r.status_code == 400, bad
        assert r.json()["error"]["field"] == "name"


def test_private_zone_requires_vpc(client: TestClient) -> None:
    r = client.post("/api/v1/hostedzones", json={"name": "internal.corp", "private_zone": True})
    assert r.status_code == 400 and r.json()["error"]["field"] == "vpcs"
    r = client.post(
        "/api/v1/hostedzones",
        json={"name": "internal.corp", "private_zone": True, "vpcs": [{"vpc_id": "vpc-0a1b2c3d", "vpc_region": "us-east-1"}]},
    )
    assert r.status_code == 201
    assert r.json()["hosted_zone"]["vpcs"] == [{"vpc_id": "vpc-0a1b2c3d", "vpc_region": "us-east-1"}]


def test_public_zone_rejects_vpcs_and_bad_vpc_id(client: TestClient) -> None:
    vpcs = [{"vpc_id": "vpc-0a1b2c3d", "vpc_region": "us-east-1"}]
    assert client.post("/api/v1/hostedzones", json={"name": "a.com", "vpcs": vpcs}).status_code == 400
    bad = [{"vpc_id": "subnet-1", "vpc_region": "us-east-1"}]
    r = client.post("/api/v1/hostedzones", json={"name": "a.com", "private_zone": True, "vpcs": bad})
    assert r.status_code == 400 and r.json()["error"]["field"] == "vpcs[0].vpc_id"


def test_comment_and_tag_limits(client: TestClient) -> None:
    r = client.post("/api/v1/hostedzones", json={"name": "a.com", "comment": "x" * 257})
    assert r.status_code == 400 and r.json()["error"]["field"] == "comment"
    tags = [{"key": f"k{i}", "value": "v"} for i in range(51)]
    assert client.post("/api/v1/hostedzones", json={"name": "a.com", "tags": tags}).status_code == 400
    dup = [{"key": "a", "value": "1"}, {"key": "a", "value": "2"}]
    r = client.post("/api/v1/hostedzones", json={"name": "a.com", "tags": dup})
    assert r.status_code == 400 and r.json()["error"]["field"] == "tags[1].key"


def test_duplicate_zone_names_allowed(make_zone: Callable[..., dict[str, Any]]) -> None:
    a, b = make_zone("dup.com"), make_zone("dup.com")
    assert a["id"] != b["id"]


def test_caller_reference_reuse_conflicts(client: TestClient) -> None:
    body = {"name": "a.com", "caller_reference": "ref-1"}
    assert client.post("/api/v1/hostedzones", json=body).status_code == 201
    r = client.post("/api/v1/hostedzones", json=body)
    assert r.status_code == 409 and r.json()["error"]["code"] == "HostedZoneAlreadyExists"


def test_list_search_filter_sort_paginate(client: TestClient, make_zone: Callable[..., dict[str, Any]]) -> None:
    for name in ["bravo.com", "alpha.com", "charlie.io"]:
        make_zone(name)
    make_zone("delta.corp", private_zone=True, vpcs=[{"vpc_id": "vpc-0a1b2c3d", "vpc_region": "us-east-1"}])

    names = [z["name"] for z in client.get("/api/v1/hostedzones").json()["items"]]
    assert names == ["alpha.com.", "bravo.com.", "charlie.io.", "delta.corp."]
    desc = client.get("/api/v1/hostedzones?order=desc").json()["items"]
    assert desc[0]["name"] == "delta.corp."
    assert client.get("/api/v1/hostedzones?search=.com").json()["total"] == 2
    private = client.get("/api/v1/hostedzones?type=private").json()
    assert private["total"] == 1 and private["items"][0]["private_zone"] is True
    page2 = client.get("/api/v1/hostedzones?page=2&page_size=3").json()
    assert page2["total"] == 4 and [z["name"] for z in page2["items"]] == ["delta.corp."]


def test_update_comment_and_tags(client: TestClient, make_zone: Callable[..., dict[str, Any]]) -> None:
    zone = make_zone(comment="old")
    r = client.patch(f"/api/v1/hostedzones/{zone['id']}", json={"comment": "new description"})
    assert r.status_code == 200 and r.json()["comment"] == "new description"
    assert client.get(f"/api/v1/hostedzones/{zone['id']}").json()["comment"] == "new description"

    r = client.put(f"/api/v1/hostedzones/{zone['id']}/tags", json={"tags": [{"key": "Team", "value": "web"}]})
    assert r.json()["tags"] == [{"key": "Team", "value": "web"}]
    r = client.put(f"/api/v1/hostedzones/{zone['id']}/tags", json={"tags": [{"key": "Env", "value": "prod"}]})
    assert r.json()["tags"] == [{"key": "Env", "value": "prod"}]


def test_delete_guard_and_delete(client: TestClient, make_zone: Callable[..., dict[str, Any]], change: Any) -> None:
    zone = make_zone()
    assert change(zone["id"], ("CREATE", {"name": "www.example.com", "type": "A", "ttl": 300, "values": ["192.0.2.1"]})).status_code == 200

    r = client.delete(f"/api/v1/hostedzones/{zone['id']}")
    assert r.status_code == 400
    assert r.json()["error"]["code"] == "HostedZoneNotEmpty"
    assert "non-required resource record sets" in r.json()["error"]["message"]

    assert change(zone["id"], ("DELETE", {"name": "www.example.com", "type": "A", "ttl": 300, "values": ["192.0.2.1"]})).status_code == 200
    assert client.delete(f"/api/v1/hostedzones/{zone['id']}").status_code == 200
    assert client.get(f"/api/v1/hostedzones/{zone['id']}").status_code == 404


def test_unknown_zone_404(client: TestClient) -> None:
    r = client.get("/api/v1/hostedzones/ZDOESNOTEXIST")
    assert r.status_code == 404 and r.json()["error"]["code"] == "NoSuchHostedZone"


def test_zones_are_isolated_per_user(client: TestClient, make_zone: Callable[..., dict[str, Any]]) -> None:
    zone = make_zone()
    client.post("/api/v1/auth/logout")
    client.post("/api/v1/auth/login", json={"email": "other@example.com", "password": "other"})
    assert client.get("/api/v1/hostedzones").json()["total"] == 0
    assert client.get(f"/api/v1/hostedzones/{zone['id']}").status_code == 404
    assert client.delete(f"/api/v1/hostedzones/{zone['id']}").status_code == 404


def test_batch_delete_is_atomic(client: TestClient, make_zone: Callable[..., dict[str, Any]], change: Any) -> None:
    empty_a, empty_b, busy = make_zone("a.com"), make_zone("b.com"), make_zone("c.com")
    change(busy["id"], ("CREATE", {"name": "www.c.com", "type": "A", "ttl": 60, "values": ["192.0.2.1"]}))

    r = client.post("/api/v1/hostedzones/batch-delete", json={"ids": [empty_a["id"], busy["id"], empty_b["id"]]})
    assert r.status_code == 400
    err = r.json()["error"]
    assert err["code"] == "HostedZoneNotEmpty" and err["field"] == "ids[1]"
    assert "c.com" in err["errors"][0]["message"]
    assert client.get("/api/v1/hostedzones").json()["total"] == 3  # nothing deleted

    r = client.post("/api/v1/hostedzones/batch-delete", json={"ids": [empty_a["id"], empty_b["id"]]})
    assert r.status_code == 200 and len(r.json()["changes"]) == 2
    assert [z["name"] for z in client.get("/api/v1/hostedzones").json()["items"]] == ["c.com."]
    assert client.post("/api/v1/hostedzones/batch-delete", json={"ids": []}).status_code == 422
    assert client.post("/api/v1/hostedzones/batch-delete", json={"ids": ["ZNOPE"]}).status_code == 404


def test_export_all_and_selected_zones(client: TestClient, make_zone: Callable[..., dict[str, Any]], change: Any) -> None:
    a, b = make_zone("a.com", comment="first"), make_zone("b.com")
    change(a["id"], ("CREATE", {"name": "www.a.com", "type": "A", "ttl": 60, "values": ["192.0.2.1"]}))

    js = client.get("/api/v1/hostedzones/export").json()["HostedZones"]
    assert [z["Name"] for z in js] == ["a.com.", "b.com."]
    assert js[0]["Config"] == {"Comment": "first", "PrivateZone": False}
    assert js[0]["ResourceRecordSetCount"] == 3
    assert {s["Type"] for s in js[0]["ResourceRecordSets"]} == {"NS", "SOA", "A"}

    only_b = client.get("/api/v1/hostedzones/export", params={"ids": [b["id"]]}).json()["HostedZones"]
    assert [z["Name"] for z in only_b] == ["b.com."]

    text = client.get("/api/v1/hostedzones/export", params={"format": "bind"}).text
    assert "$ORIGIN a.com." in text and "$ORIGIN b.com." in text
    assert client.get("/api/v1/hostedzones/export", params={"ids": ["ZNOPE"]}).status_code == 404
