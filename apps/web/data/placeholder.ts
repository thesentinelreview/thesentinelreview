export type EventType = "strike" | "clash" | "movement";
export type Confidence = "verified" | "partial" | "unconfirmed";
export type Platform = "x" | "telegram" | "rss" | "wire";

export interface MapEvent {
  id: string;
  event_type: EventType;
  occurred_at: string;
  /** SVG coordinate space (800×480 viewBox) */
  svg_x: number;
  svg_y: number;
  /** Ring radius — scales with cluster size */
  radius: number;
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
// Seed data (matches the static mockup exactly)
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
    svg_x: 450,
    svg_y: 320,
    radius: 14,
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
    svg_x: 540,
    svg_y: 280,
    radius: 11,
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
    svg_x: 430,
    svg_y: 260,
    radius: 9,
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
    svg_x: 490,
    svg_y: 350,
    radius: 7,
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
    svg_x: 395,
    svg_y: 295,
    radius: 6,
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
    svg_x: 465,
    svg_y: 305,
    radius: 9,
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
    svg_x: 510,
    svg_y: 260,
    radius: 7,
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
    svg_x: 270,
    svg_y: 120,
    radius: 8,
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
    svg_x: 320,
    svg_y: 180,
    radius: 6,
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
    svg_x: 380,
    svg_y: 105,
    radius: 6,
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
    svg_x: 580,
    svg_y: 220,
    radius: 5,
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
    svg_x: 350,
    svg_y: 240,
    radius: 5,
    location_name: "Central Donetsk",
    oblast: "Donetsk",
    description: "Redeployment near Druzhkivka.",
    confidence: "partial",
    source_count: 2,
    minutes_ago: 132,
  },
];

export const alerts: Alert[] = [
  {
    id: "alt-001",
    event_type: "strike",
    title: "Strike cluster, Pokrovsk axis",
    confidence: "verified",
    source_count: 3,
    minutes_ago: 18,
  },
  {
    id: "alt-002",
    event_type: "clash",
    title: "Unverified armor movement, Kupiansk sector",
    confidence: "unconfirmed",
    source_count: 1,
    minutes_ago: 42,
  },
  {
    id: "alt-003",
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
