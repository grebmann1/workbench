# Workbench 2.0 product film

A 78-second React/JavaScript film, exported as a 1080p MP4 with an original ambient soundtrack. It shares faithful product UI replicas with the homepage tour, using production icons, illustration assets, and application menu data. The interfaces use fictional org data and demonstrate scripted workflows. The framing uses Salesforce blue, and the opening and closing explain that the five workflows are just a few of Workbench 2.0’s capabilities.

Design sources and maintenance guidance: [demo design references](../../apps/ui/src/product-tour/design-reference.md).

## Watch and edit

```sh
npm --prefix apps/ui run dev
# Open http://localhost:27100/film, then press Play.
```

The player includes pause, scrubbing, chapter navigation, fullscreen, and a readable transcript. Playback starts paused, including for reduced-motion users. The browser preview is silent; the exported MP4 includes music and an optional English subtitle track.

- `apps/ui/src/product-film/story.ts` holds the copy, chapters, and timing.
- `apps/ui/src/product-film/ProductFilm.tsx` composes the film and player.
- `apps/ui/src/product-film/product-film.css` defines the Salesforce blue art direction (`#0176d3`, `#1b96ff`, and navy `#032d60`).
- `tools/product-film/score.mjs` synthesizes the original music locally.

Every frame is calculated from an explicit timestamp. Exporting does not depend on a screen recorder, browser playback speed, or CSS animation clocks. The film route is lazy-loaded.

## Export

Use Node 22.14+ with the repository dependencies installed, FFmpeg on PATH, and Playwright Chromium installed (`npx playwright install chromium` if needed).

```sh
node --experimental-strip-types tools/product-film/render.mjs
# Faster review export:
node --experimental-strip-types tools/product-film/render.mjs --width=1280 --fps=12 --out=out/product-film-review
```

The exporter starts and closes its own local Vite server and browser. It writes to `out/product-film/` (gitignored):

- `workbench-tour.mp4` — 1920×1080, 30fps, H.264/AAC, 78 seconds, web optimized.
- `poster.png` and `stills/` — opening poster and one image per chapter.
- `workbench-tour.srt` and `transcript.md` — captions and transcript.
- `soundtrack.wav` — original music for further editing.

The English film is authored separately from the localized homepage. No hosted upload or publishing step is performed by the exporter. Existing output files in the chosen output directory are replaced when rerendering.

## Story

| Time      | Scene              | Demonstration                                |
| --------- | ------------------ | -------------------------------------------- |
| 0:00–0:07 | Meet Workbench     | One toolkit for data, metadata, code, and AI |
| 0:07–0:18 | Salesforce overlay | Open tools and find Account in context       |
| 0:18–0:30 | SOQL Explorer      | Type a query, run it, inspect records        |
| 0:30–0:41 | Metadata Explorer  | Filter and inspect Account metadata          |
| 0:41–0:54 | Browser editor     | Create an LWC and write its template         |
| 0:54–1:08 | AI agent           | Fill a support form through the browser      |
| 1:08–1:18 | Closing            | Recap and install invitation                 |
