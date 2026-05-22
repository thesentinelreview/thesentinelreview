/**
 * Theater configuration: the runtime config (map center/zoom, labels) plus
 * the marketing / SEO copy per theater. Single place to edit theater data.
 */
import type { TheaterConfig, TheaterKey } from "@/lib/types";

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
  sudan: {
    id: "sudan",
    label: "Sudan",
    mapCenter: [30.0, 15.5],
    mapZoom: 5,
    mapSubtitle: "Sudan — SAF/RSF Civil Conflict",
    briefingTitle: "Daily Briefing — Sudan Theater",
  },
  myanmar: {
    id: "myanmar",
    label: "Myanmar",
    mapCenter: [96.5, 19.5],
    mapZoom: 6,
    mapSubtitle: "Myanmar — PDF/Tatmadaw Conflict",
    briefingTitle: "Daily Briefing — Myanmar Theater",
  },
};

export function resolveTheater(raw: string | undefined): TheaterConfig {
  return THEATERS[(raw as TheaterKey) in THEATERS ? (raw as TheaterKey) : "ukraine"];
}

export interface TheaterDescriptor {
  tagline:        string;          // one line — shown on the /theaters index card
  since:          string;          // e.g. "February 24, 2022"
  paragraphs:     string[];        // 2–3 paragraphs of context
  keyActors:      string[];        // bullet list shown on the detail page
  seoTitle:       string;
  seoDescription: string;
}

export const THEATER_CONTENT: Record<TheaterKey, TheaterDescriptor> = {
  ukraine: {
    tagline: "Eastern theater — Donetsk and Luhansk axes, strikes and ground contact.",
    since:   "February 24, 2022",
    paragraphs: [
      "The Sentinel Review Ukraine theater tracks the eastern front of the Russia–Ukraine war, with primary focus on Donetsk and Luhansk oblasts where the bulk of contact, artillery, and strike activity is concentrated. We pull from Ukrainian and Russian milblog channels, regional press, OSINT geolocators, and wire services, then cross-reference each event across independent sources before publishing.",
      "Coverage extends across the broader bounding box of mainland Ukraine and adjacent Russian border regions where cross-border strikes and incursions occur. We do not synthesize political analysis — events are presented as discrete, geolocated facts with confidence levels that reflect the corroboration we have.",
    ],
    keyActors: [
      "Armed Forces of Ukraine (AFU / ЗСУ)",
      "Russian Armed Forces and affiliated units",
      "Volunteer formations on both sides (e.g. International Legion, Wagner remnants)",
      "Ukrainian regional military administrations (OVAs)",
    ],
    seoTitle:       "Ukraine Conflict Map — Real-time OSINT Events | Sentinel Review",
    seoDescription: "Live, verified OSINT events from the eastern front of the Russia–Ukraine war. Geolocated strikes, contact, and movements with multi-source confidence scoring.",
  },

  iran: {
    tagline: "Iran proper, Israel–Iran exchanges, and proxy activity across the region.",
    since:   "Coverage active",
    paragraphs: [
      "The Iran theater covers conflict activity in and relating to Iran: nuclear site activity at Natanz, Fordow, Arak, and Bushehr; IRGC operations in the Persian Gulf and Iraq; Israeli–Iranian strike and counter-strike exchanges; and proxy or allied force activity in Lebanon, Syria, Iraq, Yemen, and Gaza where attribution to Iran is direct or strongly implied.",
      "Because the actor set spans multiple states and non-state groups, our extraction pipeline preserves the source's exact phrasing where attribution is contested. A claim by one side is recorded as a claim — confidence is upgraded only when an independent source on another platform corroborates the event.",
    ],
    keyActors: [
      "Islamic Revolutionary Guard Corps (IRGC) and Quds Force",
      "Israel Defense Forces (IDF)",
      "Hezbollah (Lebanon), Hamas, Palestinian Islamic Jihad",
      "Houthi forces / Ansar Allah (Yemen)",
      "Iraqi Popular Mobilization Forces (PMF) factions",
    ],
    seoTitle:       "Iran Theater — Nuclear Sites, IRGC, and Proxy Activity | Sentinel Review",
    seoDescription: "Live OSINT events across Iran proper and Iran-attributed proxy activity in Lebanon, Syria, Iraq, Yemen, and Gaza. Geolocated, cross-referenced, neutrally framed.",
  },

  sudan: {
    tagline: "SAF vs RSF civil war — Khartoum, Darfur, and Kordofan axes.",
    since:   "April 15, 2023",
    paragraphs: [
      "Sudan has been engulfed in civil war between the Sudanese Armed Forces (SAF) and the Rapid Support Forces (RSF) since April 2023. Sentinel Review tracks the conflict across Khartoum and Omdurman, the Darfur region (especially El Fasher and Nyala), the Kordofan states, and the Red Sea coast around Port Sudan. The displacement crisis is the largest in the world by raw numbers, and humanitarian-corridor incidents are part of our coverage.",
      "The conflict is significantly under-covered by mainstream OSINT platforms relative to its scale. We treat verified mass-casualty events, strikes on displacement camps, and siege dynamics affecting civilian populations as high-impact by default in our extraction pipeline.",
    ],
    keyActors: [
      "Sudanese Armed Forces (SAF)",
      "Rapid Support Forces (RSF)",
      "SAF-aligned militias (Joint Forces, regional defense units)",
      "RSF-aligned Janjaweed-descendant formations in Darfur",
    ],
    seoTitle:       "Sudan Conflict Map — SAF vs RSF Civil War | Sentinel Review",
    seoDescription: "OSINT coverage of the Sudan civil war: SAF and RSF operations across Khartoum, Darfur, Kordofan, and the Red Sea coast. Verified events with multi-source confidence scoring.",
  },

  myanmar: {
    tagline: "Junta vs PDF and EAOs — Sagaing, Shan, Kayin, Chin, Rakhine.",
    since:   "February 1, 2021 (coup); active conflict since mid-2021",
    paragraphs: [
      "Myanmar's civil conflict pits the Tatmadaw / SAC junta against the People's Defence Force (PDF), the National Unity Government's armed wing, and a broad alliance of ethnic armed organizations (EAOs) including the Arakan Army, KNLA, TNLA, MNDAA, and KIA. Sentinel Review tracks fighting across Sagaing Region, Shan State (north and east), Kayin and Karenni States, Chin State, Rakhine State, and Mandalay Region.",
      "Like Sudan, Myanmar is structurally under-covered. We ingest from PDF/NUG channels, ethnic resistance media, exile press, and a small number of regional monitor accounts. Junta airstrikes on civilian targets are a frequent event type; we record them as factual events with location, casualty figures only where the source states them.",
    ],
    keyActors: [
      "State Administration Council (SAC) / Tatmadaw (junta forces)",
      "People's Defence Force (PDF) — NUG-aligned",
      "Arakan Army (AA) — Rakhine and beyond",
      "Three Brotherhood Alliance: MNDAA, TNLA, AA",
      "KNLA, KIA, KNDF and other allied EAOs",
    ],
    seoTitle:       "Myanmar Conflict Map — Junta vs PDF and EAOs | Sentinel Review",
    seoDescription: "OSINT coverage of Myanmar's civil conflict: junta forces against the PDF and ethnic armed organizations across Sagaing, Shan, Kayin, Chin, and Rakhine.",
  },
};
