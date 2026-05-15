from pydantic_settings import BaseSettings, SettingsConfigDict


class AgentConfig(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="SENTINEL_", env_file=".env")

    server_url: str
    api_key: str
    poll_interval_seconds: int = 30
    batch_size: int = 100
    enable_yara_scan: bool = True
    high_risk_paths: list[str] = [
        "/tmp", "/var/tmp",
        "~/Downloads", "~/Desktop",
        "%APPDATA%", "%TEMP%", "%TMP%",
    ]
    agent_version: str = "0.1.0"


config = AgentConfig()  # type: ignore[call-arg]
