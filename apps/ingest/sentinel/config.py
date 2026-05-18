from pydantic import PostgresDsn
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # Database
    database_url: PostgresDsn

    # Anthropic
    anthropic_api_key: str
    anthropic_model_extract: str = "claude-sonnet-4-6"
    anthropic_model_briefing: str = "claude-opus-4-7"
    anthropic_model_translate: str = "claude-haiku-4-5"

    # Telegram (optional — ingestor silently skips if unset)
    telegram_api_id: int | None = None
    telegram_api_hash: str | None = None
    telegram_session: str | None = None

    # X / Twitter (optional)
    x_bearer_token: str | None = None

    # Worker
    worker_poll_interval: int = 5
    worker_batch_size: int = 10

    # Logging
    log_level: str = "INFO"

    @property
    def telegram_enabled(self) -> bool:
        return self.telegram_api_id is not None and self.telegram_api_hash is not None

    @property
    def x_enabled(self) -> bool:
        return self.x_bearer_token is not None


settings = Settings()  # type: ignore[call-arg]
