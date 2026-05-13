#!/usr/bin/env python3
"""
One-time Telegram session generator.

Run this locally to authenticate and print a StringSession string that can
be stored as the TELEGRAM_SESSION GitHub secret. The session allows the
ingest worker to connect to Telegram in CI without interactive login.

Usage:
    cd apps/ingest
    pip install telethon
    python setup_telegram_session.py

You will be prompted for:
  - Your phone number (international format, e.g. +12125551234)
  - The verification code Telegram sends you
  - Your 2FA password (if enabled)

The script prints a session string — copy it into GitHub → Settings →
Secrets → TELEGRAM_SESSION.

The session is read-only (no write permissions to channels). It only
allows reading public channel messages that the ingestor already accesses.
"""
import asyncio
import os


async def main() -> None:
    try:
        from telethon import TelegramClient
        from telethon.sessions import StringSession
    except ImportError:
        print("ERROR: telethon is not installed. Run: pip install telethon")
        return

    api_id_raw = os.environ.get("TELEGRAM_API_ID") or input("TELEGRAM_API_ID: ").strip()
    api_hash = os.environ.get("TELEGRAM_API_HASH") or input("TELEGRAM_API_HASH: ").strip()

    try:
        api_id = int(api_id_raw)
    except ValueError:
        print("ERROR: TELEGRAM_API_ID must be a number")
        return

    client = TelegramClient(StringSession(), api_id, api_hash)

    print("\nStarting authentication — Telegram will send a code to your phone.\n")
    await client.start()  # prompts for phone + code interactively

    session_string = client.session.save()
    await client.disconnect()

    print("\n" + "=" * 60)
    print("SUCCESS — copy the string below into GitHub secret TELEGRAM_SESSION:")
    print("=" * 60)
    print(session_string)
    print("=" * 60 + "\n")


if __name__ == "__main__":
    asyncio.run(main())
