export type EventType = "strike" | "clash" | "movement";
export type Confidence = "verified" | "partial" | "unconfirmed";
export type Platform = "x" | "telegram" | "rss" | "wire";
export type TheaterKey = "ukraine" | "iran";

export interface TheaterConfig {
  id: TheaterKey;
  label: string;
  mapCenter: [number, number];
  mapZoom: number;
  mapSubtitle: string;
  briefingTitle: string;
}

export const THEATERS: Record<TheaterKey, TheaterConfig> = {
  ukraine: {
    id: "ukraine",
    label: "Ukraine",
    mapCenter: [38.2, 48.6],
    mapZoom: 7,
    mapSubtitle: "Eastern Theater — Donetsk / Luhansk Oblasts",
    briefingTitle: "Daily Briefing — Eastern Theater",
  },
  iran: {
    id: "iran",
    label: "Iran",
    mapCenter: [53.7, 32.4],
    mapZoom: 5,
    mapSubtitle: "Iran Theater — Nuclear Sites and Proxy Activity",
    briefingTitle: "Daily Briefing — Iran Theater",
  },
};

export function resolveTheater(raw: string | undefined): TheaterConfig {
  return THEATERS[(raw as TheaterKey) in THEATERS ? (raw as TheaterKey) : "ukraine"];
}

export interface MapEvent {
  id: string;
  event_type: EventType;
  occurred_at: string;
  lat: number;
  lng: number;
  location_name: string;
  oblast: string;
  description: string;
  confidence: Confidence;
  source_count: number;
  minutes_ago: number;
}

export interface Alert {
  id: string;
  event_type: EventType;
  title: string;
  confidence: Confidence;
  source_count: number;
  minutes_ago: number;
}

export interface IntensityDay {
  label: string;
  value: number; // 0–100
  hot: boolean;
}

export interface Source {
  rank: number;
  handle: string;
  display_name: string;
  platform: Platform;
  events_count: number;
  verified_rate: number; // 0–100
}

export interface Stats {
  events: number;
  strikes: number;
  verified_pct: number;
  vs_7d_avg_pct: number;
}

export interface BriefingData {
  id: string;
  date: string;
  utc_time: string;
  source_count: number;
  reviewed: boolean;
  paragraphs: string[];
}

// ---------------------------------------------------------------------------
// Extended types for detail pages
// ---------------------------------------------------------------------------

export interface EventSource {
  id: string;
  handle: string;
  display_name: string;
  platform: Platform;
  url: string;
  posted_at: string;
  text_excerpt: string;
  relationship: "primary" | "corroborating" | "contradicting";
  trust_tier: 1 | 2 | 3;
}

export interface EvidenceItem {
  type: "geolocation" | "screenshot" | "official_statement" | "wire_report";
  label: string;
  notes: string;
}

export interface ChangeHistoryEntry {
  timestamp: string;
  change: string;
}

export interface EventDetail extends MapEvent {
  actor: string | null;
  human_reviewed_at: string | null;
  human_reviewer_notes: string | null;
  event_sources: EventSource[];
  evidence: EvidenceItem[];
  change_history: ChangeHistoryEntry[];
}

export interface FullBriefing extends BriefingData {
  full_paragraphs: string[];
  referenced_event_ids: string[];
  confidence_summary: { verified: number; partial: number; unconfirmed: number };
}

export interface SourceDetail extends Source {
  url: string;
  events_7d: number;
  events_30d: number;
  last_event_at: string;
  trust_tier: 1 | 2 | 3;
  notes: string;
}

// ---------------------------------------------------------------------------
// Dashboard seed data
// ---------------------------------------------------------------------------

export const stats: Stats = {
  events: 47,
  strikes: 14,
  verified_pct: 86,
  vs_7d_avg_pct: 23,
};

export const mapEvents: MapEvent[] = [
  {
    id: "evt-001",
    event_type: "strike",
    occurred_at: "2026-05-07T12:24:00Z",
    lat: 48.07,
    lng: 37.71,
    location_name: "Pokrovsk",
    oblast: "Donetsk",
    description: "7 reported impacts on industrial site, civilian infrastructure damaged.",
    confidence: "verified",
    source_count: 3,
    minutes_ago: 18,
  },
  {
    id: "evt-002",
    event_type: "strike",
    occurred_at: "2026-05-07T12:08:00Z",
    lat: 48.60,
    lng: 37.99,
    location_name: "Bakhmut",
    oblast: "Donetsk",
    description: "Artillery strikes on residential district.",
    confidence: "partial",
    source_count: 2,
    minutes_ago: 34,
  },
  {
    id: "evt-003",
    event_type: "strike",
    occurred_at: "2026-05-07T11:55:00Z",
    lat: 48.73,
    lng: 37.55,
    location_name: "Kramatorsk",
    oblast: "Donetsk",
    description: "Drone strike on logistics hub.",
    confidence: "partial",
    source_count: 2,
    minutes_ago: 47,
  },
  {
    id: "evt-004",
    event_type: "strike",
    occurred_at: "2026-05-07T11:40:00Z",
    lat: 47.95,
    lng: 37.85,
    location_name: "Southern Donetsk axis",
    oblast: "Donetsk",
    description: "Glide bomb impact, unverified target.",
    confidence: "unconfirmed",
    source_count: 1,
    minutes_ago: 62,
  },
  {
    id: "evt-005",
    event_type: "strike",
    occurred_at: "2026-05-07T11:28:00Z",
    lat: 48.13,
    lng: 37.75,
    location_name: "Avdiivka outskirts",
    oblast: "Donetsk",
    description: "Reported shelling, no footage.",
    confidence: "unconfirmed",
    source_count: 1,
    minutes_ago: 74,
  },
  {
    id: "evt-006",
    event_type: "clash",
    occurred_at: "2026-05-07T12:00:00Z",
    lat: 48.10,
    lng: 37.68,
    location_name: "Pokrovsk front",
    oblast: "Donetsk",
    description: "Infantry contact, unclear outcome.",
    confidence: "partial",
    source_count: 2,
    minutes_ago: 42,
  },
  {
    id: "evt-007",
    event_type: "clash",
    occurred_at: "2026-05-07T11:50:00Z",
    lat: 48.57,
    lng: 37.84,
    location_name: "Chasiv Yar",
    oblast: "Donetsk",
    description: "Assault repelled per Ukrainian sources.",
    confidence: "partial",
    source_count: 2,
    minutes_ago: 52,
  },
  {
    id: "evt-008",
    event_type: "clash",
    occurred_at: "2026-05-07T11:00:00Z",
    lat: 49.72,
    lng: 37.60,
    location_name: "Kupiansk",
    oblast: "Kharkiv",
    description: "Unverified armor movement, single milblog source.",
    confidence: "unconfirmed",
    source_count: 1,
    minutes_ago: 102,
  },
  {
    id: "evt-009",
    event_type: "clash",
    occurred_at: "2026-05-07T10:45:00Z",
    lat: 49.21,
    lng: 37.27,
    location_name: "Izium sector",
    oblast: "Kharkiv",
    description: "Patrol contact, casualties unknown.",
    confidence: "unconfirmed",
    source_count: 1,
    minutes_ago: 117,
  },
  {
    id: "evt-010",
    event_type: "movement",
    occurred_at: "2026-05-07T11:30:00Z",
    lat: 49.90,
    lng: 37.30,
    location_name: "Northern Kharkiv axis",
    oblast: "Kharkiv",
    description: "Convoy spotted on M03 highway.",
    confidence: "partial",
    source_count: 2,
    minutes_ago: 72,
  },
  {
    id: "evt-011",
    event_type: "movement",
    occurred_at: "2026-05-07T11:10:00Z",
    lat: 48.55,
    lng: 39.30,
    location_name: "Eastern Luhansk",
    oblast: "Luhansk",
    description: "Logistics column, direction unknown.",
    confidence: "unconfirmed",
    source_count: 1,
    minutes_ago: 92,
  },
  {
    id: "evt-012",
    event_type: "movement",
    occurred_at: "2026-05-07T10:30:00Z",
    lat: 48.65,
    lng: 37.52,
    location_name: "Druzhkivka",
    oblast: "Donetsk",
    description: "Redeployment near Druzhkivka.",
    confidence: "partial",
    source_count: 2,
    minutes_ago: 132,
  },
];

export const alerts: Alert[] = [
  {
    id: "evt-001",
    event_type: "strike",
    title: "Strike cluster, Pokrovsk axis",
    confidence: "verified",
    source_count: 3,
    minutes_ago: 18,
  },
  {
    id: "evt-008",
    event_type: "clash",
    title: "Unverified armor movement, Kupiansk sector",
    confidence: "unconfirmed",
    source_count: 1,
    minutes_ago: 42,
  },
  {
    id: "evt-010",
    event_type: "movement",
    title: "Convoy spotted, M03 highway",
    confidence: "partial",
    source_count: 2,
    minutes_ago: 72,
  },
];

export const intensity: IntensityDay[] = [
  { label: "Mon", value: 38, hot: false },
  { label: "Tue", value: 45, hot: false },
  { label: "Wed", value: 32, hot: false },
  { label: "Thu", value: 55, hot: false },
  { label: "Fri", value: 62, hot: false },
  { label: "Sat", value: 78, hot: true },
  { label: "Sun", value: 92, hot: true },
];

export const sources: Source[] = [
  { rank: 1, handle: "@DefMon3", display_name: "@DefMon3", platform: "x", events_count: 14, verified_rate: 92 },
  { rank: 2, handle: "@war_mapper", display_name: "@war_mapper", platform: "x", events_count: 9, verified_rate: 88 },
  { rank: 3, handle: "mil_channels", display_name: "Telegram (mil channels)", platform: "telegram", events_count: 22, verified_rate: 64 },
  { rank: 4, handle: "local_wire", display_name: "Local press wire", platform: "wire", events_count: 6, verified_rate: 79 },
  { rank: 5, handle: "@OSINTtechnical", display_name: "@OSINTtechnical", platform: "x", events_count: 5, verified_rate: 94 },
];

export const briefing: BriefingData = {
  id: "brief-20260507",
  date: "07 May 2026",
  utc_time: "14:42 UTC",
  source_count: 38,
  reviewed: false,
  paragraphs: [
    "Strike activity along the Pokrovsk axis intensified overnight, with seven separate impacts reported in the eastern oblast — a 23% jump over the seven-day rolling average. Two clusters are corroborated by geolocated footage from three independent accounts, including @DefMon3 and Reuters stringers on the ground. Damage assessments suggest industrial and civilian infrastructure as primary targets.",
    "Movement reports near Kupiansk remain single-sourced and unverified; treat with caution pending corroboration.",
  ],
};

// ---------------------------------------------------------------------------
// Iran theater placeholder data
// ---------------------------------------------------------------------------

export const iranStats: Stats = {
  events: 19,
  strikes: 6,
  verified_pct: 74,
  vs_7d_avg_pct: 11,
};

export const iranMapEvents: MapEvent[] = [
  {
    id: "ir-evt-001",
    event_type: "strike",
    occurred_at: "2026-05-13T09:14:00Z",
    lat: 33.72,
    lng: 51.72,
    location_name: "Natanz",
    oblast: "Isfahan Province",
    description: "Reported explosion near underground enrichment facility perimeter. Single source; details unconfirmed.",
    confidence: "unconfirmed",
    source_count: 1,
    minutes_ago: 28,
  },
  {
    id: "ir-evt-002",
    event_type: "strike",
    occurred_at: "2026-05-13T08:50:00Z",
    lat: 32.66,
    lng: 51.68,
    location_name: "Isfahan",
    oblast: "Isfahan Province",
    description: "Air-defense activation reported over Isfahan airspace. Intercept unconfirmed.",
    confidence: "partial",
    source_count: 2,
    minutes_ago: 52,
  },
  {
    id: "ir-evt-003",
    event_type: "strike",
    occurred_at: "2026-05-13T08:20:00Z",
    lat: 35.69,
    lng: 51.39,
    location_name: "Tehran",
    oblast: "Tehran Province",
    description: "Explosions heard in northern Tehran suburbs. Cause unknown.",
    confidence: "unconfirmed",
    source_count: 1,
    minutes_ago: 82,
  },
  {
    id: "ir-evt-004",
    event_type: "movement",
    occurred_at: "2026-05-13T07:55:00Z",
    lat: 34.09,
    lng: 49.70,
    location_name: "Arak",
    oblast: "Markazi Province",
    description: "Convoy of military vehicles observed near Arak heavy-water reactor site.",
    confidence: "partial",
    source_count: 2,
    minutes_ago: 107,
  },
  {
    id: "ir-evt-005",
    event_type: "movement",
    occurred_at: "2026-05-13T07:30:00Z",
    lat: 27.19,
    lng: 56.27,
    location_name: "Bandar Abbas",
    oblast: "Hormozgan Province",
    description: "IRGC naval vessels departed Bandar Abbas; destination unknown.",
    confidence: "partial",
    source_count: 2,
    minutes_ago: 132,
  },
  {
    id: "ir-evt-006",
    event_type: "clash",
    occurred_at: "2026-05-13T06:45:00Z",
    lat: 36.57,
    lng: 53.06,
    location_name: "Sari",
    oblast: "Mazandaran Province",
    description: "Security forces and armed group contact reported near Sari. Casualties unknown.",
    confidence: "unconfirmed",
    source_count: 1,
    minutes_ago: 177,
  },
  {
    id: "ir-evt-007",
    event_type: "strike",
    occurred_at: "2026-05-13T06:10:00Z",
    lat: 31.32,
    lng: 48.67,
    location_name: "Ahvaz",
    oblast: "Khuzestan Province",
    description: "Drone intercept reported over Ahvaz industrial zone. No confirmed damage.",
    confidence: "partial",
    source_count: 2,
    minutes_ago: 212,
  },
  {
    id: "ir-evt-008",
    event_type: "movement",
    occurred_at: "2026-05-13T05:30:00Z",
    lat: 29.62,
    lng: 52.53,
    location_name: "Shiraz",
    oblast: "Fars Province",
    description: "Missile unit repositioning observed on satellite imagery east of Shiraz.",
    confidence: "verified",
    source_count: 3,
    minutes_ago: 252,
  },
];

export const iranAlerts: Alert[] = [
  {
    id: "ir-evt-001",
    event_type: "strike",
    title: "Explosion near Natanz perimeter",
    confidence: "unconfirmed",
    source_count: 1,
    minutes_ago: 28,
  },
  {
    id: "ir-evt-002",
    event_type: "strike",
    title: "Air-defense activation, Isfahan airspace",
    confidence: "partial",
    source_count: 2,
    minutes_ago: 52,
  },
  {
    id: "ir-evt-005",
    event_type: "movement",
    title: "IRGC naval departure, Bandar Abbas",
    confidence: "partial",
    source_count: 2,
    minutes_ago: 132,
  },
];

export const iranIntensity: IntensityDay[] = [
  { label: "Mon", value: 22, hot: false },
  { label: "Tue", value: 31, hot: false },
  { label: "Wed", value: 18, hot: false },
  { label: "Thu", value: 44, hot: false },
  { label: "Fri", value: 39, hot: false },
  { label: "Sat", value: 55, hot: true },
  { label: "Sun", value: 72, hot: true },
];

export const iranSources: Source[] = [
  { rank: 1, handle: "reuters-wire", display_name: "Reuters Wire", platform: "wire", events_count: 6, verified_rate: 96 },
  { rank: 2, handle: "@OSINTtechnical", display_name: "@OSINTtechnical", platform: "x", events_count: 4, verified_rate: 94 },
  { rank: 3, handle: "isw-rss", display_name: "ISW (RSS)", platform: "rss", events_count: 5, verified_rate: 88 },
  { rank: 4, handle: "iran_channels", display_name: "Telegram (Iran channels)", platform: "telegram", events_count: 9, verified_rate: 58 },
  { rank: 5, handle: "afp-wire", display_name: "AFP Wire", platform: "wire", events_count: 3, verified_rate: 95 },
];

export const iranBriefing: BriefingData = {
  id: "ir-brief-20260513",
  date: "13 May 2026",
  utc_time: "09:42 UTC",
  source_count: 19,
  reviewed: false,
  paragraphs: [
    "An unconfirmed explosion near the Natanz enrichment facility perimeter was reported early this morning by a single Telegram channel; no corroborating footage has emerged. Air-defense activations over Isfahan, reported by two independent wire services, suggest heightened alert posture but do not confirm an incoming attack.",
    "Satellite imagery from the previous 24-hour window shows missile unit repositioning east of Shiraz — the sole verified event in today's window. IRGC naval movements out of Bandar Abbas are partial-confidence; treat with caution pending confirmation.",
  ],
};

// ---------------------------------------------------------------------------
// Theater-aware placeholder accessors
// ---------------------------------------------------------------------------

export function phStats(t: TheaterKey): Stats {
  return t === "iran" ? iranStats : stats;
}
export function phMapEvents(t: TheaterKey): MapEvent[] {
  return t === "iran" ? iranMapEvents : mapEvents;
}
export function phAlerts(t: TheaterKey): Alert[] {
  return t === "iran" ? iranAlerts : alerts;
}
export function phIntensity(t: TheaterKey): IntensityDay[] {
  return t === "iran" ? iranIntensity : intensity;
}
export function phSources(t: TheaterKey): Source[] {
  return t === "iran" ? iranSources : sources;
}
export function phBriefing(t: TheaterKey): BriefingData {
  return t === "iran" ? iranBriefing : briefing;
}

// ---------------------------------------------------------------------------
// Extended seed data for detail pages
// ---------------------------------------------------------------------------

const eventDetailMap: Record<string, EventDetail> = {
  "evt-001": {
    id: "evt-001",
    event_type: "strike",
    occurred_at: "2026-05-07T12:24:00Z",
    lat: 48.07,
    lng: 37.71,
    location_name: "Pokrovsk",
    oblast: "Donetsk",
    description: "Seven reported impacts on an industrial site in the western Pokrovsk urban area. Civilian infrastructure confirmed damaged; no casualty figures available from verified sources.",
    confidence: "verified",
    source_count: 3,
    minutes_ago: 18,
    actor: null,
    human_reviewed_at: "2026-05-07T13:15:00Z",
    human_reviewer_notes: "Verified via @DefMon3 geolocation thread and Reuters stringer dispatch. Industrial area confirmed from satellite comparison. Confidence upgraded from partial.",
    event_sources: [
      {
        id: "src-001-a",
        handle: "@DefMon3",
        display_name: "@DefMon3",
        platform: "x",
        url: "https://x.com/DefMon3",
        posted_at: "2026-05-07T12:18:00Z",
        text_excerpt: "Geolocated: 7+ strikes confirmed on industrial zone near Pokrovsk. Satellite match to known facility. Thread incoming.",
        relationship: "primary",
        trust_tier: 1,
      },
      {
        id: "src-001-b",
        handle: "Reuters Wire",
        display_name: "Reuters Wire",
        platform: "wire",
        url: "https://reuters.com",
        posted_at: "2026-05-07T12:31:00Z",
        text_excerpt: "Ukraine — Seven impacts reported on industrial infrastructure in Pokrovsk area. Local stringer confirms damage to civilian buildings adjacent. No casualty figures available.",
        relationship: "corroborating",
        trust_tier: 1,
      },
      {
        id: "src-001-c",
        handle: "@war_mapper",
        display_name: "@war_mapper",
        platform: "x",
        url: "https://x.com/war_mapper",
        posted_at: "2026-05-07T12:22:00Z",
        text_excerpt: "Reports of 7+ impacts in the Pokrovsk industrial area. Corroborates DefMon thread. Waiting for BDA.",
        relationship: "corroborating",
        trust_tier: 2,
      },
    ],
    evidence: [
      {
        type: "geolocation",
        label: "Satellite imagery match",
        notes: "Impact craters geolocated to known industrial facility at 48.07°N 37.71°E via open-source satellite imagery. Confirmed by @DefMon3 geolocation thread.",
      },
      {
        type: "wire_report",
        label: "Reuters stringer dispatch",
        notes: "Local Reuters correspondent confirmed damage to buildings adjacent to industrial zone. Filed via wire at 12:31 UTC.",
      },
    ],
    change_history: [
      {
        timestamp: "2026-05-07T12:24:00Z",
        change: "Event created — confidence: unconfirmed, 1 source (@DefMon3 post)",
      },
      {
        timestamp: "2026-05-07T12:35:00Z",
        change: "Reuters wire added as corroborating source — confidence upgraded to partial, 2 sources",
      },
      {
        timestamp: "2026-05-07T13:15:00Z",
        change: "Human review: satellite geolocation confirmed — confidence upgraded to verified, 3 sources",
      },
    ],
  },
};

export function getEventDetail(id: string): EventDetail | null {
  if (eventDetailMap[id]) return eventDetailMap[id];
  const base = [...mapEvents, ...iranMapEvents].find((e) => e.id === id);
  if (!base) return null;
  return {
    ...base,
    actor: null,
    human_reviewed_at: null,
    human_reviewer_notes: null,
    event_sources: [],
    evidence: [],
    change_history: [
      { timestamp: base.occurred_at, change: "Event created from OSINT source." },
    ],
  };
}

export const iranFullBriefing: FullBriefing = {
  id: "ir-brief-20260513",
  date: "13 May 2026",
  utc_time: "09:42 UTC",
  source_count: 19,
  reviewed: false,
  paragraphs: iranBriefing.paragraphs,
  full_paragraphs: [
    "An unconfirmed explosion near the Natanz enrichment facility perimeter was reported early this morning by a single Telegram channel; no corroborating footage has emerged. Air-defense activations over Isfahan, reported by two independent wire services, suggest heightened alert posture but do not confirm an incoming attack.",
    "Satellite imagery from the previous 24-hour window shows missile unit repositioning east of Shiraz — the sole verified event in today's window. IRGC naval movements out of Bandar Abbas are partial-confidence; treat with caution pending confirmation.",
    "Overall theater tempo is elevated relative to the prior 7-day average but remains well below peak levels. The Natanz perimeter report requires independent confirmation before confidence can be raised; three wire services have not yet corroborated. Watch: satellite tasking over Isfahan and Natanz in the next 12–18 hours may resolve the morning's ambiguity.",
  ],
  referenced_event_ids: ["ir-evt-001", "ir-evt-002", "ir-evt-008"],
  confidence_summary: { verified: 1, partial: 4, unconfirmed: 3 },
};

export const fullBriefing: FullBriefing = {
  id: "brief-20260507",
  date: "07 May 2026",
  utc_time: "14:42 UTC",
  source_count: 38,
  reviewed: false,
  paragraphs: briefing.paragraphs,
  full_paragraphs: [
    "Strike activity along the Pokrovsk axis intensified overnight, with seven separate impacts reported in the eastern oblast — a 23% jump over the seven-day rolling average. Two clusters are corroborated by geolocated footage from three independent accounts, including @DefMon3 and Reuters stringers on the ground. Damage assessments suggest industrial and civilian infrastructure as primary targets.",
    "Clash contacts near Chasiv Yar and Kupiansk remain the secondary focus. The Chasiv Yar contact is partial-confidence — two X accounts corroborate, but no footage has emerged confirming the reported outcome. The Kupiansk armor movement is single-sourced and unverified; a known Telegram milblog with a 64% verification rate is the sole origin. Treat with caution pending corroboration.",
    "Overall theater tempo is elevated. The 92-event Sunday figure represents a genuine spike, not a reporting artifact — three wire services independently reflect increased sortie and contact counts. Watch: further confirmation or denial of the Kupiansk cluster is expected over the next 12–18 hours as satellite tasking windows open.",
  ],
  referenced_event_ids: ["evt-001", "evt-002", "evt-003", "evt-007", "evt-008"],
  confidence_summary: { verified: 14, partial: 21, unconfirmed: 12 },
};

export function getFullBriefing(id: string): FullBriefing | null {
  if (id === fullBriefing.id) return fullBriefing;
  if (id === iranFullBriefing.id) return iranFullBriefing;
  return null;
}

export const allSources: SourceDetail[] = [
  {
    rank: 1,
    handle: "@DefMon3",
    display_name: "@DefMon3",
    platform: "x",
    events_count: 14,
    verified_rate: 92,
    url: "https://x.com/DefMon3",
    events_7d: 14,
    events_30d: 58,
    last_event_at: "2026-05-07T12:18:00Z",
    trust_tier: 1,
    notes: "Long-running geolocation specialist. Publishes verification threads with satellite imagery.",
  },
  {
    rank: 2,
    handle: "@OSINTtechnical",
    display_name: "@OSINTtechnical",
    platform: "x",
    events_count: 5,
    verified_rate: 94,
    url: "https://x.com/OSINTtechnical",
    events_7d: 5,
    events_30d: 22,
    last_event_at: "2026-05-07T10:45:00Z",
    trust_tier: 1,
    notes: "Technical OSINT analysis; emphasis on equipment identification and geolocation.",
  },
  {
    rank: 3,
    handle: "@war_mapper",
    display_name: "@war_mapper",
    platform: "x",
    events_count: 9,
    verified_rate: 88,
    url: "https://x.com/war_mapper",
    events_7d: 9,
    events_30d: 41,
    last_event_at: "2026-05-07T12:22:00Z",
    trust_tier: 2,
    notes: "Mapping-focused account with strong track record on frontline positions.",
  },
  {
    rank: 4,
    handle: "reuters-wire",
    display_name: "Reuters Wire",
    platform: "wire",
    events_count: 6,
    verified_rate: 96,
    url: "https://reuters.com",
    events_7d: 6,
    events_30d: 29,
    last_event_at: "2026-05-07T12:31:00Z",
    trust_tier: 1,
    notes: "Global wire service. High editorial standards but limited Ukraine-specific depth.",
  },
  {
    rank: 5,
    handle: "afp-wire",
    display_name: "AFP Wire",
    platform: "wire",
    events_count: 4,
    verified_rate: 95,
    url: "https://afp.com",
    events_7d: 4,
    events_30d: 18,
    last_event_at: "2026-05-07T11:55:00Z",
    trust_tier: 1,
    notes: "Global wire service with Kyiv bureau.",
  },
  {
    rank: 6,
    handle: "@GeoConfirmed",
    display_name: "@GeoConfirmed",
    platform: "x",
    events_count: 7,
    verified_rate: 86,
    url: "https://x.com/GeoConfirmed",
    events_7d: 7,
    events_30d: 31,
    last_event_at: "2026-05-07T11:40:00Z",
    trust_tier: 2,
    notes: "Community geolocation project with moderated contributor network.",
  },
  {
    rank: 7,
    handle: "telegram-mil",
    display_name: "Telegram (mil channels)",
    platform: "telegram",
    events_count: 22,
    verified_rate: 64,
    url: "https://t.me",
    events_7d: 22,
    events_30d: 94,
    last_event_at: "2026-05-07T12:42:00Z",
    trust_tier: 3,
    notes: "Aggregated Ukrainian and Russian milblog channels. High volume, lower verification rate. Tracked separately from individual accounts.",
  },
  {
    rank: 8,
    handle: "ukrinform-rss",
    display_name: "Ukrinform (RSS)",
    platform: "rss",
    events_count: 8,
    verified_rate: 78,
    url: "https://ukrinform.ua",
    events_7d: 8,
    events_30d: 35,
    last_event_at: "2026-05-07T12:00:00Z",
    trust_tier: 2,
    notes: "Ukrainian state news agency. Apply appropriate editorial weighting to coverage of Ukrainian operations.",
  },
];
