"use client";

const TACTICS = [
  "Reconnaissance",
  "Resource Development",
  "Initial Access",
  "Execution",
  "Persistence",
  "Privilege Escalation",
  "Defense Evasion",
  "Credential Access",
  "Discovery",
  "Lateral Movement",
  "Collection",
  "Command and Control",
  "Exfiltration",
  "Impact",
] as const;

type Tactic = typeof TACTICS[number];

const TECHNIQUE_MAP: Record<string, Tactic> = {
  T1595: "Reconnaissance",
  T1592: "Reconnaissance",
  T1589: "Reconnaissance",
  T1590: "Reconnaissance",
  T1591: "Reconnaissance",
  T1596: "Reconnaissance",
  T1597: "Reconnaissance",
  T1598: "Reconnaissance",

  T1583: "Resource Development",
  T1584: "Resource Development",
  T1585: "Resource Development",
  T1586: "Resource Development",
  T1587: "Resource Development",
  T1588: "Resource Development",

  T1189: "Initial Access",
  T1190: "Initial Access",
  T1133: "Initial Access",
  T1200: "Initial Access",
  T1091: "Initial Access",
  T1195: "Initial Access",
  T1199: "Initial Access",
  T1566: "Initial Access",
  T1078: "Initial Access",

  T1059: "Execution",
  T1203: "Execution",
  T1106: "Execution",
  T1053: "Execution",
  T1204: "Execution",
  T1047: "Execution",
  T1569: "Execution",

  T1098: "Persistence",
  T1197: "Persistence",
  T1547: "Persistence",
  T1037: "Persistence",
  T1176: "Persistence",
  T1554: "Persistence",
  T1136: "Persistence",
  T1543: "Persistence",
  T1574: "Persistence",

  T1548: "Privilege Escalation",
  T1134: "Privilege Escalation",
  T1068: "Privilege Escalation",
  T1055: "Privilege Escalation",
  T1484: "Privilege Escalation",

  T1140: "Defense Evasion",
  T1562: "Defense Evasion",
  T1070: "Defense Evasion",
  T1036: "Defense Evasion",
  T1112: "Defense Evasion",
  T1027: "Defense Evasion",
  T1218: "Defense Evasion",
  T1620: "Defense Evasion",

  T1110: "Credential Access",
  T1555: "Credential Access",
  T1212: "Credential Access",
  T1187: "Credential Access",
  T1056: "Credential Access",
  T1606: "Credential Access",
  T1003: "Credential Access",
  T1528: "Credential Access",
  T1558: "Credential Access",

  T1087: "Discovery",
  T1010: "Discovery",
  T1217: "Discovery",
  T1482: "Discovery",
  T1083: "Discovery",
  T1046: "Discovery",
  T1040: "Discovery",
  T1057: "Discovery",
  T1012: "Discovery",
  T1049: "Discovery",
  T1033: "Discovery",
  T1007: "Discovery",

  T1210: "Lateral Movement",
  T1534: "Lateral Movement",
  T1570: "Lateral Movement",
  T1563: "Lateral Movement",
  T1021: "Lateral Movement",
  T1080: "Lateral Movement",

  T1560: "Collection",
  T1123: "Collection",
  T1119: "Collection",
  T1115: "Collection",
  T1530: "Collection",
  T1213: "Collection",
  T1005: "Collection",
  T1039: "Collection",

  T1071: "Command and Control",
  T1132: "Command and Control",
  T1001: "Command and Control",
  T1568: "Command and Control",
  T1573: "Command and Control",
  T1105: "Command and Control",
  T1104: "Command and Control",
  T1095: "Command and Control",
  T1102: "Command and Control",

  T1020: "Exfiltration",
  T1030: "Exfiltration",
  T1048: "Exfiltration",
  T1041: "Exfiltration",
  T1011: "Exfiltration",
  T1052: "Exfiltration",

  T1531: "Impact",
  T1485: "Impact",
  T1486: "Impact",
  T1491: "Impact",
  T1561: "Impact",
  T1499: "Impact",
  T1496: "Impact",
  T1489: "Impact",
  T1490: "Impact",
};

const TACTIC_SHORT: Record<Tactic, string> = {
  "Reconnaissance":        "RECON",
  "Resource Development":  "RES DEV",
  "Initial Access":        "INIT ACC",
  "Execution":             "EXEC",
  "Persistence":           "PERSIST",
  "Privilege Escalation":  "PRIV ESC",
  "Defense Evasion":       "DEF EVA",
  "Credential Access":     "CRED ACC",
  "Discovery":             "DISCOV",
  "Lateral Movement":      "LAT MOV",
  "Collection":            "COLLECT",
  "Command and Control":   "C2",
  "Exfiltration":          "EXFIL",
  "Impact":                "IMPACT",
};

interface Props {
  techniques: string[];
}

export default function MITREChain({ techniques }: Props) {
  const techniqueSet = new Set(techniques.map((t) => t.split(".")[0]));

  const tacticTechniques = new Map<Tactic, string[]>();
  for (const tactic of TACTICS) tacticTechniques.set(tactic, []);

  for (const t of techniques) {
    const base = t.split(".")[0];
    const tactic = TECHNIQUE_MAP[base];
    if (tactic) tacticTechniques.get(tactic)!.push(t);
  }

  return (
    <div className="overflow-x-auto">
      <div className="flex gap-0.5 min-w-max">
        {TACTICS.map((tactic) => {
          const hits = tacticTechniques.get(tactic)!;
          const active = hits.length > 0;

          return (
            <div
              key={tactic}
              className="flex flex-col border"
              style={{
                minWidth: 72,
                maxWidth: 80,
                borderColor: active ? "#ef444440" : "#1a2340",
                background: active ? "#1a0a0e" : "#0a0e1a",
              }}
            >
              <div
                className="px-1.5 py-1 text-center font-mono"
                style={{
                  fontSize: "7px",
                  letterSpacing: "0.08em",
                  background: active ? "#ef444420" : "#0f1526",
                  color: active ? "#ef4444" : "#304060",
                  borderBottom: `1px solid ${active ? "#ef444430" : "#1a2340"}`,
                }}
              >
                {TACTIC_SHORT[tactic]}
              </div>
              <div className="flex flex-col gap-0.5 p-1 min-h-[40px]">
                {hits.map((t) => (
                  <span
                    key={t}
                    className="font-mono text-center"
                    style={{
                      fontSize: "7px",
                      padding: "1px 3px",
                      background: "#ef444425",
                      color: "#ff2d55",
                      border: "1px solid #ef444430",
                      letterSpacing: "0.04em",
                    }}
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
