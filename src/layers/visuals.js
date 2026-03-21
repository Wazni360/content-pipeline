import axios from "axios";
import fsExtra from "fs-extra";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import { jobOutputDir } from "../utils/jobTracker.js";
import { logger } from "../utils/logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const LM_STUDIO_URL = "http://localhost:1234/v1/chat/completions";
const MODEL = process.env.LM_STUDIO_MODEL;

// Asks LM Studio to extract a single-word visual keyword from the given text snippet
async function extractKeyword(text) {
  const response = await axios.post(LM_STUDIO_URL, {
    model: MODEL,
    messages: [
      {
        role: "system",
        content:
          'You are a keyword extractor. Extract exactly 1 single-word visual search term from the given text. Respond with ONLY a JSON array containing one string. No explanation, no preamble, no markdown. Example: ["focus"]',
      },
      {
        role: "user",
        content: `Extract 1 visual keyword from this text: ${text}`,
      },
    ],
    temperature: 0.3,
    max_tokens: 20,
  });

  const raw = response.data.choices[0].message.content.trim();
  const parsed = JSON.parse(raw);
  return parsed[0];
}

// Parses the raw script into { hook, bullets, cta } sections
// Detects bullet points in BODY as lines starting with 1./2./3. or - or •
function parseScriptSections(scriptText) {
  const lines = scriptText.split("\n").map((l) => l.trim()).filter(Boolean);

  let hook = "";
  let cta = "";
  const bullets = [];

  let section = null;
  let bodyLines = [];

  for (const line of lines) {
    if (/\*?\*?HOOK:\*?\*?/i.test(line)) {
      section = "hook";
      const rest = line.replace(/\*?\*?HOOK:\*?\*?/i, "").trim();
      if (rest) hook += " " + rest;
    } else if (/\*?\*?BODY:\*?\*?/i.test(line)) {
      section = "body";
      const rest = line.replace(/\*?\*?BODY:\*?\*?/i, "").trim();
      if (rest) bodyLines.push(rest);
    } else if (/\*?\*?CTA:\*?\*?/i.test(line)) {
      section = "cta";
      const rest = line.replace(/\*?\*?CTA:\*?\*?/i, "").trim();
      if (rest) cta += " " + rest;
    } else {
      if (section === "hook") hook += " " + line;
      else if (section === "body") bodyLines.push(line);
      else if (section === "cta") cta += " " + line;
    }
  }

  // Detect bullet lines in body: lines starting with `1.` / `2.` / `-` / `•` / `*`
  const bulletPattern = /^(\d+\.|[-•*])\s+/;
  const hasBullets = bodyLines.some((l) => bulletPattern.test(l));

  if (hasBullets) {
    for (const line of bodyLines) {
      if (bulletPattern.test(line)) {
        bullets.push(line.replace(bulletPattern, "").trim());
      }
    }
  } else {
    // No bullets — treat entire body as one segment
    bullets.push(bodyLines.join(" ").trim());
  }

  return {
    hook: hook.trim(),
    bullets,
    cta: cta.trim(),
  };
}

// Searches Pexels for a portrait clip matching the keyword; returns its download URL or null
async function findClipUrl(keyword) {
  const response = await axios.get("https://api.pexels.com/videos/search", {
    headers: { Authorization: process.env.PEXELS_API_KEY },
    params: { query: keyword, per_page: 1, orientation: "portrait", size: "medium" },
  });

  const video = response.data.videos?.[0];
  if (!video) return null;

  const files = video.video_files;
  const file =
    files.find((f) => f.width === 1080 && f.height === 1920) ??
    files.find((f) => f.width === 720 && f.height === 1280) ??
    null;
  return file?.link ?? null;
}

// Downloads a video from a URL and saves it as a .mp4 file at the given output path
async function downloadClip(url, outputPath) {
  const response = await axios.get(url, { responseType: "arraybuffer" });
  await fsExtra.writeFile(outputPath, Buffer.from(response.data));
}

// Downloads a single clip for a given section label and text; returns a segment object or null
async function fetchSegment(label, text, outputPath) {
  let keyword;
  try {
    keyword = await extractKeyword(text);
    logger.info(`Keyword for ${label}: "${keyword}"`);
  } catch (err) {
    logger.error(`Keyword extraction failed for ${label}`, err.message);
    return null;
  }

  try {
    const clipUrl = await findClipUrl(keyword);
    if (!clipUrl) {
      logger.info(`[warn] No suitable vertical clip found for keyword: ${keyword} (${label}), skipping`);
      return null;
    }
    await downloadClip(clipUrl, outputPath);
    logger.info(`Downloaded ${path.basename(outputPath)} for ${label} ("${keyword}")`);
    return { clip: outputPath, section: label };
  } catch (err) {
    logger.error(`Failed to fetch clip for ${label}`, err.message);
    return null;
  }
}

// Extracts script sections, fetches one clip per section, and returns segments with clip paths
export async function runVisualsLayer(job, scriptText) {
  const outputDir = jobOutputDir(job.id);
  await fsExtra.ensureDir(outputDir);

  // Parse the script into hook, bullet points, and CTA
  const { hook, bullets, cta } = parseScriptSections(scriptText);
  logger.info(`Script sections — hook: 1, bullets: ${bullets.length}, cta: 1`);

  // Build a list of { label, text, filename } entries in playback order
  const sections = [
    { label: "hook", text: hook },
    ...bullets.map((text, i) => ({ label: `bullet_${i + 1}`, text })),
    { label: "cta", text: cta },
  ];

  // Fetch one clip per section sequentially to avoid hammering the APIs
  const segments = [];
  for (let i = 0; i < sections.length; i++) {
    const { label, text } = sections[i];
    const outputPath = path.join(outputDir, `clip_${i}_${label}.mp4`);
    const segment = await fetchSegment(label, text, outputPath);
    if (segment) segments.push(segment);
  }

  // Return clip paths array (for backward compat) and segments for assembly
  const clipPaths = segments.map((s) => s.clip);
  return { clipPaths, segments };
}
