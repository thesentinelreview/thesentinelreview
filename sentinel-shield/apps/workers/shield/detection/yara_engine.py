from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field
from typing import Any

import structlog

log = structlog.get_logger()


@dataclass
class YARAMatch:
    rule_name: str
    threat_family: str | None
    severity: str
    meta: dict[str, Any] = field(default_factory=dict)


# Lightweight metadata-based YARA matching for v1.
# Operates on event metadata (hash, filename, process name, cmdline) without
# requiring binary file access. Full binary scanning added when agent gains
# file read capability.

_PROCESS_PATTERNS: list[dict[str, Any]] = [
    {
        "rule_name": "Mimikatz_CLI",
        "pattern": re.compile(r"mimikatz|sekurlsa|lsadump", re.IGNORECASE),
        "field": "process_name_or_cmdline",
        "threat_family": "Mimikatz",
        "severity": "critical",
    },
    {
        "rule_name": "PowerShell_Encoded",
        "pattern": re.compile(r"-[Ee]nc(odedCommand)?[\s]+[A-Za-z0-9+/=]{50,}", re.IGNORECASE),
        "field": "process_cmdline",
        "threat_family": "PowerShell_Obfuscation",
        "severity": "high",
    },
    {
        "rule_name": "PowerShell_DownloadCradle",
        "pattern": re.compile(
            r"(DownloadString|DownloadFile|WebClient|Invoke-Expression|iex)\s*[\(\.]",
            re.IGNORECASE,
        ),
        "field": "process_cmdline",
        "threat_family": "PowerShell_Cradle",
        "severity": "high",
    },
    {
        "rule_name": "LOLBAS_Suspicious",
        "pattern": re.compile(
            r"(certutil|bitsadmin|mshta|wscript|cscript|regsvr32|rundll32|msiexec)\.(exe)?",
            re.IGNORECASE,
        ),
        "field": "process_name",
        "threat_family": "LOLBAS",
        "severity": "medium",
    },
    {
        "rule_name": "Ransomware_VSSDelete",
        "pattern": re.compile(
            r"(vssadmin|wmic).*(delete shadows|shadowcopy delete)",
            re.IGNORECASE,
        ),
        "field": "process_cmdline",
        "threat_family": "Ransomware",
        "severity": "critical",
    },
    {
        "rule_name": "Credential_Dump_Path",
        "pattern": re.compile(r"(sam|ntds\.dit|lsass\.dmp)", re.IGNORECASE),
        "field": "file_path_or_cmdline",
        "threat_family": "CredentialDumping",
        "severity": "critical",
    },
    {
        "rule_name": "Suspicious_Temp_Exec",
        "pattern": re.compile(
            r"(\\temp\\|\\tmp\\|\\appdata\\local\\temp\\|/tmp/)[^\s]*\.(exe|bat|ps1|vbs|js)",
            re.IGNORECASE,
        ),
        "field": "process_name",
        "threat_family": None,
        "severity": "medium",
    },
    {
        "rule_name": "PersistenceRun_Key",
        "pattern": re.compile(
            r"(HKCU|HKLM)\\Software\\Microsoft\\Windows\\CurrentVersion\\Run",
            re.IGNORECASE,
        ),
        "field": "process_cmdline",
        "threat_family": "Persistence",
        "severity": "high",
    },
]

_KNOWN_BAD_HASHES: set[str] = {
    # EICAR test file SHA256
    "275a021bbfb6489e54d471899f7db9d1663fc695ec2fe2a2c4538aabf651fd0f",
}


class YARAEngine:
    def __init__(self) -> None:
        self._patterns = _PROCESS_PATTERNS
        log.info("yara_engine.initialized", rule_count=len(self._patterns))

    def load_db_rules(self, conn: Any) -> None:
        """Optionally load custom rules from the yara_rules table."""
        try:
            rows = conn.execute(
                "SELECT rule_name, rule_content, threat_family, severity FROM yara_rules WHERE enabled = true"
            ).fetchall()
            for row in rows:
                content = row["rule_content"]
                # Parse simple string: patterns field from rule_content
                match = re.search(r'\$\w+\s*=\s*"([^"]+)"', content)
                if match:
                    self._patterns.append({
                        "rule_name": row["rule_name"],
                        "pattern": re.compile(re.escape(match.group(1)), re.IGNORECASE),
                        "field": "process_name_or_cmdline",
                        "threat_family": row["threat_family"],
                        "severity": row["severity"] or "medium",
                    })
            log.info("yara_engine.db_rules_loaded", count=len(rows))
        except Exception as exc:
            log.warning("yara_engine.db_rules_failed", error=str(exc))

    def match_event(self, event: dict[str, Any]) -> list[YARAMatch]:
        matches: list[YARAMatch] = []

        process_hash = event.get("process_hash") or event.get("file_hash") or ""
        if process_hash.lower() in _KNOWN_BAD_HASHES:
            matches.append(YARAMatch(
                rule_name="EICAR_Test_File",
                threat_family="TestMalware",
                severity="critical",
            ))

        process_name = event.get("process_name") or ""
        cmdline = event.get("process_cmdline") or ""
        file_path = event.get("file_path") or ""

        for rule in self._patterns:
            field = rule["field"]
            target = ""
            if field == "process_name":
                target = process_name
            elif field == "process_cmdline":
                target = cmdline
            elif field == "process_name_or_cmdline":
                target = f"{process_name} {cmdline}"
            elif field == "file_path_or_cmdline":
                target = f"{file_path} {cmdline}"

            if target and rule["pattern"].search(target):
                matches.append(YARAMatch(
                    rule_name=rule["rule_name"],
                    threat_family=rule["threat_family"],
                    severity=rule["severity"],
                ))

        return matches
