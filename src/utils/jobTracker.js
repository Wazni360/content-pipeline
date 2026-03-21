import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const QUEUE_PATH = path.resolve(__dirname, "../../jobs/queue.json");

// Returns the output directory path for a given job id
export function jobOutputDir(jobId) {
  return path.resolve(__dirname, "../../output", jobId);
}

async function readQueue() {
  const raw = await readFile(QUEUE_PATH, "utf8");
  return JSON.parse(raw);
}

async function writeQueue(jobs) {
  await writeFile(QUEUE_PATH, JSON.stringify(jobs, null, 2));
}

// Reads queue.json and returns the first job with status "pending", or null if none exist
export async function getNextPendingJob() {
  const jobs = await readQueue();
  return jobs.find((job) => job.status === "pending") ?? null;
}

// Updates a specific job's status field in queue.json
export async function updateJobStatus(jobId, status) {
  const jobs = await readQueue();
  const job = jobs.find((j) => j.id === jobId);
  if (!job) throw new Error(`Job not found: ${jobId}`);
  job.status = status;
  await writeQueue(jobs);
}

// Sets a job's status to "failed" and records the failure reason
export async function markJobFailed(jobId, reason) {
  const jobs = await readQueue();
  const job = jobs.find((j) => j.id === jobId);
  if (!job) throw new Error(`Job not found: ${jobId}`);
  job.status = "failed";
  job.failureReason = reason;
  await writeQueue(jobs);
}
