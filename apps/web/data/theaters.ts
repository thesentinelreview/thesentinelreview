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
    mapCenter: [47, 30],
    mapZoom: 4,
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
  israel: {
    id: "israel",
    label: "Israel",
    mapCenter: [34.9, 31.5],
    mapZoom: 7,
    mapSubtitle: "Israel — Gaza, West Bank, and Strikes on Israeli Soil",
    briefingTitle: "Daily Briefing — Israel Theater",
  },
  russia: {
    id: "russia",
    label: "Russia (Rear)",
    mapCenter: [60, 55],
    mapZoom: 4,
    mapSubtitle: "Russia — Deep-Rear Strikes on Russian Soil",
    briefingTitle: "Daily Briefing — Russia Rear Theater",
  },
  nato_flank: {
    id: "nato_flank",
    label: "NATO Flank / Baltic",
    mapCenter: [24, 56],
    mapZoom: 6,
    mapSubtitle: "NATO Flank — Baltic, Belarus, Kaliningrad",
    briefingTitle: "Daily Briefing — NATO Flank / Baltic",
  },
};

export function resolveTheater(raw: string | undefined): TheaterConfig {
  return THEATERS[(raw as TheaterKey) in THEATERS ? (raw as TheaterKey) : "ukraine"];
}

// /admin/tieout adds a "Global" (all-theaters) view on top of the four real
// theaters. Opt-in for that page only — resolveTheater and TheaterKey are left
// unchanged, so the watchfloor (/) and feed are unaffected.
export function resolveTieoutTheater(
  raw: string | undefined,
): { id: TheaterKey | "all"; label: string } {
  if (raw === "all") return { id: "all", label: "Global" };
  const t = resolveTheater(raw);
  return { id: t.id, label: t.label };
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
    tagline: "Iran proper, IRGC and nuclear activity, and Iran-aligned proxy fronts in Lebanon, Syria, Iraq, and Yemen.",
    since:   "Coverage active",
    paragraphs: [
      "The Iran theater covers conflict activity in and relating to Iran: nuclear site activity at Natanz, Fordow, Arak, and Bushehr; IRGC operations in the Persian Gulf and Iraq; Israeli–Iranian strikes that occur outside Israel (inside Iran, Syria, or Lebanon); and proxy or allied force activity in Lebanon, Syria, Iraq, and Yemen where attribution to Iran is direct or strongly implied. Events that land on Israeli, Gaza, or West Bank soil are tracked under the Israel theater instead.",
      "Because the actor set spans multiple states and non-state groups, our extraction pipeline preserves the source's exact phrasing where attribution is contested. A claim by one side is recorded as a claim — confidence is upgraded only when an independent source on another platform corroborates the event.",
    ],
    keyActors: [
      "Islamic Revolutionary Guard Corps (IRGC) and Quds Force",
      "Israel Defense Forces (IDF) — strikes outside Israel",
      "Hezbollah (Lebanon and Syria)",
      "Houthi forces / Ansar Allah (Yemen)",
      "Iraqi Popular Mobilization Forces (PMF) factions",
    ],
    seoTitle:       "Iran Theater — Nuclear Sites, IRGC, and Proxy Activity | Sentinel Review",
    seoDescription: "Live OSINT events across Iran proper and Iran-attributed proxy activity in Lebanon, Syria, Iraq, and Yemen. Geolocated, cross-referenced, neutrally framed.",
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

  israel: {
    tagline: "Israel, Gaza, and the West Bank — IDF operations, Hamas activity, and strikes landing on Israeli soil.",
    since:   "Coverage active",
    paragraphs: [
      "The Israel theater covers conflict activity physically located in Israel, the Gaza Strip, and the West Bank: Israeli (IDF) operations in Gaza and the West Bank, Hamas and Palestinian Islamic Jihad activity, settler violence, and any rocket, missile, or drone attack that lands on Israeli, Gaza, or West Bank soil — including Iranian or Hezbollah projectiles striking Israel and Israeli air-defence interceptions over these areas.",
      "Theater membership here is defined by event location, not by who fired. Strikes that occur outside Israel/Gaza/the West Bank — Israeli strikes on Lebanon, Syria, or Iran, for example — are tracked under the Iran theater. As elsewhere, events are presented as discrete, geolocated facts with confidence levels reflecting the corroboration we have, not as editorial attributions.",
    ],
    keyActors: [
      "Israel Defense Forces (IDF)",
      "Hamas (Izz ad-Din al-Qassam Brigades)",
      "Palestinian Islamic Jihad (PIJ)",
      "West Bank settler groups and Palestinian factions",
    ],
    seoTitle:       "Israel & Gaza Conflict Map — Real-time OSINT Events | Sentinel Review",
    seoDescription: "Live, verified OSINT events in Israel, Gaza, and the West Bank: IDF operations, Hamas activity, and strikes landing on Israeli soil. Geolocated and multi-source confidence scored.",
  },

  russia: {
    tagline: "Deep-rear strikes on Russian soil — military-industrial targets, airfields, and fuel depots.",
    since:   "Coverage active",
    paragraphs: [
      "The Russia Rear theater tracks conflict activity physically located on Russian territory outside the Ukraine bounding box: Ukrainian long-range drone and missile strikes on military-industrial facilities, oil refineries, airfields, ammunition depots, and rail infrastructure across European Russia and the Urals. Coverage extends from Bryansk and Belgorod oblasts deep into the Russian interior as far east as the Urals.",
      "Events in this theater are defined by location on Russian soil, not by actor. The Ukraine war is the proximate cause of virtually all current activity here, but the theater captures the geographic footprint of strikes that fall outside the Ukraine bbox. Confidence scoring reflects the corroboration available from OSINT geolocators, Russian regional Telegram channels, and Ukrainian official statements.",
    ],
    keyActors: [
      "Armed Forces of Ukraine (AFU) — drone and missile strike operations",
      "Russian air defense (S-300/400, Pantsir, Tor systems)",
      "Russian regional emergency services and civil defense",
      "Russian Ministry of Defense (official denial/acknowledgment layer)",
    ],
    seoTitle:       "Russia Rear Theater — Deep-Rear Strikes on Russian Soil | Sentinel Review",
    seoDescription: "OSINT coverage of Ukrainian long-range strikes on Russian territory: airfields, fuel depots, military-industrial targets across European Russia and the Urals. Geolocated and confidence scored.",
  },

  nato_flank: {
    tagline: "Baltic states, Belarus, and Kaliningrad — troop movements, incidents, and escalation signals.",
    since:   "Coverage active",
    paragraphs: [
      "The NATO Flank / Baltic theater covers the eastern edge of the NATO alliance: Estonia, Latvia, Lithuania, and Poland's Kaliningrad frontier, plus Belarus as the primary Russian forward-staging theater adjacent to NATO territory. Coverage includes NATO reinforcement movements, Belarusian Armed Forces activity, Russian Kaliningrad garrison developments, and any cross-border incident or airspace violation in the region.",
      "This is primarily a situational-awareness theater rather than a high-tempo kinetic one. Events skew toward force posture (troop deployments, exercise activity, infrastructure prepositioning) and incident reporting (airspace violations, GPS jamming, border incidents). Confidence scoring here gives weight to official NATO, national MoD, and wire-service sources, as the OSINT milblog ecosystem is thinner than in the Ukraine or Russia theaters.",
    ],
    keyActors: [
      "NATO Enhanced Forward Presence (eFP) battlegroups — Estonia, Latvia, Lithuania, Poland",
      "Belarusian Armed Forces (BAF)",
      "Russian Baltic Fleet and Kaliningrad garrison",
      "Baltic national defense forces (Estonian Defense Forces, Latvian NAF, Lithuanian Armed Forces)",
    ],
    seoTitle:       "NATO Flank / Baltic Theater — Troop Movements and Incidents | Sentinel Review",
    seoDescription: "OSINT coverage of the NATO eastern flank: troop movements, airspace incidents, and escalation signals across the Baltic states, Belarus, and Kaliningrad. Geolocated and confidence scored.",
  },
};
