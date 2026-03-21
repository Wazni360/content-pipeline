import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function jobOutputDir(jobId) {
  return path.join(__dirname, "../../output", jobId);
}
