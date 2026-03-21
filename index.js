import { runInputLayer } from "./src/layers/input.js";
import { runScriptGenLayer } from "./src/layers/scriptGen.js";
import { runVoiceoverLayer } from "./src/layers/voiceover.js";

const job = await runInputLayer();
if (!job) process.exit(0);

const scriptText = await runScriptGenLayer(job);
console.log("Script generation complete");

await runVoiceoverLayer(job, scriptText);
console.log("Voiceover generation complete");
