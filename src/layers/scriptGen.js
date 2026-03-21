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

// Takes a job object and generates a short-form video script via LM Studio, then saves it to disk
export async function runScriptGenLayer(job) {
  // Build the prompt messages
  const messages = [
    {
      role: "system",
      content: `You are an expert short-form video scriptwriter. You write punchy, engaging scripts optimized for ${job.platform}. Always respond with ONLY the script text, structured in exactly three labeled sections: HOOK:, BODY:, and CTA:. No preamble, no explanation, no extra text.`,
    },
    {
      role: "user",
      content: `Write a 45-second short-form video script about: ${job.topic}. Niche: ${job.niche}. Tone: ${job.tone}. Platform: ${job.platform}. Keep it under 150 words total.`,
    },
  ];

  // Call the LM Studio local API
  let script;
  try {
    const response = await axios.post(LM_STUDIO_URL, {
      model: MODEL,
      messages,
      temperature: 0.7,
      max_tokens: 300,
    });
    script = response.data.choices[0].message.content;
  } catch (err) {
    logger.error("LM Studio API call failed", err.message);
    throw err;
  }

  // Save the script to the job's output folder
  const outputDir = jobOutputDir(job.id);
  await fsExtra.ensureDir(outputDir);
  await fsExtra.writeFile(path.join(outputDir, "script.txt"), script, "utf8");

  logger.info(`Script for job ${job.id}:\n${script}`);

  return script;
}
