from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    """Root users sign in with email; IAM users with account ID (or alias) + user name."""

    email: str | None = None
    account_id: str | None = None
    username: str | None = None
    password: str = Field(min_length=1)


class UserOut(BaseModel):
    id: int
    email: str
    display_name: str
    account_id: str
