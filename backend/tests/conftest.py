import os
import tempfile
from collections.abc import Callable, Iterator
from pathlib import Path
from typing import Any

# Point the app at a throwaway database before anything imports app.db.
_TMP_DIR = tempfile.mkdtemp(prefix="r53-tests-")
os.environ["DATABASE_URL"] = f"sqlite:///{Path(_TMP_DIR, 'test.db').as_posix()}"
os.environ["AUTO_SEED"] = "false"
os.environ["CHANGE_PROPAGATION_SECONDS"] = "2"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.db import Base, SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import User  # noqa: E402
from app.services.auth import hash_password  # noqa: E402


@pytest.fixture(autouse=True)
def fresh_db() -> Iterator[None]:
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        db.add(User(email="demo@example.com", display_name="demo-user", account_id="123456789012",
                    password_hash=hash_password("demo")))
        db.add(User(email="other@example.com", display_name="other-user", account_id="210987654321",
                    password_hash=hash_password("other")))
        db.commit()
    yield


@pytest.fixture
def anon() -> Iterator[TestClient]:
    with TestClient(app) as c:
        yield c


@pytest.fixture
def client(anon: TestClient) -> TestClient:
    r = anon.post("/api/v1/auth/login", json={"email": "demo@example.com", "password": "demo"})
    assert r.status_code == 200
    return anon


@pytest.fixture
def make_zone(client: TestClient) -> Callable[..., dict[str, Any]]:
    def _make(name: str = "example.com", **kwargs: Any) -> dict[str, Any]:
        r = client.post("/api/v1/hostedzones", json={"name": name, **kwargs})
        assert r.status_code == 201, r.text
        return r.json()["hosted_zone"]

    return _make


@pytest.fixture
def change(client: TestClient) -> Callable[..., Any]:
    """Submit a change batch: change(zone_id, ("CREATE", {...}), ...)."""

    def _change(zone_id: str, *changes: tuple[str, dict[str, Any]]) -> Any:
        return client.post(
            f"/api/v1/hostedzones/{zone_id}/rrset",
            json={"changes": [{"action": a, "record_set": rs} for a, rs in changes]},
        )

    return _change
