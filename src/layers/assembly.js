import ffmpeg from "fluent-ffmpeg";
import ffprobeStatic from "ffprobe-static";
import fsExtra from "fs-extra";
import path from "node:path";
import { jobOutputDir } from "../utils/jobTracker.js";
import { logger } from "../utils/logger.js";
import { cleanScript } from "../utils/cleanScript.js";

ffmpeg.setFfprobePath(ffprobeStatic.path);

// Returns the duration in seconds of an audio/video file using ffprobe
function getAudioDuration(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return reject(err);
      resolve(metadata.format.duration);
    });
  });
}

// Formats a number of seconds as an SRT timestamp string (HH:MM:SS,mmm)
function toSrtTimestamp(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

// Generates an SRT caption file timed proportionally by word count per sentence
function buildSrt(scriptText, totalDuration) {
  const cleaned = cleanScript(scriptText);
  const sentences = cleaned
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const totalWordCount = sentences.reduce((sum, s) => sum + s.split(/\s+/).length, 0);
  const secondsPerWord = totalDuration / totalWordCount;

  let srt = "";
  let currentTime = 0;

  sentences.forEach((sentence, i) => {
    const wordCount = sentence.split(/\s+/).length;
    const sentenceDuration = wordCount * secondsPerWord;
    const start = currentTime;
    const end = currentTime + sentenceDuration;
    srt += `${i + 1}\n${toSrtTimestamp(start)} --> ${toSrtTimestamp(end)}\n${sentence}\n\n`;
    currentTime = end;
  });

  return srt;
}

// Calculates each segment's duration proportional to its word count vs total voiceover duration
function calcSegmentDurations(segments, scriptText, totalDuration) {
  const cleaned = cleanScript(scriptText);
  const totalWords = cleaned.split(/\s+/).filter(Boolean).length;
  const secondsPerWord = totalDuration / totalWords;

  return segments.map((seg) => {
    const words = cleanScript(seg.text ?? seg.section).split(/\s+/).filter(Boolean).length;
    return { ...seg, duration: Math.max(words * secondsPerWord, 1) };
  });
}

// Wraps fluent-ffmpeg concat+overlay+subtitle encoding in a Promise
// Each clip is trimmed to its segment's calculated duration before concatenation
function assembleVideo(segments, voiceoverPath, captionsPath, outputPath) {
  return new Promise((resolve, reject) => {
    const clipCount = segments.length;

    // Build filter_complex: trim each clip to its segment duration, scale/crop, normalize fps
    let filterComplex = "";
    const concatInputs = [];

    segments.forEach((seg, i) => {
      filterComplex +=
        `[${i}:v]trim=duration=${seg.duration.toFixed(3)},setpts=PTS-STARTPTS,` +
        `scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30[v${i}];`;
      concatInputs.push(`[v${i}]`);
    });

    filterComplex += `${concatInputs.join("")}concat=n=${clipCount}:v=1:a=0[vconcat];`;
    filterComplex += `[vconcat]subtitles='${captionsPath.replace(/'/g, "\\'")}':force_style='FontSize=18,Alignment=2'[vout]`;

    const audioInputIndex = clipCount;

    let cmd = ffmpeg();
    segments.forEach((seg) => cmd.input(seg.clip));
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

// Assembles all clips (one per script section), voiceover, and captions into a final vertical video
export async function runAssemblyLayer(job, voiceoverPath, clipPaths, scriptText, segments) {
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

  // Step 3 — Calculate per-segment durations and assemble
  // Fall back to equal-split if no segments metadata was provided
  const activeSegments = segments && segments.length > 0
    ? calcSegmentDurations(segments, scriptText, duration)
    : clipPaths.map((clip) => ({ clip, section: "clip", duration: duration / clipPaths.length }));

  logger.info(
    `Segment durations: ${activeSegments.map((s) => `${s.section}=${s.duration.toFixed(1)}s`).join(", ")}`
  );

  const finalPath = path.join(outputDir, "final_video.mp4");
  try {
    logger.info("Starting video assembly...");
    await assembleVideo(activeSegments, voiceoverPath, captionsPath, finalPath);
    logger.info(`Final video saved: ${finalPath}`);
  } catch (err) {
    logger.error("FFmpeg assembly failed", err.message);
    throw err;
  }

  return finalPath;
}
