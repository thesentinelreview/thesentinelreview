"""
Telegram public channel ingestor.

Uses the Telegram MTProto API via Telethon. Only reads public channels —
no private messages, no user data.

Prerequisites:
  1. Register an app at https://my.telegram.org → "API development tools"
  2. Set TELEGRAM_API_ID and TELEGRAM_API_HASH in .env
  3. On first run, Telethon will prompt for a phone number to generate a session.
     Set TELEGRAM_SESSION to the base64 session string to skip interactive login
     in production.

Requires: telethon
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone

import structlog

from sentinel.config import settings
from sentinel.ingestors.base import BaseIngestor, RawPostData

log = structlog.get_logger()

_MAX_MESSAGES = 200


class TelegramIngestor(BaseIngestor):
    def fetch(self, *, since_hours: int) -> list[RawPostData]:
        if not settings.telegram_enabled:
            log.warning(
                "telegram_credentials_missing",
                source=self.source["handle"],
                hint="Set TELEGRAM_API_ID and TELEGRAM_API_HASH in .env",
            )
            return []

        channel = self.source["handle"]   # e.g. "DeepStateUA" or "https://t.me/deepstateUA"
        channel = channel.replace("https://t.me/", "").lstrip("@")

        try:
            return asyncio.run(_fetch_channel(channel, since_hours=since_hours))
        except Exception as exc:
            log.error("telegram_fetch_error", channel=channel, error=str(exc))
            return []


async def _fetch_channel(channel: str, *, since_hours: int) -> list[RawPostData]:
    from datetime import timedelta
    from telethon import TelegramClient
    from telethon.sessions import StringSession

    cutoff = datetime.now(tz=timezone.utc) - timedelta(hours=since_hours)

    session = StringSession(settings.telegram_session or "")
    client = TelegramClient(
        session,
        settings.telegram_api_id,
        settings.telegram_api_hash,
    )

    results: list[RawPostData] = []

    async with client:
        entity = await client.get_entity(channel)
        async for message in client.iter_messages(
            entity,
            limit=_MAX_MESSAGES,
            offset_date=None,
            reverse=False,
        ):
            if message.date is None:
                continue
            posted_at = message.date.replace(tzinfo=timezone.utc)
            if posted_at < cutoff:
                break       # messages are returned newest-first

            text = message.text or message.message or ""
            if not text.strip():
                continue    # skip media-only posts with no caption

            media_urls: list[str] = []
            if message.media:
                # Don't download media; store a telegram:// URI for later archival
                media_urls = [f"telegram://{channel}/{message.id}/media"]

            results.append(
                RawPostData(
                    external_id=str(message.id),
                    posted_at=posted_at,
                    text=text,
                    media_urls=media_urls,
                    archive_url=f"https://t.me/{channel}/{message.id}",
                    lang=None,
                )
            )

    log.debug("telegram_fetched", channel=channel, count=len(results))
    return results
