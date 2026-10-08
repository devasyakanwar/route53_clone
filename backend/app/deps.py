from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.errors import ApiError
from app.models import HostedZone, User
from app.services.auth import user_for_token
from app.services.zones import get_zone

DbSession = Annotated[Session, Depends(get_db)]


def get_current_user(request: Request, db: DbSession) -> User:
    token = request.cookies.get(get_settings().session_cookie_name)
    user = user_for_token(db, token) if token else None
    if user is None:
        raise ApiError(401, "NotAuthenticated", "Your session has expired. Sign in again to continue.")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def get_owned_zone(zone_id: str, db: DbSession, user: CurrentUser) -> HostedZone:
    return get_zone(db, user, zone_id)


OwnedZone = Annotated[HostedZone, Depends(get_owned_zone)]
