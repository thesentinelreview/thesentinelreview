-- =============================================================================
-- seed/events_seed.sql
-- Seed recent events for all four theaters so the dashboard shows live data.
-- All events are set within the last 24 hours and published_at IS NOT NULL
-- so they pass the dashboard query filters.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Ukraine theater — Donetsk / Luhansk / Kharkiv
-- ---------------------------------------------------------------------------

WITH
src_reuters AS (SELECT id FROM sources WHERE handle = 'reuters_ukraine_rss'),
src_ukrinform AS (SELECT id FROM sources WHERE handle = 'ukrinform_rss'),
src_kyiv AS (SELECT id FROM sources WHERE handle = 'kyivindependent_rss'),
src_unian AS (SELECT id FROM sources WHERE handle = 'unian_rss'),
src_interfax AS (SELECT id FROM sources WHERE handle = 'interfax_ukraine_rss'),

-- raw_posts
p1 AS (
  INSERT INTO raw_posts (source_id, external_id, posted_at, text, processed_at)
  SELECT id, 'ukr-post-001', now() - interval '18 minutes',
    'Seven reported impacts on industrial site near Pokrovsk. Civilian infrastructure damaged. Footage emerging.',
    now()
  FROM src_reuters RETURNING id, source_id
),
p2 AS (
  INSERT INTO raw_posts (source_id, external_id, posted_at, text, processed_at)
  SELECT id, 'ukr-post-002', now() - interval '18 minutes',
    'Strike on Pokrovsk industrial zone confirmed by multiple correspondents. At least 7 impacts.',
    now()
  FROM src_ukrinform RETURNING id, source_id
),
p3 AS (
  INSERT INTO raw_posts (source_id, external_id, posted_at, text, processed_at)
  SELECT id, 'ukr-post-003', now() - interval '18 minutes',
    'Independent verification: Pokrovsk strikes geolocated to known facility. Satellite match confirmed.',
    now()
  FROM src_kyiv RETURNING id, source_id
),
p4 AS (
  INSERT INTO raw_posts (source_id, external_id, posted_at, text, processed_at)
  SELECT id, 'ukr-post-004', now() - interval '34 minutes',
    'Artillery strikes on residential district in Bakhmut reported. Extent of damage unclear.',
    now()
  FROM src_reuters RETURNING id, source_id
),
p5 AS (
  INSERT INTO raw_posts (source_id, external_id, posted_at, text, processed_at)
  SELECT id, 'ukr-post-005', now() - interval '34 minutes',
    'Bakhmut residential area shelling, local sources say two impact points confirmed.',
    now()
  FROM src_unian RETURNING id, source_id
),
p6 AS (
  INSERT INTO raw_posts (source_id, external_id, posted_at, text, processed_at)
  SELECT id, 'ukr-post-006', now() - interval '47 minutes',
    'Drone strike on logistics hub in Kramatorsk area. Fires reported. Emergency services responding.',
    now()
  FROM src_ukrinform RETURNING id, source_id
),
p7 AS (
  INSERT INTO raw_posts (source_id, external_id, posted_at, text, processed_at)
  SELECT id, 'ukr-post-007', now() - interval '47 minutes',
    'Kramatorsk: logistics hub targeted by drone. Ukrainian forces monitoring situation.',
    now()
  FROM src_interfax RETURNING id, source_id
),
p8 AS (
  INSERT INTO raw_posts (source_id, external_id, posted_at, text, processed_at)
  SELECT id, 'ukr-post-008', now() - interval '62 minutes',
    'Glide bomb impact reported southern Donetsk axis, target unverified, single source.',
    now()
  FROM src_reuters RETURNING id, source_id
),
p9 AS (
  INSERT INTO raw_posts (source_id, external_id, posted_at, text, processed_at)
  SELECT id, 'ukr-post-009', now() - interval '74 minutes',
    'Shelling near Avdiivka outskirts reported. No footage has emerged to confirm.',
    now()
  FROM src_ukrinform RETURNING id, source_id
),
p10 AS (
  INSERT INTO raw_posts (source_id, external_id, posted_at, text, processed_at)
  SELECT id, 'ukr-post-010', now() - interval '42 minutes',
    'Infantry contact on the Pokrovsk front line. Outcome unclear.',
    now()
  FROM src_reuters RETURNING id, source_id
),
p11 AS (
  INSERT INTO raw_posts (source_id, external_id, posted_at, text, processed_at)
  SELECT id, 'ukr-post-011', now() - interval '42 minutes',
    'Pokrovsk front: armed contact between Ukrainian and Russian units confirmed.',
    now()
  FROM src_kyiv RETURNING id, source_id
),
p12 AS (
  INSERT INTO raw_posts (source_id, external_id, posted_at, text, processed_at)
  SELECT id, 'ukr-post-012', now() - interval '52 minutes',
    'Assault on Chasiv Yar reportedly repelled per Ukrainian military sources.',
    now()
  FROM src_reuters RETURNING id, source_id
),
p13 AS (
  INSERT INTO raw_posts (source_id, external_id, posted_at, text, processed_at)
  SELECT id, 'ukr-post-013', now() - interval '52 minutes',
    'Chasiv Yar: Russian assault attempt; Ukrainian defenders claim positions held.',
    now()
  FROM src_unian RETURNING id, source_id
),
p14 AS (
  INSERT INTO raw_posts (source_id, external_id, posted_at, text, processed_at)
  SELECT id, 'ukr-post-014', now() - interval '102 minutes',
    'Armor movement near Kupiansk. Single milblog source; unverified.',
    now()
  FROM src_ukrinform RETURNING id, source_id
),
p15 AS (
  INSERT INTO raw_posts (source_id, external_id, posted_at, text, processed_at)
  SELECT id, 'ukr-post-015', now() - interval '72 minutes',
    'Convoy spotted on M03 highway north of Kharkiv. Multiple vehicles, direction north.',
    now()
  FROM src_reuters RETURNING id, source_id
),
p16 AS (
  INSERT INTO raw_posts (source_id, external_id, posted_at, text, processed_at)
  SELECT id, 'ukr-post-016', now() - interval '72 minutes',
    'Northern Kharkiv axis: logistics column observed by local journalists.',
    now()
  FROM src_kyiv RETURNING id, source_id
),

-- events
e1 AS (
  INSERT INTO events (event_type, occurred_at, location, location_name, oblast, description, confidence, published_at)
  VALUES (
    'strike', now() - interval '18 minutes',
    ST_SetSRID(ST_MakePoint(37.71, 48.07), 4326),
    'Pokrovsk', 'Donetsk',
    'Seven reported impacts on industrial site in the western Pokrovsk urban area. Civilian infrastructure confirmed damaged. Multiple correspondents on the ground.',
    'verified', now()
  ) RETURNING id
),
e2 AS (
  INSERT INTO events (event_type, occurred_at, location, location_name, oblast, description, confidence, published_at)
  VALUES (
    'strike', now() - interval '34 minutes',
    ST_SetSRID(ST_MakePoint(37.99, 48.60), 4326),
    'Bakhmut', 'Donetsk',
    'Artillery strikes on residential district. Two impact points confirmed by local sources. Extent of damage unclear.',
    'partial', now()
  ) RETURNING id
),
e3 AS (
  INSERT INTO events (event_type, occurred_at, location, location_name, oblast, description, confidence, published_at)
  VALUES (
    'strike', now() - interval '47 minutes',
    ST_SetSRID(ST_MakePoint(37.55, 48.73), 4326),
    'Kramatorsk', 'Donetsk',
    'Drone strike on logistics hub. Fires reported, emergency services responding.',
    'partial', now()
  ) RETURNING id
),
e4 AS (
  INSERT INTO events (event_type, occurred_at, location, location_name, oblast, description, confidence, published_at)
  VALUES (
    'strike', now() - interval '62 minutes',
    ST_SetSRID(ST_MakePoint(37.85, 47.95), 4326),
    'Southern Donetsk axis', 'Donetsk',
    'Glide bomb impact, unverified target. Single source.',
    'unconfirmed', now()
  ) RETURNING id
),
e5 AS (
  INSERT INTO events (event_type, occurred_at, location, location_name, oblast, description, confidence, published_at)
  VALUES (
    'strike', now() - interval '74 minutes',
    ST_SetSRID(ST_MakePoint(37.75, 48.13), 4326),
    'Avdiivka outskirts', 'Donetsk',
    'Reported shelling, no footage confirmed.',
    'unconfirmed', now()
  ) RETURNING id
),
e6 AS (
  INSERT INTO events (event_type, occurred_at, location, location_name, oblast, description, confidence, published_at)
  VALUES (
    'clash', now() - interval '42 minutes',
    ST_SetSRID(ST_MakePoint(37.68, 48.10), 4326),
    'Pokrovsk front', 'Donetsk',
    'Infantry contact on the Pokrovsk front. Outcome unclear.',
    'partial', now()
  ) RETURNING id
),
e7 AS (
  INSERT INTO events (event_type, occurred_at, location, location_name, oblast, description, confidence, published_at)
  VALUES (
    'clash', now() - interval '52 minutes',
    ST_SetSRID(ST_MakePoint(37.84, 48.57), 4326),
    'Chasiv Yar', 'Donetsk',
    'Assault reportedly repelled per Ukrainian sources.',
    'partial', now()
  ) RETURNING id
),
e8 AS (
  INSERT INTO events (event_type, occurred_at, location, location_name, oblast, description, confidence, published_at)
  VALUES (
    'clash', now() - interval '102 minutes',
    ST_SetSRID(ST_MakePoint(37.60, 49.72), 4326),
    'Kupiansk', 'Kharkiv',
    'Unverified armor movement. Single milblog source.',
    'unconfirmed', now()
  ) RETURNING id
),
e9 AS (
  INSERT INTO events (event_type, occurred_at, location, location_name, oblast, description, confidence, published_at)
  VALUES (
    'movement', now() - interval '72 minutes',
    ST_SetSRID(ST_MakePoint(37.30, 49.90), 4326),
    'Northern Kharkiv axis', 'Kharkiv',
    'Convoy spotted on M03 highway. Multiple vehicles, direction north.',
    'partial', now()
  ) RETURNING id
),

-- event_sources
es1a AS (INSERT INTO event_sources (event_id, source_id, raw_post_id, relationship) SELECT e1.id, p1.source_id, p1.id, 'primary' FROM e1, p1 RETURNING id),
es1b AS (INSERT INTO event_sources (event_id, source_id, raw_post_id, relationship) SELECT e1.id, p2.source_id, p2.id, 'corroborating' FROM e1, p2 RETURNING id),
es1c AS (INSERT INTO event_sources (event_id, source_id, raw_post_id, relationship) SELECT e1.id, p3.source_id, p3.id, 'corroborating' FROM e1, p3 RETURNING id),
es2a AS (INSERT INTO event_sources (event_id, source_id, raw_post_id, relationship) SELECT e2.id, p4.source_id, p4.id, 'primary' FROM e2, p4 RETURNING id),
es2b AS (INSERT INTO event_sources (event_id, source_id, raw_post_id, relationship) SELECT e2.id, p5.source_id, p5.id, 'corroborating' FROM e2, p5 RETURNING id),
es3a AS (INSERT INTO event_sources (event_id, source_id, raw_post_id, relationship) SELECT e3.id, p6.source_id, p6.id, 'primary' FROM e3, p6 RETURNING id),
es3b AS (INSERT INTO event_sources (event_id, source_id, raw_post_id, relationship) SELECT e3.id, p7.source_id, p7.id, 'corroborating' FROM e3, p7 RETURNING id),
es4a AS (INSERT INTO event_sources (event_id, source_id, raw_post_id, relationship) SELECT e4.id, p8.source_id, p8.id, 'primary' FROM e4, p8 RETURNING id),
es5a AS (INSERT INTO event_sources (event_id, source_id, raw_post_id, relationship) SELECT e5.id, p9.source_id, p9.id, 'primary' FROM e5, p9 RETURNING id),
es6a AS (INSERT INTO event_sources (event_id, source_id, raw_post_id, relationship) SELECT e6.id, p10.source_id, p10.id, 'primary' FROM e6, p10 RETURNING id),
es6b AS (INSERT INTO event_sources (event_id, source_id, raw_post_id, relationship) SELECT e6.id, p11.source_id, p11.id, 'corroborating' FROM e6, p11 RETURNING id),
es7a AS (INSERT INTO event_sources (event_id, source_id, raw_post_id, relationship) SELECT e7.id, p12.source_id, p12.id, 'primary' FROM e7, p12 RETURNING id),
es7b AS (INSERT INTO event_sources (event_id, source_id, raw_post_id, relationship) SELECT e7.id, p13.source_id, p13.id, 'corroborating' FROM e7, p13 RETURNING id),
es8a AS (INSERT INTO event_sources (event_id, source_id, raw_post_id, relationship) SELECT e8.id, p14.source_id, p14.id, 'primary' FROM e8, p14 RETURNING id),
es9a AS (INSERT INTO event_sources (event_id, source_id, raw_post_id, relationship) SELECT e9.id, p15.source_id, p15.id, 'primary' FROM e9, p15 RETURNING id),
es9b AS (INSERT INTO event_sources (event_id, source_id, raw_post_id, relationship) SELECT e9.id, p16.source_id, p16.id, 'corroborating' FROM e9, p16 RETURNING id)

SELECT 'ukraine events seeded' AS status;

-- ---------------------------------------------------------------------------
-- Iran theater — Nuclear sites and proxy activity
-- ---------------------------------------------------------------------------

WITH
src_reuters AS (SELECT id FROM sources WHERE handle = 'reuters_ukraine_rss'),
src_interfax AS (SELECT id FROM sources WHERE handle = 'interfax_ukraine_rss'),
src_kyiv AS (SELECT id FROM sources WHERE handle = 'kyivindependent_rss'),

p_ir1 AS (
  INSERT INTO raw_posts (source_id, external_id, posted_at, text, processed_at)
  SELECT id, 'ir-post-001', now() - interval '28 minutes',
    'Unconfirmed explosion near Natanz enrichment facility perimeter. Single source.',
    now()
  FROM src_reuters RETURNING id, source_id
),
p_ir2 AS (
  INSERT INTO raw_posts (source_id, external_id, posted_at, text, processed_at)
  SELECT id, 'ir-post-002', now() - interval '52 minutes',
    'Air-defense activation over Isfahan. Two wire services report intercept attempt.',
    now()
  FROM src_reuters RETURNING id, source_id
),
p_ir3 AS (
  INSERT INTO raw_posts (source_id, external_id, posted_at, text, processed_at)
  SELECT id, 'ir-post-003', now() - interval '52 minutes',
    'Isfahan airspace alert. Air defense systems reportedly active.',
    now()
  FROM src_interfax RETURNING id, source_id
),
p_ir4 AS (
  INSERT INTO raw_posts (source_id, external_id, posted_at, text, processed_at)
  SELECT id, 'ir-post-004', now() - interval '82 minutes',
    'Explosions heard in northern Tehran suburbs. Cause unknown.',
    now()
  FROM src_reuters RETURNING id, source_id
),
p_ir5 AS (
  INSERT INTO raw_posts (source_id, external_id, posted_at, text, processed_at)
  SELECT id, 'ir-post-005', now() - interval '107 minutes',
    'Military convoy near Arak heavy-water reactor site. Two separate observers report.',
    now()
  FROM src_reuters RETURNING id, source_id
),
p_ir6 AS (
  INSERT INTO raw_posts (source_id, external_id, posted_at, text, processed_at)
  SELECT id, 'ir-post-006', now() - interval '107 minutes',
    'Arak: convoy of military vehicles, estimated 8–12 units, near reactor road.',
    now()
  FROM src_kyiv RETURNING id, source_id
),
p_ir7 AS (
  INSERT INTO raw_posts (source_id, external_id, posted_at, text, processed_at)
  SELECT id, 'ir-post-007', now() - interval '212 minutes',
    'Drone intercept over Ahvaz industrial zone. No confirmed damage.',
    now()
  FROM src_reuters RETURNING id, source_id
),
p_ir8 AS (
  INSERT INTO raw_posts (source_id, external_id, posted_at, text, processed_at)
  SELECT id, 'ir-post-008', now() - interval '212 minutes',
    'Ahvaz: intercept confirmed by second wire service. Industrial zone intact.',
    now()
  FROM src_interfax RETURNING id, source_id
),
p_ir9 AS (
  INSERT INTO raw_posts (source_id, external_id, posted_at, text, processed_at)
  SELECT id, 'ir-post-009', now() - interval '252 minutes',
    'Satellite imagery shows missile unit repositioning east of Shiraz.',
    now()
  FROM src_reuters RETURNING id, source_id
),
p_ir10 AS (
  INSERT INTO raw_posts (source_id, external_id, posted_at, text, processed_at)
  SELECT id, 'ir-post-010', now() - interval '252 minutes',
    'Shiraz repositioning confirmed by commercial satellite. Three sources concur.',
    now()
  FROM src_interfax RETURNING id, source_id
),
p_ir11 AS (
  INSERT INTO raw_posts (source_id, external_id, posted_at, text, processed_at)
  SELECT id, 'ir-post-011', now() - interval '252 minutes',
    'IRGC missile assets moved east of Shiraz per open-source imagery.',
    now()
  FROM src_kyiv RETURNING id, source_id
),

e_ir1 AS (
  INSERT INTO events (event_type, occurred_at, location, location_name, oblast, description, confidence, published_at)
  VALUES (
    'strike', now() - interval '28 minutes',
    ST_SetSRID(ST_MakePoint(51.72, 33.72), 4326),
    'Natanz', 'Isfahan Province',
    'Reported explosion near underground enrichment facility perimeter. Single source; details unconfirmed.',
    'unconfirmed', now()
  ) RETURNING id
),
e_ir2 AS (
  INSERT INTO events (event_type, occurred_at, location, location_name, oblast, description, confidence, published_at)
  VALUES (
    'strike', now() - interval '52 minutes',
    ST_SetSRID(ST_MakePoint(51.68, 32.66), 4326),
    'Isfahan', 'Isfahan Province',
    'Air-defense activation reported over Isfahan airspace. Intercept attempt; outcome unconfirmed.',
    'partial', now()
  ) RETURNING id
),
e_ir3 AS (
  INSERT INTO events (event_type, occurred_at, location, location_name, oblast, description, confidence, published_at)
  VALUES (
    'strike', now() - interval '82 minutes',
    ST_SetSRID(ST_MakePoint(51.39, 35.69), 4326),
    'Tehran', 'Tehran Province',
    'Explosions heard in northern Tehran suburbs. Cause unknown.',
    'unconfirmed', now()
  ) RETURNING id
),
e_ir4 AS (
  INSERT INTO events (event_type, occurred_at, location, location_name, oblast, description, confidence, published_at)
  VALUES (
    'movement', now() - interval '107 minutes',
    ST_SetSRID(ST_MakePoint(49.70, 34.09), 4326),
    'Arak', 'Markazi Province',
    'Convoy of military vehicles observed near Arak heavy-water reactor site.',
    'partial', now()
  ) RETURNING id
),
e_ir5 AS (
  INSERT INTO events (event_type, occurred_at, location, location_name, oblast, description, confidence, published_at)
  VALUES (
    'strike', now() - interval '212 minutes',
    ST_SetSRID(ST_MakePoint(48.67, 31.32), 4326),
    'Ahvaz', 'Khuzestan Province',
    'Drone intercept reported over Ahvaz industrial zone. No confirmed damage.',
    'partial', now()
  ) RETURNING id
),
e_ir6 AS (
  INSERT INTO events (event_type, occurred_at, location, location_name, oblast, description, confidence, published_at)
  VALUES (
    'movement', now() - interval '252 minutes',
    ST_SetSRID(ST_MakePoint(52.53, 29.62), 4326),
    'Shiraz', 'Fars Province',
    'Missile unit repositioning observed on satellite imagery east of Shiraz.',
    'verified', now()
  ) RETURNING id
),

es_ir1 AS (INSERT INTO event_sources (event_id, source_id, raw_post_id, relationship) SELECT e_ir1.id, p_ir1.source_id, p_ir1.id, 'primary' FROM e_ir1, p_ir1 RETURNING id),
es_ir2a AS (INSERT INTO event_sources (event_id, source_id, raw_post_id, relationship) SELECT e_ir2.id, p_ir2.source_id, p_ir2.id, 'primary' FROM e_ir2, p_ir2 RETURNING id),
es_ir2b AS (INSERT INTO event_sources (event_id, source_id, raw_post_id, relationship) SELECT e_ir2.id, p_ir3.source_id, p_ir3.id, 'corroborating' FROM e_ir2, p_ir3 RETURNING id),
es_ir3 AS (INSERT INTO event_sources (event_id, source_id, raw_post_id, relationship) SELECT e_ir3.id, p_ir4.source_id, p_ir4.id, 'primary' FROM e_ir3, p_ir4 RETURNING id),
es_ir4a AS (INSERT INTO event_sources (event_id, source_id, raw_post_id, relationship) SELECT e_ir4.id, p_ir5.source_id, p_ir5.id, 'primary' FROM e_ir4, p_ir5 RETURNING id),
es_ir4b AS (INSERT INTO event_sources (event_id, source_id, raw_post_id, relationship) SELECT e_ir4.id, p_ir6.source_id, p_ir6.id, 'corroborating' FROM e_ir4, p_ir6 RETURNING id),
es_ir5a AS (INSERT INTO event_sources (event_id, source_id, raw_post_id, relationship) SELECT e_ir5.id, p_ir7.source_id, p_ir7.id, 'primary' FROM e_ir5, p_ir7 RETURNING id),
es_ir5b AS (INSERT INTO event_sources (event_id, source_id, raw_post_id, relationship) SELECT e_ir5.id, p_ir8.source_id, p_ir8.id, 'corroborating' FROM e_ir5, p_ir8 RETURNING id),
es_ir6a AS (INSERT INTO event_sources (event_id, source_id, raw_post_id, relationship) SELECT e_ir6.id, p_ir9.source_id, p_ir9.id, 'primary' FROM e_ir6, p_ir9 RETURNING id),
es_ir6b AS (INSERT INTO event_sources (event_id, source_id, raw_post_id, relationship) SELECT e_ir6.id, p_ir10.source_id, p_ir10.id, 'corroborating' FROM e_ir6, p_ir10 RETURNING id),
es_ir6c AS (INSERT INTO event_sources (event_id, source_id, raw_post_id, relationship) SELECT e_ir6.id, p_ir11.source_id, p_ir11.id, 'corroborating' FROM e_ir6, p_ir11 RETURNING id)

SELECT 'iran events seeded' AS status;

-- ---------------------------------------------------------------------------
-- Sudan theater — SAF/RSF Civil Conflict
-- ---------------------------------------------------------------------------

WITH
src_reuters AS (SELECT id FROM sources WHERE handle = 'reuters_africa_rss'),
src_afp AS (SELECT id FROM sources WHERE handle = 'afp_africa_rss'),
src_sudan AS (SELECT id FROM sources WHERE handle = 'sudanwarmonitor_rss'),

p_sd1 AS (
  INSERT INTO raw_posts (source_id, external_id, posted_at, text, processed_at)
  SELECT id, 'sd-post-001', now() - interval '31 minutes',
    'RSF artillery reported in western Omdurman residential districts. Fires visible.',
    now()
  FROM src_reuters RETURNING id, source_id
),
p_sd2 AS (
  INSERT INTO raw_posts (source_id, external_id, posted_at, text, processed_at)
  SELECT id, 'sd-post-002', now() - interval '31 minutes',
    'Omdurman: residential area under artillery fire from RSF positions west of city.',
    now()
  FROM src_afp RETURNING id, source_id
),
p_sd3 AS (
  INSERT INTO raw_posts (source_id, external_id, posted_at, text, processed_at)
  SELECT id, 'sd-post-003', now() - interval '66 minutes',
    'SAF positions on El Fasher northern perimeter under RSF small-arms and mortar fire. Civilians sheltering.',
    now()
  FROM src_reuters RETURNING id, source_id
),
p_sd4 AS (
  INSERT INTO raw_posts (source_id, external_id, posted_at, text, processed_at)
  SELECT id, 'sd-post-004', now() - interval '66 minutes',
    'El Fasher perimeter contact: RSF within mortar range of SAF northern positions.',
    now()
  FROM src_afp RETURNING id, source_id
),
p_sd5 AS (
  INSERT INTO raw_posts (source_id, external_id, posted_at, text, processed_at)
  SELECT id, 'sd-post-005', now() - interval '116 minutes',
    'Drone strike on Port Sudan airport area. Infrastructure damage reported. Single source.',
    now()
  FROM src_sudan RETURNING id, source_id
),
p_sd6 AS (
  INSERT INTO raw_posts (source_id, external_id, posted_at, text, processed_at)
  SELECT id, 'sd-post-006', now() - interval '196 minutes',
    'RSF convoy moving northeast of El Obeid on Khartoum road. Size and direction unconfirmed.',
    now()
  FROM src_sudan RETURNING id, source_id
),
p_sd7 AS (
  INSERT INTO raw_posts (source_id, external_id, posted_at, text, processed_at)
  SELECT id, 'sd-post-007', now() - interval '276 minutes',
    'Armed contact on southern approach to Wad Madani. Two sources confirm fighting.',
    now()
  FROM src_reuters RETURNING id, source_id
),
p_sd8 AS (
  INSERT INTO raw_posts (source_id, external_id, posted_at, text, processed_at)
  SELECT id, 'sd-post-008', now() - interval '276 minutes',
    'Wad Madani: armed contact confirmed. Outcome unclear.',
    now()
  FROM src_afp RETURNING id, source_id
),
p_sd9 AS (
  INSERT INTO raw_posts (source_id, external_id, posted_at, text, processed_at)
  SELECT id, 'sd-post-009', now() - interval '546 minutes',
    'Satellite imagery shows military vehicle concentration south of Nyala airfield.',
    now()
  FROM src_reuters RETURNING id, source_id
),
p_sd10 AS (
  INSERT INTO raw_posts (source_id, external_id, posted_at, text, processed_at)
  SELECT id, 'sd-post-010', now() - interval '546 minutes',
    'Nyala: pre-operation staging pattern confirmed by three open-source imagery analysts.',
    now()
  FROM src_afp RETURNING id, source_id
),
p_sd11 AS (
  INSERT INTO raw_posts (source_id, external_id, posted_at, text, processed_at)
  SELECT id, 'sd-post-011', now() - interval '546 minutes',
    'Vehicle concentration south of Nyala airfield consistent with pre-operation positioning.',
    now()
  FROM src_sudan RETURNING id, source_id
),

e_sd1 AS (
  INSERT INTO events (event_type, occurred_at, location, location_name, oblast, description, confidence, published_at)
  VALUES (
    'strike', now() - interval '31 minutes',
    ST_SetSRID(ST_MakePoint(32.53, 15.55), 4326),
    'Omdurman', 'Khartoum State',
    'RSF artillery in western Omdurman residential districts. Fires observed from multiple locations.',
    'partial', now()
  ) RETURNING id
),
e_sd2 AS (
  INSERT INTO events (event_type, occurred_at, location, location_name, oblast, description, confidence, published_at)
  VALUES (
    'clash', now() - interval '66 minutes',
    ST_SetSRID(ST_MakePoint(25.35, 13.63), 4326),
    'El Fasher', 'North Darfur',
    'SAF northern perimeter positions under RSF small-arms and mortar fire. Civilians sheltering in place.',
    'partial', now()
  ) RETURNING id
),
e_sd3 AS (
  INSERT INTO events (event_type, occurred_at, location, location_name, oblast, description, confidence, published_at)
  VALUES (
    'strike', now() - interval '116 minutes',
    ST_SetSRID(ST_MakePoint(37.22, 19.62), 4326),
    'Port Sudan', 'Red Sea State',
    'Drone strike on Port Sudan airport area. Infrastructure damage reported; single source, unverified.',
    'unconfirmed', now()
  ) RETURNING id
),
e_sd4 AS (
  INSERT INTO events (event_type, occurred_at, location, location_name, oblast, description, confidence, published_at)
  VALUES (
    'movement', now() - interval '196 minutes',
    ST_SetSRID(ST_MakePoint(30.22, 13.18), 4326),
    'El Obeid', 'North Kordofan',
    'RSF convoy observed moving northeast of El Obeid on the Khartoum road.',
    'unconfirmed', now()
  ) RETURNING id
),
e_sd5 AS (
  INSERT INTO events (event_type, occurred_at, location, location_name, oblast, description, confidence, published_at)
  VALUES (
    'clash', now() - interval '276 minutes',
    ST_SetSRID(ST_MakePoint(33.50, 14.40), 4326),
    'Wad Madani', 'Al Jazirah State',
    'Fighting on southern approach to Wad Madani. Two wire services confirm armed contact.',
    'partial', now()
  ) RETURNING id
),
e_sd6 AS (
  INSERT INTO events (event_type, occurred_at, location, location_name, oblast, description, confidence, published_at)
  VALUES (
    'movement', now() - interval '546 minutes',
    ST_SetSRID(ST_MakePoint(24.89, 12.06), 4326),
    'Nyala', 'South Darfur',
    'Military vehicle concentration south of Nyala airfield, consistent with pre-operation staging.',
    'verified', now()
  ) RETURNING id
),

es_sd1a AS (INSERT INTO event_sources (event_id, source_id, raw_post_id, relationship) SELECT e_sd1.id, p_sd1.source_id, p_sd1.id, 'primary' FROM e_sd1, p_sd1 RETURNING id),
es_sd1b AS (INSERT INTO event_sources (event_id, source_id, raw_post_id, relationship) SELECT e_sd1.id, p_sd2.source_id, p_sd2.id, 'corroborating' FROM e_sd1, p_sd2 RETURNING id),
es_sd2a AS (INSERT INTO event_sources (event_id, source_id, raw_post_id, relationship) SELECT e_sd2.id, p_sd3.source_id, p_sd3.id, 'primary' FROM e_sd2, p_sd3 RETURNING id),
es_sd2b AS (INSERT INTO event_sources (event_id, source_id, raw_post_id, relationship) SELECT e_sd2.id, p_sd4.source_id, p_sd4.id, 'corroborating' FROM e_sd2, p_sd4 RETURNING id),
es_sd3 AS (INSERT INTO event_sources (event_id, source_id, raw_post_id, relationship) SELECT e_sd3.id, p_sd5.source_id, p_sd5.id, 'primary' FROM e_sd3, p_sd5 RETURNING id),
es_sd4 AS (INSERT INTO event_sources (event_id, source_id, raw_post_id, relationship) SELECT e_sd4.id, p_sd6.source_id, p_sd6.id, 'primary' FROM e_sd4, p_sd6 RETURNING id),
es_sd5a AS (INSERT INTO event_sources (event_id, source_id, raw_post_id, relationship) SELECT e_sd5.id, p_sd7.source_id, p_sd7.id, 'primary' FROM e_sd5, p_sd7 RETURNING id),
es_sd5b AS (INSERT INTO event_sources (event_id, source_id, raw_post_id, relationship) SELECT e_sd5.id, p_sd8.source_id, p_sd8.id, 'corroborating' FROM e_sd5, p_sd8 RETURNING id),
es_sd6a AS (INSERT INTO event_sources (event_id, source_id, raw_post_id, relationship) SELECT e_sd6.id, p_sd9.source_id, p_sd9.id, 'primary' FROM e_sd6, p_sd9 RETURNING id),
es_sd6b AS (INSERT INTO event_sources (event_id, source_id, raw_post_id, relationship) SELECT e_sd6.id, p_sd10.source_id, p_sd10.id, 'corroborating' FROM e_sd6, p_sd10 RETURNING id),
es_sd6c AS (INSERT INTO event_sources (event_id, source_id, raw_post_id, relationship) SELECT e_sd6.id, p_sd11.source_id, p_sd11.id, 'corroborating' FROM e_sd6, p_sd11 RETURNING id)

SELECT 'sudan events seeded' AS status;

-- ---------------------------------------------------------------------------
-- Myanmar theater — PDF/Tatmadaw Conflict
-- ---------------------------------------------------------------------------

WITH
src_dvb AS (SELECT id FROM sources WHERE handle = 'dvb_rss'),
src_irrawaddy AS (SELECT id FROM sources WHERE handle = 'irrawaddy_rss'),
src_frontier AS (SELECT id FROM sources WHERE handle = 'frontiermyanmar_rss'),

p_mm1 AS (
  INSERT INTO raw_posts (source_id, external_id, posted_at, text, processed_at)
  SELECT id, 'mm-post-001', now() - interval '76 minutes',
    'Tatmadaw jet airstrike on Sagaing township. DVB reports residential structures hit.',
    now()
  FROM src_dvb RETURNING id, source_id
),
p_mm2 AS (
  INSERT INTO raw_posts (source_id, external_id, posted_at, text, processed_at)
  SELECT id, 'mm-post-002', now() - interval '76 minutes',
    'Sagaing: airstrike confirmed by local correspondents. Civilian casualties possible.',
    now()
  FROM src_irrawaddy RETURNING id, source_id
),
p_mm3 AS (
  INSERT INTO raw_posts (source_id, external_id, posted_at, text, processed_at)
  SELECT id, 'mm-post-003', now() - interval '126 minutes',
    'MNDAA and PDF forces in contact with SAC troops on eastern approach to Lashio.',
    now()
  FROM src_dvb RETURNING id, source_id
),
p_mm4 AS (
  INSERT INTO raw_posts (source_id, external_id, posted_at, text, processed_at)
  SELECT id, 'mm-post-004', now() - interval '126 minutes',
    'Lashio eastern approach: fighting ongoing. MNDAA claims forward positions held.',
    now()
  FROM src_irrawaddy RETURNING id, source_id
),
p_mm5 AS (
  INSERT INTO raw_posts (source_id, external_id, posted_at, text, processed_at)
  SELECT id, 'mm-post-005', now() - interval '126 minutes',
    'Multiple sources confirm MNDAA-PDF joint operation on Lashio eastern axis.',
    now()
  FROM src_frontier RETURNING id, source_id
),
p_mm6 AS (
  INSERT INTO raw_posts (source_id, external_id, posted_at, text, processed_at)
  SELECT id, 'mm-post-006', now() - interval '191 minutes',
    'Artillery exchange near Myawaddy border crossing. Karen National Liberation Army involved.',
    now()
  FROM src_dvb RETURNING id, source_id
),
p_mm7 AS (
  INSERT INTO raw_posts (source_id, external_id, posted_at, text, processed_at)
  SELECT id, 'mm-post-007', now() - interval '191 minutes',
    'Myawaddy: KNLA confirmed involvement in border crossing artillery exchange.',
    now()
  FROM src_irrawaddy RETURNING id, source_id
),
p_mm8 AS (
  INSERT INTO raw_posts (source_id, external_id, posted_at, text, processed_at)
  SELECT id, 'mm-post-008', now() - interval '296 minutes',
    'Drone strike on Hakha outskirts. Chin Brotherhood units operating in area. Single source.',
    now()
  FROM src_dvb RETURNING id, source_id
),
p_mm9 AS (
  INSERT INTO raw_posts (source_id, external_id, posted_at, text, processed_at)
  SELECT id, 'mm-post-009', now() - interval '496 minutes',
    'SAC troop reinforcements entering Mandalay via Yangon highway. Column of ~30 vehicles.',
    now()
  FROM src_dvb RETURNING id, source_id
),
p_mm10 AS (
  INSERT INTO raw_posts (source_id, external_id, posted_at, text, processed_at)
  SELECT id, 'mm-post-010', now() - interval '496 minutes',
    'Mandalay reinforcement column confirmed by satellite. Approximately 30 military vehicles.',
    now()
  FROM src_irrawaddy RETURNING id, source_id
),
p_mm11 AS (
  INSERT INTO raw_posts (source_id, external_id, posted_at, text, processed_at)
  SELECT id, 'mm-post-011', now() - interval '496 minutes',
    'SAC column entering Mandalay also reported by Frontier Myanmar correspondents.',
    now()
  FROM src_frontier RETURNING id, source_id
),

e_mm1 AS (
  INSERT INTO events (event_type, occurred_at, location, location_name, oblast, description, confidence, published_at)
  VALUES (
    'strike', now() - interval '76 minutes',
    ST_SetSRID(ST_MakePoint(96.09, 22.00), 4326),
    'Sagaing', 'Sagaing Region',
    'Tatmadaw jet airstrike on Sagaing township. Residential structures reportedly hit; casualties unconfirmed.',
    'partial', now()
  ) RETURNING id
),
e_mm2 AS (
  INSERT INTO events (event_type, occurred_at, location, location_name, oblast, description, confidence, published_at)
  VALUES (
    'clash', now() - interval '126 minutes',
    ST_SetSRID(ST_MakePoint(97.74, 22.97), 4326),
    'Lashio', 'Northern Shan State',
    'MNDAA and PDF forces in contact with SAC troops on eastern approach to Lashio. Fighting ongoing.',
    'verified', now()
  ) RETURNING id
),
e_mm3 AS (
  INSERT INTO events (event_type, occurred_at, location, location_name, oblast, description, confidence, published_at)
  VALUES (
    'strike', now() - interval '191 minutes',
    ST_SetSRID(ST_MakePoint(98.59, 16.44), 4326),
    'Myawaddy', 'Kayin State',
    'Artillery exchange near Myawaddy border crossing. Karen National Liberation Army confirmed involvement.',
    'partial', now()
  ) RETURNING id
),
e_mm4 AS (
  INSERT INTO events (event_type, occurred_at, location, location_name, oblast, description, confidence, published_at)
  VALUES (
    'strike', now() - interval '296 minutes',
    ST_SetSRID(ST_MakePoint(93.58, 23.50), 4326),
    'Hakha', 'Chin State',
    'Drone strike on Hakha outskirts. Chin Brotherhood units operating in area. Single source.',
    'unconfirmed', now()
  ) RETURNING id
),
e_mm5 AS (
  INSERT INTO events (event_type, occurred_at, location, location_name, oblast, description, confidence, published_at)
  VALUES (
    'movement', now() - interval '496 minutes',
    ST_SetSRID(ST_MakePoint(96.08, 21.97), 4326),
    'Mandalay', 'Mandalay Region',
    'SAC troop reinforcements entering Mandalay via Yangon highway. Satellite confirms column of approximately 30 vehicles.',
    'verified', now()
  ) RETURNING id
),

es_mm1a AS (INSERT INTO event_sources (event_id, source_id, raw_post_id, relationship) SELECT e_mm1.id, p_mm1.source_id, p_mm1.id, 'primary' FROM e_mm1, p_mm1 RETURNING id),
es_mm1b AS (INSERT INTO event_sources (event_id, source_id, raw_post_id, relationship) SELECT e_mm1.id, p_mm2.source_id, p_mm2.id, 'corroborating' FROM e_mm1, p_mm2 RETURNING id),
es_mm2a AS (INSERT INTO event_sources (event_id, source_id, raw_post_id, relationship) SELECT e_mm2.id, p_mm3.source_id, p_mm3.id, 'primary' FROM e_mm2, p_mm3 RETURNING id),
es_mm2b AS (INSERT INTO event_sources (event_id, source_id, raw_post_id, relationship) SELECT e_mm2.id, p_mm4.source_id, p_mm4.id, 'corroborating' FROM e_mm2, p_mm4 RETURNING id),
es_mm2c AS (INSERT INTO event_sources (event_id, source_id, raw_post_id, relationship) SELECT e_mm2.id, p_mm5.source_id, p_mm5.id, 'corroborating' FROM e_mm2, p_mm5 RETURNING id),
es_mm3a AS (INSERT INTO event_sources (event_id, source_id, raw_post_id, relationship) SELECT e_mm3.id, p_mm6.source_id, p_mm6.id, 'primary' FROM e_mm3, p_mm6 RETURNING id),
es_mm3b AS (INSERT INTO event_sources (event_id, source_id, raw_post_id, relationship) SELECT e_mm3.id, p_mm7.source_id, p_mm7.id, 'corroborating' FROM e_mm3, p_mm7 RETURNING id),
es_mm4 AS (INSERT INTO event_sources (event_id, source_id, raw_post_id, relationship) SELECT e_mm4.id, p_mm8.source_id, p_mm8.id, 'primary' FROM e_mm4, p_mm8 RETURNING id),
es_mm5a AS (INSERT INTO event_sources (event_id, source_id, raw_post_id, relationship) SELECT e_mm5.id, p_mm9.source_id, p_mm9.id, 'primary' FROM e_mm5, p_mm9 RETURNING id),
es_mm5b AS (INSERT INTO event_sources (event_id, source_id, raw_post_id, relationship) SELECT e_mm5.id, p_mm10.source_id, p_mm10.id, 'corroborating' FROM e_mm5, p_mm10 RETURNING id),
es_mm5c AS (INSERT INTO event_sources (event_id, source_id, raw_post_id, relationship) SELECT e_mm5.id, p_mm11.source_id, p_mm11.id, 'corroborating' FROM e_mm5, p_mm11 RETURNING id)

SELECT 'myanmar events seeded' AS status;

COMMIT;
