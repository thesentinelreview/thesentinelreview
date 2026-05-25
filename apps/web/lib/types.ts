export type EventType = "strike" | "clash" | "movement";
export type Confidence = "verified" | "partial" | "unconfirmed";
export type Platform = "x" | "telegram" | "rss" | "wire" | "bluesky";
export type TheaterKey = "ukraine" | "iran" | "sudan" | "myanmar";

export interface TheaterConfig {
  id: TheaterKey;
  label: string;
  mapCenter: [number, number];
  mapZoom: number;
  mapSubtitle: string;
  briefingTitle: string;
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

export interface Sector {
  name: string;
  level: string;
  trend: string;
  pct: number; // 0–100, relative to the busiest sector in view
  events: number;
  strikes: number;
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
  contacts: number;
  movements: number;
  verified_pct: number;
  vs_7d_avg_pct: number;
}

export interface SensorStripData {
  platforms: { tg: number; x: number; rss: number; gdelt: number; bsky: number };
  latency_seconds: number | null; // median age of posts in the last 30 min
  tracks: number;                  // distinct actors in the last 24h
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
  events_30d: number;
  last_event_at: string | null;
  trust_tier: 1 | 2 | 3;
  notes: string;
}
