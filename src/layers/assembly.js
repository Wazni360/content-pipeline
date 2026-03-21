import ffmpeg from "fluent-ffmpeg";
import ffprobeStatic from "ffprobe-static";
import fsExtra from "fs-extra";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { jobOutputDir } from "../utils/jobTracker.js";
import { logger } from "../utils/logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

ffmpeg.setFfprobePath(ffprobeStatic.path);

// Strips HOOK/BODY/CTA labels and markdown bold syntax from script text
function cleanScript(text) {
  return text
    .split("\n")
    .map((line) => line.replace(/\*?\*?(HOOK|BODY|CTA):\*?\*?/i, "").replace(/\*\*/g, ""))
    .filter((line) => line.trim() !== "")
    .join(" ")
    .trim();
}

// Step 1 — Returns the duration in seconds of an audio/video file using ffprobe
function getAudioDuration(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return reject(err);
      resolve(metadata.format.duration);
    });
  });
}

// Step 2 — Formats a number of seconds as an SRT timestamp string (HH:MM:SS,mmm)
function toSrtTimestamp(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

// Step 2 — Generates an SRT caption file from the cleaned script distributed across the voiceover duration
function buildSrt(scriptText, totalDuration) {
  const cleaned = cleanScript(scriptText);
  const sentences = cleaned
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const timePerSentence = totalDuration / sentences.length;
  let srt = "";

  sentences.forEach((sentence, i) => {
    const start = i * timePerSentence;
    const end = start + timePerSentence - 0.1;
    srt += `${i + 1}\n${toSrtTimestamp(start)} --> ${toSrtTimestamp(end)}\n${sentence}\n\n`;
  });

  return srt;
}

// Step 3 — Wraps fluent-ffmpeg concat+overlay+subtitle encoding in a Promise
function assembleVideo(clipPaths, voiceoverPath, captionsPath, outputPath, totalDuration) {
  return new Promise((resolve, reject) => {
    const clipCount = clipPaths.length;
    const clipDuration = totalDuration / clipCount;

    // Build a filter_complex that trims, scales, and crops each clip, then concatenates them
    let filterComplex = "";
    const concatInputs = [];

    clipPaths.forEach((_, i) => {
      filterComplex += `[${i}:v]trim=duration=${clipDuration},setpts=PTS-STARTPTS,scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30[v${i}];`;
      concatInputs.push(`[v${i}]`);
    });

    filterComplex += `${concatInputs.join("")}concat=n=${clipCount}:v=1:a=0[vconcat];`;
    filterComplex += `[vconcat]subtitles='${captionsPath.replace(/'/g, "\\'")}':force_style='FontSize=18,Alignment=2'[vout]`;

    // Index of the voiceover input (after all clips)
    const audioInputIndex = clipCount;

    let cmd = ffmpeg();
    clipPaths.forEach((p) => cmd.input(p));
    cmd
      .input(voiceoverPath)
      .complexFilter(filterComplex)
      .outputOptions([
        "-map [vout]",
        `-map ${audioInputIndex}:a`,
        "-c:v libx264",
        "-c:a aac",
        "-shortest",
      ])
      .output(outputPath)
      .on("stderr", (line) => console.log("[ffmpeg]", line))
      .on("progress", (p) => {
        if (p.percent) logger.info(`Encoding: ${Math.round(p.percent)}%`);
      })
      .on("end", () => resolve(outputPath))
      .on("error", (err) => reject(err))
      .run();
  });
}

// Assembles all clips, voiceover, and captions into a final vertical video
export async function runAssemblyLayer(job, voiceoverPath, clipPaths, scriptText) {
  const outputDir = jobOutputDir(job.id);
  await fsExtra.ensureDir(outputDir);

  // Step 1 — Get voiceover duration
  let duration;
  try {
    duration = await getAudioDuration(voiceoverPath);
    logger.info(`Voiceover duration: ${duration.toFixed(2)}s`);
  } catch (err) {
    logger.error("Failed to read voiceover duration", err.message);
    throw err;
  }

  // Step 2 — Build and save captions
  const captionsPath = path.join(outputDir, "captions.srt");
  try {
    const srt = buildSrt(scriptText, duration);
    await fsExtra.writeFile(captionsPath, srt, "utf8");
    logger.info(`Captions saved to ${captionsPath}`);
  } catch (err) {
    logger.error("Failed to generate captions", err.message);
    throw err;
  }

  // Step 3 — Assemble final video with FFmpeg
  const finalPath = path.join(outputDir, "final_video.mp4");
  try {
    logger.info("Starting video assembly...");
    await assembleVideo(clipPaths, voiceoverPath, captionsPath, finalPath, duration);
    logger.info(`Final video saved: ${finalPath}`);
  } catch (err) {
    logger.error("FFmpeg assembly failed", err.message);
    throw err;
  }

  // Step 4 — Return path to final video
  return finalPath;
}
