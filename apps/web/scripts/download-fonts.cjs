#!/usr/bin/env node
/**
 * Downloads Google Fonts as woff2 files so the app can use next/font/local
 * instead of next/font/google, enabling offline/restricted-egress builds.
 *
 * Run once: node scripts/download-fonts.cjs
 * Output:   public/fonts/{family}/{weight[-italic]}.woff2
 *
 * Variable fonts (single file covers all weights) → named "variable.woff2"
 * Static fonts (one file per weight) → named "{weight}.woff2" or "{weight}-italic.woff2"
 */
"use strict";

const https = require("https");
const fs = require("fs");
const path = require("path");
const url = require("url");

const OUT_DIR = path.join(__dirname, "..", "public", "fonts");

function googleFontsUrl(family, weights, styles = ["normal"]) {
  const hasItalic = styles.includes("italic");
  let axes;
  if (hasItalic) {
    const w = weights.join(";");
    axes = `ital,wght@${weights.map((w) => `0,${w}`).join(";")};${weights.map((w) => `1,${w}`).join(";")}`;
  } else {
    axes = `wght@${weights.join(";")}`;
  }
  return `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:${axes}&display=swap`;
}

async function fetchText(rawUrl) {
  return new Promise((resolve, reject) => {
    const req = https.get(rawUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      },
    }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        fetchText(res.headers.location).then(resolve).catch(reject);
        return;
      }
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => resolve(data));
    });
    req.on("error", reject);
  });
}

async function downloadBinary(rawUrl, destPath) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    const file = fs.createWriteStream(destPath);
    const req = https.get(rawUrl, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close();
        fs.unlinkSync(destPath);
        downloadBinary(res.headers.location, destPath).then(resolve).catch(reject);
        return;
      }
      res.pipe(file);
      file.on("finish", () => file.close(resolve));
    });
    req.on("error", reject);
    file.on("error", reject);
  });
}

function parseFontFaces(css) {
  // Split into @font-face blocks
  const blocks = [];
  const re = /@font-face\s*\{([^}]+)\}/g;
  let m;
  while ((m = re.exec(css)) !== null) {
    const block = m[1];
    const weightMatch = block.match(/font-weight:\s*([^;]+);/);
    const styleMatch = block.match(/font-style:\s*([^;]+);/);
    const srcMatch = block.match(/src:\s*url\((https:\/\/[^)]+)\)\s*format\('woff2'\)/);
    const unicodeMatch = block.match(/unicode-range:\s*([^;]+);/);
    if (!srcMatch) continue;

    const weight = weightMatch ? weightMatch[1].trim() : "400";
    const style = styleMatch ? styleMatch[1].trim() : "normal";
    const fontUrl = srcMatch[1];

    // Skip non-latin subsets — look at preceding comment
    blocks.push({ weight, style, fontUrl });
  }
  return blocks;
}

// Filter to only latin-subset blocks. Google Fonts CSS lists them in order,
// with a preceding "/* latin */" comment. We identify latin blocks as those
// whose URL does NOT contain a subset code (they're at the end), OR we
// deduplicate by URL and keep the last occurrence per (weight, style) which
// is always latin.
function deduplicateToLatin(blocks) {
  // Google Fonts puts latin last — keep last URL per (weight, style) combo
  const map = new Map();
  for (const b of blocks) {
    map.set(`${b.weight}:${b.style}`, b);
  }
  return Array.from(map.values());
}

const FONTS = [
  { family: "IBM Plex Sans",           slug: "ibm-plex-sans",           weights: [400, 500, 600], styles: ["normal"] },
  { family: "IBM Plex Mono",           slug: "ibm-plex-mono",           weights: [400, 500, 600], styles: ["normal"] },
  { family: "IBM Plex Sans Condensed", slug: "ibm-plex-sans-condensed", weights: [500, 600, 700], styles: ["normal"] },
  { family: "Playfair Display",        slug: "playfair-display",        weights: [400, 700, 900], styles: ["normal", "italic"] },
  { family: "Source Sans 3",           slug: "source-sans-3",           weights: [300, 400, 600], styles: ["normal"] },
  { family: "Courier Prime",           slug: "courier-prime",           weights: [400, 700],       styles: ["normal"] },
  { family: "Inter",                   slug: "inter",                   weights: [400, 500, 600, 700, 800], styles: ["normal"] },
  { family: "JetBrains Mono",          slug: "jetbrains-mono",          weights: [400, 500, 600], styles: ["normal"] },
];

async function main() {
  const manifest = {};

  for (const font of FONTS) {
    const cssUrl = googleFontsUrl(font.family, font.weights, font.styles);
    console.log(`\nFetching CSS for ${font.family}...`);

    let css;
    try {
      css = await fetchText(cssUrl);
    } catch (e) {
      console.error(`  FAILED to fetch CSS: ${e.message}`);
      continue;
    }

    const allBlocks = parseFontFaces(css);
    const blocks = deduplicateToLatin(allBlocks);
    console.log(`  Found ${blocks.length} variant(s)`);

    manifest[font.slug] = { isVariable: false, weights: [], styles: ["normal"], files: [] };

    // Detect variable font: weight like "100 900"
    const isVariable = blocks.some((b) => /^\d+\s+\d+$/.test(b.weight));
    if (isVariable) {
      manifest[font.slug].isVariable = true;
      manifest[font.slug].weightRange = blocks[0].weight;
    }

    for (const block of blocks) {
      const isItalic = block.style === "italic";
      let filename;
      if (isVariable) {
        filename = isItalic ? "variable-italic.woff2" : "variable.woff2";
      } else {
        filename = isItalic ? `${block.weight}-italic.woff2` : `${block.weight}.woff2`;
      }

      const destPath = path.join(OUT_DIR, font.slug, filename);
      if (fs.existsSync(destPath)) {
        console.log(`  ${font.slug}/${filename} already exists`);
      } else {
        try {
          await downloadBinary(block.fontUrl, destPath);
          console.log(`  Downloaded ${font.slug}/${filename} (weight=${block.weight}, style=${block.style})`);
        } catch (e) {
          console.error(`  FAILED ${font.slug}/${filename}: ${e.message}`);
          continue;
        }
      }

      manifest[font.slug].files.push({
        file: `/fonts/${font.slug}/${filename}`,
        weight: block.weight,
        style: block.style,
      });
    }
  }

  // Write manifest for layout.tsx reference
  const manifestPath = path.join(OUT_DIR, "manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`\nWrote manifest to ${manifestPath}`);
  console.log("\nDone.");
  return manifest;
}

main().catch((e) => { console.error(e); process.exit(1); });
