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

// Asks LM Studio to extract 4 single-word visual search keywords from the script
async function extractKeywords(scriptText) {
  const response = await axios.post(LM_STUDIO_URL, {
    model: MODEL,
    messages: [
      {
        role: "system",
        content:
          'You are a keyword extractor. Extract 4 single-word visual search terms from the given script. Respond with ONLY a JSON array of strings. No explanation, no preamble, no markdown. Example: ["focus","goals","mindset","success"]',
      },
      {
        role: "user",
        content: `Extract 4 visual keywords from this script: ${scriptText}`,
      },
    ],
    temperature: 0.3,
    max_tokens: 50,
  });

  const raw = response.data.choices[0].message.content.trim();
  return JSON.parse(raw);
}

// Searches Pexels for a portrait HD video clip matching the keyword and returns its download URL
async function findClipUrl(keyword) {
  const response = await axios.get("https://api.pexels.com/videos/search", {
    headers: { Authorization: process.env.PEXELS_API_KEY },
    params: { query: keyword, per_page: 1, orientation: "portrait", size: "medium" },
  });

  const video = response.data.videos?.[0];
  if (!video) return null;

  const hdFile = video.video_files.find((f) => f.quality === "hd") ?? video.video_files[0];
  return hdFile?.link ?? null;
}

// Downloads a video from a URL and saves it as a .mp4 file at the given output path
async function downloadClip(url, outputPath) {
  const response = await axios.get(url, { responseType: "arraybuffer" });
  await fsExtra.writeFile(outputPath, Buffer.from(response.data));
}

// Extracts visual keywords from the script, searches Pexels for matching clips, and downloads them
export async function runVisualsLayer(job, scriptText) {
  // Step 1 — Extract keywords via LM Studio
  let keywords;
  try {
    keywords = await extractKeywords(scriptText);
    logger.info(`Extracted visual keywords: ${JSON.stringify(keywords)}`);
  } catch (err) {
    logger.error("Keyword extraction failed", err.message);
    throw err;
  }

  const outputDir = jobOutputDir(job.id);
  await fsExtra.ensureDir(outputDir);

  // Step 2 — Search Pexels and download one clip per keyword
  const clipPaths = [];
  for (let i = 0; i < keywords.length; i++) {
    const keyword = keywords[i];
    try {
      const clipUrl = await findClipUrl(keyword);
      if (!clipUrl) {
        logger.info(`No results for keyword "${keyword}", skipping`);
        continue;
      }

      const outputPath = path.join(outputDir, `clip_${i}.mp4`);
      await downloadClip(clipUrl, outputPath);
      clipPaths.push(outputPath);
      logger.info(`Downloaded clip_${i}.mp4 for keyword "${keyword}"`);
    } catch (err) {
      logger.error(`Failed to fetch clip for keyword "${keyword}"`, err.message);
    }
  }

  // Step 3 — Return all downloaded clip paths
  return clipPaths;
}
