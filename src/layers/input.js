import fsExtra from "fs-extra";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { getNextPendingJob, updateJobStatus, jobOutputDir } from "../utils/jobTracker.js";
import { logger } from "../utils/logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Picks the next pending job, marks it in_progress, creates its output folder, and returns it
export async function runInputLayer() {
  const job = await getNextPendingJob();

  if (!job) {
    logger.info("No pending jobs found.");
    return null;
  }

  await updateJobStatus(job.id, "in_progress");

  const outputDir = jobOutputDir(job.id);
  await fsExtra.ensureDir(outputDir);

  logger.info(`Starting job ${job.id}: "${job.topic}"`);

  return job;
}
