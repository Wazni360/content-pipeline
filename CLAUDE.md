# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
yarn start        # Run the pipeline (node index.js)
node test.js      # Test local LLM connectivity (requires LM Studio on port 1234)
```

No lint or test runner is configured yet.

## Architecture

This is a content automation pipeline that turns topic ideas into published videos. Jobs are loaded from `jobs/queue.json` and processed sequentially through discrete layers.

**Flow:** Input → ScriptGen → Voiceover → Visuals → Assembly → Metadata → Publish

- `index.js` — entry point, calls `runPipeline()`
- `src/pipeline.js` — master orchestrator; iterates jobs and calls each layer in order
- `src/layers/` — one file per pipeline stage; all stages are currently stubs that throw "not implemented"
- `src/utils/logger.js` — simple console logger
- `src/utils/jobTracker.js` — resolves output directory paths per job
- `jobs/queue.json` — job queue; each entry has `id`, `topic`, `status`, `createdAt`

**External APIs (configured via `.env`):**
- `OPENAI_API_KEY` — intended for script generation
- `ELEVENLABS_API_KEY` — intended for voiceover (ElevenLabs)
- Local LLM — `test.js` targets `http://localhost:1234` (LM Studio) with `mistralai/mistral-small-3.2`

The project uses ES modules (`"type": "module"` in package.json), so use `import`/`export` syntax throughout.
