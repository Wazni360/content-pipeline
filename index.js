import { runPipeline } from "./src/pipeline.js";

runPipeline().catch((err) => {
  console.error(err);
  process.exit(1);
});
