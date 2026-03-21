import { loadQueue } from "./layers/input.js";
import { logger } from "./utils/logger.js";

/**
 * Master orchestrator — wire layers here in order.
 */
export async function runPipeline() {
  logger.info("Pipeline started");
  const queue = await loadQueue();
  logger.info("Queue loaded", { count: queue.length });
  // TODO: scriptGen → voiceover → visuals → assembly → metadata → publish
}
