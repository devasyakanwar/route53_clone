from fastapi import APIRouter, Request, Response

from app.config import get_settings
from app.deps import CurrentUser, DbSession
from app.models import User
from app.schemas.auth import LoginRequest, UserOut
from app.services import auth as auth_service

router = APIRouter(prefix="/auth", tags=["auth"])


def _user_out(user: User) -> UserOut:
    return UserOut(id=user.id, email=user.email, display_name=user.display_name, account_id=user.account_id)


@router.post("/login", response_model=UserOut)
def login(body: LoginRequest, response: Response, db: DbSession) -> UserOut:
    settings = get_settings()
    user = auth_service.authenticate(db, body)
    token = auth_service.create_session(db, user)
    response.set_cookie(
        settings.session_cookie_name,
        token,
        max_age=settings.session_ttl_hours * 3600,
        httponly=True,
        samesite="lax",
        secure=settings.session_cookie_secure,
        path="/",
    )
    return _user_out(user)


@router.post("/logout", status_code=204)
def logout(request: Request, response: Response, db: DbSession) -> Response:
    settings = get_settings()
    token = request.cookies.get(settings.session_cookie_name)
    if token:
        auth_service.delete_session(db, token)
    response.delete_cookie(settings.session_cookie_name, path="/")
    response.status_code = 204
    return response


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser) -> UserOut:
    return _user_out(user)
