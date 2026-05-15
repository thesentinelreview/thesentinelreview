from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="SHIELD_", env_file=".env")

    database_url: str
    anthropic_api_key: str

    model_triage: str = "claude-sonnet-4-6"
    model_investigation: str = "claude-opus-4-7"

    worker_poll_interval: float = 2.0
    worker_batch_size: int = 100

    nvd_api_key: str = ""
    escalation_webhook_url: str = ""

    geoip_db_path: str = "/var/lib/GeoIP/GeoLite2-City.mmdb"


settings = Settings()  # type: ignore[call-arg]
