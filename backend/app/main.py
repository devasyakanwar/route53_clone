from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.config import get_settings
from app.db import SessionLocal, init_db
from app.errors import ApiError
from app.routers import auth, changes, dashboard, health_checks, hosted_zones, import_export, records


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    init_db()
    if get_settings().auto_seed:
        from app.seed import seed_if_empty

        with SessionLocal() as db:
            seed_if_empty(db)
    yield


app = FastAPI(
    title="Route 53 Clone API",
    version="1.0.0",
    description="A local clone of the Amazon Route 53 hosted zone and record APIs.",
    lifespan=lifespan,
)

if origins := get_settings().cors_origin_list:
    app.add_middleware(
        CORSMiddleware, allow_origins=origins, allow_credentials=True, allow_methods=["*"], allow_headers=["*"]
    )


@app.exception_handler(ApiError)
async def api_error_handler(_request: Request, exc: ApiError) -> JSONResponse:
    return JSONResponse(exc.to_dict(), status_code=exc.status_code)


@app.exception_handler(RequestValidationError)
async def validation_error_handler(_request: Request, exc: RequestValidationError) -> JSONResponse:
    errors = exc.errors()
    first = errors[0] if errors else {"msg": "Invalid request", "loc": ()}
    loc = [str(p) for p in first.get("loc", ()) if p not in ("body", "query", "path")]
    field = ".".join(loc) or None
    message = str(first.get("msg", "Invalid request"))
    return JSONResponse(
        {"error": {"code": "ValidationError", "message": f"{field}: {message}" if field else message, "field": field}},
        status_code=422,
    )


@app.exception_handler(StarletteHTTPException)
async def http_error_handler(_request: Request, exc: StarletteHTTPException) -> JSONResponse:
    code = "NotFound" if exc.status_code == 404 else "HttpError"
    return JSONResponse({"error": {"code": code, "message": str(exc.detail), "field": None}}, status_code=exc.status_code)


@app.get("/api/health", tags=["health"])
def health() -> dict[str, str]:
    return {"status": "ok"}


for router in (
    auth.router,
    dashboard.router,
    hosted_zones.router,
    records.router,
    changes.router,
    import_export.router,
    health_checks.router,
):
    app.include_router(router, prefix="/api/v1")
