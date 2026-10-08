from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class ChangeInfo(BaseModel):
    id: str
    status: Literal["PENDING", "INSYNC"]
    submitted_at: datetime
    comment: str | None = None

