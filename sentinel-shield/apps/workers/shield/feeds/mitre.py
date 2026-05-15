from __future__ import annotations

import uuid
from typing import Any

import structlog

from ..db import get_conn, upsert_attack_technique
from .base import BaseFeed

log = structlog.get_logger()

_STIX_URL = "https://raw.githubusercontent.com/mitre/cti/master/enterprise-attack/enterprise-attack.json"

_TACTIC_MAP = {
    "TA0001": "initial-access",
    "TA0002": "execution",
    "TA0003": "persistence",
    "TA0004": "privilege-escalation",
    "TA0005": "defense-evasion",
    "TA0006": "credential-access",
    "TA0007": "discovery",
    "TA0008": "lateral-movement",
    "TA0009": "collection",
    "TA0010": "exfiltration",
    "TA0011": "command-and-control",
    "TA0040": "impact",
    "TA0042": "resource-development",
    "TA0043": "reconnaissance",
}


class MITREFeed(BaseFeed):
    """MITRE ATT&CK Enterprise techniques from STIX bundle."""

    feed_handle = "mitre_attack"
    feed_type = "mitre_attack"

    def fetch(self, feed_id: uuid.UUID) -> list[dict[str, Any]]:
        return []

    def sync_techniques(self) -> int:
        log.info("mitre.fetching")
        resp = self._get(_STIX_URL)
        bundle = resp.json()

        techniques: list[dict[str, Any]] = []
        for obj in bundle.get("objects", []):
            if obj.get("type") != "attack-pattern":
                continue
            if obj.get("x_mitre_deprecated") or obj.get("revoked"):
                continue

            ext_refs = obj.get("external_references", [])
            technique_id = next(
                (r["external_id"] for r in ext_refs if r.get("source_name") == "mitre-attack"),
                None,
            )
            if not technique_id:
                continue

            kill_chain = obj.get("kill_chain_phases", [])
            tactic = next(
                (p["phase_name"] for p in kill_chain if p.get("kill_chain_name") == "mitre-attack"),
                "unknown",
            )

            platforms = obj.get("x_mitre_platforms", [])
            description = next(
                (d["value"] for d in (obj.get("description") or "") if isinstance(d, dict)),
                obj.get("description") or "",
            )
            if isinstance(description, list):
                description = " ".join(description)

            is_sub = "." in technique_id
            parent_id = technique_id.split(".")[0] if is_sub else None

            techniques.append({
                "technique_id": technique_id,
                "name": obj.get("name", ""),
                "tactic": tactic,
                "description": str(description)[:2000] if description else None,
                "platforms": platforms,
                "is_subtechnique": is_sub,
                "parent_id": parent_id,
            })

        with get_conn() as conn:
            for t in techniques:
                upsert_attack_technique(conn, **t)
            conn.commit()

        log.info("mitre.synced", count=len(techniques))
        return len(techniques)
