import hashlib
import secrets
from datetime import timedelta

import bcrypt
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.errors import ApiError
from app.models import User, UserSession, utcnow
from app.schemas.auth import LoginRequest


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), password_hash.encode())
    except ValueError:
        return False


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def authenticate(db: Session, req: LoginRequest) -> User:
    user: User | None = None
    if req.email:
        user = db.scalar(select(User).where(User.email == req.email.strip().lower()))
    elif req.account_id and req.username:
        account = req.account_id.replace("-", "").strip()
        user = db.scalar(
            select(User).where(User.account_id == account, User.display_name == req.username.strip())
        )
    if user is None or not verify_password(req.password, user.password_hash):
        raise ApiError(401, "InvalidCredentials", "Your authentication information is incorrect. Please try again.")
    return user


def create_session(db: Session, user: User) -> str:
    """Returns the raw token for the cookie; only its sha256 is stored."""
    token = secrets.token_urlsafe(32)
    now = utcnow()
    db.add(
        UserSession(
            token=_hash_token(token),
            user_id=user.id,
            created_at=now,
            expires_at=now + timedelta(hours=get_settings().session_ttl_hours),
        )
    )
    # Opportunistically clear expired sessions.
    db.execute(delete(UserSession).where(UserSession.expires_at < now))
    db.commit()
    return token


def user_for_token(db: Session, token: str) -> User | None:
    session = db.get(UserSession, _hash_token(token))
    if session is None or session.expires_at < utcnow():
        return None
    return session.user


def delete_session(db: Session, token: str) -> None:
    db.execute(delete(UserSession).where(UserSession.token == _hash_token(token)))
    db.commit()
