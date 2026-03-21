// Cleans raw LLM script output into plain speakable/readable text
export function cleanScript(text) {
  return text
    // Remove emoji characters
    .replace(/[\u{1F300}-\u{1FFFF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{FE00}-\u{FE0F}]|[\u{1F000}-\u{1F02F}]/gu, "")
    // Remove bold section labels (**HOOK:**, **BODY:**, **CTA:** and plain variants)
    .replace(/\*?\*?(HOOK|BODY|CTA):\*?\*?/gi, "")
    // Remove remaining markdown bold syntax
    .replace(/\*\*/g, "")
    // Replace bullet points (-, •, * at line start) with just the text after them
    .replace(/^[-•*]\s+/gm, "")
    // Collapse multiple blank lines into one
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
