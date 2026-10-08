from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = "sqlite:///./route53.db"
    session_cookie_name: str = "r53_session"
    session_cookie_secure: bool = False
    session_ttl_hours: int = 24 * 7
    # Comma-separated list. Empty locally because the Next.js rewrite keeps everything same-origin.
    cors_origins: str = ""
    # Seed the demo user and sample zones on startup when the database is empty.
    auto_seed: bool = True
    # Mocked propagation delay for changes (PENDING -> INSYNC).
    change_propagation_seconds: float = 2.0

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
