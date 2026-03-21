import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const QUEUE_PATH = path.join(__dirname, "../../jobs/queue.json");

export async function loadQueue() {
  const raw = await readFile(QUEUE_PATH, "utf8");
  return JSON.parse(raw);
}
