import { runInputLayer } from "./src/layers/input.js";
import { runScriptGenLayer } from "./src/layers/scriptGen.js";
import { runVoiceoverLayer } from "./src/layers/voiceover.js";
import { runVisualsLayer } from "./src/layers/visuals.js";

const job = await runInputLayer();
if (!job) process.exit(0);

const scriptText = await runScriptGenLayer(job);
console.log("Script generation complete");

console.log("Voiceover and visuals generating in parallel...");
const [voiceoverPath, clipPaths] = await Promise.all([
  runVoiceoverLayer(job, scriptText),
  runVisualsLayer(job, scriptText),
]);
console.log("Both complete");
