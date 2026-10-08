from fastapi.testclient import TestClient


def test_protected_endpoint_requires_session(anon: TestClient) -> None:
    r = anon.get("/api/v1/hostedzones")
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "NotAuthenticated"


def test_login_sets_httponly_cookie_and_me_works(anon: TestClient) -> None:
    r = anon.post("/api/v1/auth/login", json={"email": "Demo@Example.com", "password": "demo"})
    assert r.status_code == 200
    assert r.json()["account_id"] == "123456789012"
    cookie = r.headers["set-cookie"]
    assert "r53_session=" in cookie and "HttpOnly" in cookie and "samesite=lax" in cookie.lower()
    assert "Secure" not in cookie
    me = anon.get("/api/v1/auth/me")
    assert me.status_code == 200 and me.json()["email"] == "demo@example.com"


def test_wrong_password_rejected(anon: TestClient) -> None:
    r = anon.post("/api/v1/auth/login", json={"email": "demo@example.com", "password": "nope"})
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "InvalidCredentials"
    r = anon.post("/api/v1/auth/login", json={"email": "ghost@example.com", "password": "demo"})
    assert r.status_code == 401


def test_iam_user_login(anon: TestClient) -> None:
    r = anon.post(
        "/api/v1/auth/login", json={"account_id": "1234-5678-9012", "username": "demo-user", "password": "demo"}
    )
    assert r.status_code == 200


def test_logout_clears_session(client: TestClient) -> None:
    assert client.get("/api/v1/auth/me").status_code == 200
    token = client.cookies.get("r53_session")
    assert client.post("/api/v1/auth/logout").status_code == 204
    assert client.get("/api/v1/auth/me").status_code == 401
    # The old token is dead server-side even if a client replays it.
    client.cookies.set("r53_session", token)
    assert client.get("/api/v1/auth/me").status_code == 401


def test_session_persists_across_requests(client: TestClient) -> None:
    for _ in range(3):
        assert client.get("/api/v1/auth/me").status_code == 200


def test_health(anon: TestClient) -> None:
    assert anon.get("/api/health").json() == {"status": "ok"}
