-- Sentinel Shield — Security Platform Schema
-- Standalone — no connection to Sentinel Review

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ── Job queue (FOR UPDATE SKIP LOCKED pattern) ────────────────────────────────
CREATE TABLE jobs (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    job_type     TEXT        NOT NULL,
    payload      JSONB       NOT NULL DEFAULT '{}',
    status       TEXT        NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending','running','done','failed')),
    attempts     SMALLINT    NOT NULL DEFAULT 0,
    max_attempts SMALLINT    NOT NULL DEFAULT 3,
    error        TEXT,
    scheduled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    started_at   TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX jobs_pending_idx ON jobs (scheduled_at ASC) WHERE status = 'pending';

-- ── LLM audit log ─────────────────────────────────────────────────────────────
CREATE TABLE llm_logs (
    id                UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    purpose           TEXT    NOT NULL,
    model             TEXT    NOT NULL,
    prompt_tokens     INT,
    completion_tokens INT,
    alert_id          UUID,   -- FK added later
    incident_id       UUID,   -- FK added later
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Threat feed catalog ────────────────────────────────────────────────────────
CREATE TABLE threat_feeds (
    id             UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    handle         TEXT    NOT NULL UNIQUE,
    feed_type      TEXT    NOT NULL CHECK (feed_type IN
                           ('cve_nvd','mitre_attack','abuse_ioc','phishing','yara_rules')),
    url            TEXT,
    is_active      BOOLEAN NOT NULL DEFAULT true,
    poll_minutes   INT     NOT NULL DEFAULT 360,
    last_polled_at TIMESTAMPTZ,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO threat_feeds (handle, feed_type, url, poll_minutes) VALUES
    ('nvd_cve',         'cve_nvd',      'https://services.nvd.nist.gov/rest/json/cves/2.0', 360),
    ('mitre_attack',    'mitre_attack', 'https://raw.githubusercontent.com/mitre/cti/master/enterprise-attack/enterprise-attack.json', 10080),
    ('abuse_bazaar',    'abuse_ioc',    'https://bazaar.abuse.ch/export/txt/sha256/recent/', 60),
    ('abuse_urlhaus',   'abuse_ioc',    'https://urlhaus.abuse.ch/downloads/csv_recent/', 60),
    ('abuse_threatfox', 'abuse_ioc',    'https://threatfox-api.abuse.ch/api/v1/', 60),
    ('openphish',       'phishing',     'https://openphish.com/feed.txt', 60);

-- ── IOCs — Indicators of Compromise ───────────────────────────────────────────
CREATE TABLE iocs (
    id             UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    feed_id        UUID    REFERENCES threat_feeds(id),
    ioc_type       TEXT    NOT NULL CHECK (ioc_type IN
                           ('ip','domain','url','hash_md5','hash_sha1','hash_sha256',
                            'email','cidr','filename')),
    value          TEXT    NOT NULL,
    threat_type    TEXT,
    malware_family TEXT,
    confidence     SMALLINT NOT NULL DEFAULT 50 CHECK (confidence BETWEEN 0 AND 100),
    severity       TEXT    NOT NULL DEFAULT 'medium'
                           CHECK (severity IN ('critical','high','medium','low','info')),
    first_seen     TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen      TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at     TIMESTAMPTZ,
    tags           TEXT[]  NOT NULL DEFAULT '{}',
    raw_data       JSONB   NOT NULL DEFAULT '{}',
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (ioc_type, value)
);
CREATE INDEX iocs_type_value_idx  ON iocs (ioc_type, value);
CREATE INDEX iocs_severity_idx    ON iocs (severity, last_seen DESC);
CREATE INDEX iocs_value_trgm_idx  ON iocs USING GIN (value gin_trgm_ops);
CREATE INDEX iocs_expires_idx     ON iocs (expires_at) WHERE expires_at IS NOT NULL;

-- ── CVEs ───────────────────────────────────────────────────────────────────────
CREATE TABLE cves (
    id                UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    cve_id            TEXT    NOT NULL UNIQUE,
    published_at      TIMESTAMPTZ NOT NULL,
    modified_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    cvss_v3_score     NUMERIC(3,1),
    cvss_v3_vector    TEXT,
    severity          TEXT    CHECK (severity IN ('critical','high','medium','low','none')),
    description       TEXT    NOT NULL DEFAULT '',
    affected_products JSONB   NOT NULL DEFAULT '[]',
    references        JSONB   NOT NULL DEFAULT '[]',
    has_exploit       BOOLEAN NOT NULL DEFAULT false,
    kev_listed        BOOLEAN NOT NULL DEFAULT false,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX cves_severity_idx ON cves (severity, cvss_v3_score DESC NULLS LAST);
CREATE INDEX cves_published_idx ON cves (published_at DESC);
CREATE INDEX cves_kev_idx       ON cves (kev_listed) WHERE kev_listed = true;

-- ── MITRE ATT&CK techniques ────────────────────────────────────────────────────
CREATE TABLE attack_techniques (
    technique_id    TEXT    PRIMARY KEY,
    name            TEXT    NOT NULL,
    tactic          TEXT    NOT NULL,
    description     TEXT,
    platforms       TEXT[]  NOT NULL DEFAULT '{}',
    is_subtechnique BOOLEAN NOT NULL DEFAULT false,
    parent_id       TEXT
);
CREATE INDEX attack_tactic_idx ON attack_techniques (tactic);

-- ── YARA rules library ─────────────────────────────────────────────────────────
CREATE TABLE yara_rules (
    id            UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_name     TEXT    NOT NULL UNIQUE,
    rule_content  TEXT    NOT NULL,
    threat_family TEXT,
    severity      TEXT    CHECK (severity IN ('critical','high','medium','low')),
    source        TEXT    NOT NULL DEFAULT 'custom',
    enabled       BOOLEAN NOT NULL DEFAULT true,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Asset inventory ────────────────────────────────────────────────────────────
CREATE TABLE assets (
    id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    hostname    TEXT,
    ip_address  INET,
    os_platform TEXT    CHECK (os_platform IN ('windows','darwin','linux','unknown')),
    os_version  TEXT,
    department  TEXT,
    owner       TEXT,
    criticality TEXT    NOT NULL DEFAULT 'medium'
                        CHECK (criticality IN ('critical','high','medium','low')),
    risk_score  SMALLINT NOT NULL DEFAULT 0 CHECK (risk_score BETWEEN 0 AND 100),
    is_active   BOOLEAN NOT NULL DEFAULT true,
    last_seen   TIMESTAMPTZ,
    location    GEOMETRY(Point, 4326),
    tags        TEXT[]  NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (ip_address)
);
CREATE INDEX assets_risk_idx     ON assets (risk_score DESC);
CREATE INDEX assets_active_idx   ON assets (is_active, last_seen DESC);
CREATE INDEX assets_location_idx ON assets USING GIST (location) WHERE location IS NOT NULL;

-- ── Sensor registry (registered endpoint agents) ──────────────────────────────
CREATE TABLE sensors (
    id           UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id     UUID    REFERENCES assets(id),
    name         TEXT    NOT NULL,
    api_key_hash TEXT    NOT NULL UNIQUE,
    version      TEXT,
    last_checkin TIMESTAMPTZ,
    is_active    BOOLEAN NOT NULL DEFAULT true,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Telemetry events (append-only raw stream from agents) ─────────────────────
CREATE TABLE telemetry_events (
    id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    sensor_id       UUID    REFERENCES sensors(id),
    asset_id        UUID    REFERENCES assets(id),
    event_time      TIMESTAMPTZ NOT NULL,
    event_type      TEXT    NOT NULL CHECK (event_type IN (
                            'process_start','process_exit','file_create','file_modify',
                            'file_delete','network_connect','dns_query','login',
                            'login_fail','usb_mount','scan_result','forensics_capture')),
    process_name    TEXT,
    process_pid     INT,
    process_hash    TEXT,
    process_cmdline TEXT,
    parent_process  TEXT,
    src_ip          INET,
    dst_ip          INET,
    dst_port        INT,
    protocol        TEXT,
    dns_query       TEXT,
    http_url        TEXT,
    bytes_sent      BIGINT,
    file_path       TEXT,
    file_hash       TEXT,
    user_account    TEXT,
    auth_success    BOOLEAN,
    raw_payload     JSONB   NOT NULL DEFAULT '{}',
    processed_at    TIMESTAMPTZ,
    received_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX telemetry_unprocessed_idx ON telemetry_events (received_at ASC)
    WHERE processed_at IS NULL;
CREATE INDEX telemetry_asset_time_idx  ON telemetry_events (asset_id, event_time DESC);
CREATE INDEX telemetry_process_hash_idx ON telemetry_events (process_hash)
    WHERE process_hash IS NOT NULL;
CREATE INDEX telemetry_dst_ip_idx      ON telemetry_events (dst_ip, event_time DESC)
    WHERE dst_ip IS NOT NULL;
CREATE INDEX telemetry_file_hash_idx   ON telemetry_events (file_hash)
    WHERE file_hash IS NOT NULL;

-- ── Security alerts ────────────────────────────────────────────────────────────
CREATE TABLE security_alerts (
    id               UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    title            TEXT    NOT NULL,
    description      TEXT,
    alert_type       TEXT    NOT NULL CHECK (alert_type IN (
                             'malware_detected','ransomware_behavior','ioc_match',
                             'yara_rule_match','sigma_rule_match','anomaly',
                             'brute_force','port_scan','phishing_url','c2_beacon',
                             'lateral_movement','data_exfil','cve_exploitation',
                             'zero_day_suspected','suspicious_process')),
    severity         TEXT    NOT NULL DEFAULT 'medium'
                             CHECK (severity IN ('critical','high','medium','low','info')),
    status           TEXT    NOT NULL DEFAULT 'open'
                             CHECK (status IN ('open','investigating','resolved',
                                               'false_positive','escalated')),
    asset_id         UUID    REFERENCES assets(id),
    ioc_id           UUID    REFERENCES iocs(id),
    cve_id           UUID    REFERENCES cves(id),
    rule_id          TEXT,
    mitre_technique  TEXT    REFERENCES attack_techniques(technique_id),
    telemetry_ids    UUID[]  NOT NULL DEFAULT '{}',
    ai_summary       TEXT,
    ai_recommendation TEXT,
    ai_confidence    SMALLINT CHECK (ai_confidence BETWEEN 0 AND 100),
    ai_false_positive_likelihood SMALLINT CHECK (ai_false_positive_likelihood BETWEEN 0 AND 100),
    assigned_to      TEXT,
    resolved_at      TIMESTAMPTZ,
    occurred_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX alerts_open_idx    ON security_alerts (severity, occurred_at DESC)
    WHERE status IN ('open','investigating');
CREATE INDEX alerts_asset_idx   ON security_alerts (asset_id, occurred_at DESC);
CREATE INDEX alerts_type_idx    ON security_alerts (alert_type, occurred_at DESC);
CREATE INDEX alerts_mitre_idx   ON security_alerts (mitre_technique)
    WHERE mitre_technique IS NOT NULL;

ALTER TABLE llm_logs ADD CONSTRAINT llm_alert_fk
    FOREIGN KEY (alert_id) REFERENCES security_alerts(id);

-- ── Incidents (correlated alert groups) ────────────────────────────────────────
CREATE TABLE incidents (
    id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    title       TEXT    NOT NULL,
    summary     TEXT,
    severity    TEXT    NOT NULL DEFAULT 'high'
                        CHECK (severity IN ('critical','high','medium','low')),
    status      TEXT    NOT NULL DEFAULT 'open'
                        CHECK (status IN ('open','investigating','contained',
                                          'eradicated','closed')),
    assigned_to TEXT,
    ai_analysis TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE incident_alerts (
    incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    alert_id    UUID NOT NULL REFERENCES security_alerts(id) ON DELETE CASCADE,
    added_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (incident_id, alert_id)
);
ALTER TABLE llm_logs ADD CONSTRAINT llm_incident_fk
    FOREIGN KEY (incident_id) REFERENCES incidents(id);

-- ── Blocklist ──────────────────────────────────────────────────────────────────
CREATE TABLE blocklist (
    id         UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    entry_type TEXT    NOT NULL CHECK (entry_type IN ('ip','cidr','domain','url','hash')),
    value      TEXT    NOT NULL,
    reason     TEXT    NOT NULL,
    alert_id   UUID    REFERENCES security_alerts(id),
    added_by   TEXT    NOT NULL DEFAULT 'system',
    expires_at TIMESTAMPTZ,
    is_active  BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (entry_type, value)
);
CREATE INDEX blocklist_active_idx ON blocklist (entry_type, value) WHERE is_active = true;

-- ── Behavioral baselines (per-asset hourly stats) ─────────────────────────────
CREATE TABLE asset_baselines (
    asset_id     UUID     NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    metric       TEXT     NOT NULL,
    hour_of_day  SMALLINT NOT NULL CHECK (hour_of_day BETWEEN 0 AND 23),
    day_of_week  SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
    mean         NUMERIC  NOT NULL DEFAULT 0,
    stddev       NUMERIC  NOT NULL DEFAULT 0,
    sample_count INT      NOT NULL DEFAULT 0,
    last_updated TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (asset_id, metric, hour_of_day, day_of_week)
);

-- ── Playbook run log ───────────────────────────────────────────────────────────
CREATE TABLE playbook_runs (
    id            UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    playbook_id   TEXT    NOT NULL,
    alert_id      UUID    REFERENCES security_alerts(id),
    status        TEXT    NOT NULL DEFAULT 'running'
                          CHECK (status IN ('running','completed','failed','partial')),
    actions_taken JSONB   NOT NULL DEFAULT '[]',
    started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at  TIMESTAMPTZ
);

-- ── Sensor command queue (server → agent reverse channel) ─────────────────────
CREATE TABLE sensor_commands (
    id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
    sensor_id   UUID    NOT NULL REFERENCES sensors(id),
    command     TEXT    NOT NULL CHECK (command IN (
                        'capture_process_list','capture_network_state',
                        'capture_file_hashes','capture_auth_log','isolate')),
    params      JSONB   NOT NULL DEFAULT '{}',
    status      TEXT    NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','delivered','completed','failed')),
    result      JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    delivered_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);
CREATE INDEX sensor_commands_pending_idx ON sensor_commands (sensor_id, created_at)
    WHERE status = 'pending';
