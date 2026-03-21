import { runInputLayer } from "./src/layers/input.js";
import { runScriptGenLayer } from "./src/layers/scriptGen.js";

const job = await runInputLayer();
if (!job) process.exit(0);

await runScriptGenLayer(job);
console.log("Script generation complete");
