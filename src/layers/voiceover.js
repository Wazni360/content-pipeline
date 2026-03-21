import axios from "axios";
import fsExtra from "fs-extra";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import { jobOutputDir } from "../utils/jobTracker.js";
import { logger } from "../utils/logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Calls ElevenLabs TTS API with the script text and saves the audio to disk
export async function runVoiceoverLayer(job, scriptText) {
  const voiceId = process.env.ELEVENLABS_VOICE_ID;
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;

  // Send the TTS request, expecting raw audio bytes in response
  let audioData;
  try {
    const response = await axios.post(
      url,
      {
        text: scriptText,
        model_id: "eleven_turbo_v2_5",
        voice_settings: {
          stability: 0.4,
          similarity_boost: 0.85,
        },
      },
      {
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        responseType: "arraybuffer",
      },
    );
    audioData = response.data;
  } catch (err) {
    logger.error("ElevenLabs API call failed", err.message);
    throw err;
  }

  // Save the audio buffer to the job's output folder
  const outputDir = jobOutputDir(job.id);
  await fsExtra.ensureDir(outputDir);
  const outputPath = path.join(outputDir, "voiceover.mp3");
  await fsExtra.writeFile(outputPath, Buffer.from(audioData));

  logger.info(`Voiceover saved for job ${job.id}`);

  return outputPath;
}
