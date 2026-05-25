---
name: home-feed-publisher
description: Register public project feed endpoints in F:\Workspace\home so Weekly Project Home can render image, GIF, video, and demo posts from public repositories without copying private working files.
---

# Home Feed Publisher

## Overview

Use this skill to connect a public project repository to the public `Weekly Project Home` social feed. Treat `F:\Workspace\home` as the default public home repo unless the user provides another path.

The home repo renders the social UI. Each public project repo exposes a static `home-feed.json` through GitHub Pages.

## Privacy Rules

- Do not expose private repository URLs, tokens, API keys, local absolute paths, internal notes, paid assets, or licensed third-party files unless the user explicitly marks them public-safe.
- Register only public `https://` URLs in `public/data/sources.json`.
- For local-only preview overrides, use ignored `public/data/local-sources.json`; do not put local absolute paths or localhost URLs in public `sources.json`.
- Each project feed should include only public-safe visual posts: images, GIFs, videos, demo embeds, and short promotional text.
- Mention non-commercial/personal AI-learning context when license risk or third-party resources are material.

## Workflow

1. Inspect the project repo enough to confirm it has public-safe assets and a planned public GitHub Pages URL.
2. Before adding or updating posts, require optimized web-preview delivery media in the project repo:
   - Look for a project-local conversion script first, such as `scripts/optimize-home-feed-media.*`, `scripts/convert-media.*`, or an npm script for media optimization.
   - If no conversion script exists and the user is posting new media, propose adding one before editing `public/home-feed.json`.
   - Prefer scriptable tools already present in the project. Otherwise suggest `ffmpeg` for video/GIF conversion and `sharp`, `cwebp`, ImageMagick, or Squoosh CLI for image conversion.
   - Ask for generated preview assets sized for website/feed display, not archival originals. Keep large originals out of `media.url`.
3. Use compressed public delivery formats in `home-feed.json`; keep originals as source assets only when they are public-safe:
   - Still images: publish `.webp`. Use lossless WebP for pixel art, UI captures with hard edges, alpha-heavy assets, and sprites; use lossy WebP quality 75-85 for screenshots, renders, and illustrations.
   - Animated GIF posts: do not publish raw `.gif` unless explicitly requested. Convert short loops to animated `.webp`; convert longer or heavy animations to `video` posts using `.webm` or `.mp4`.
   - Video posts: publish `.webm` when the project targets modern browsers and size matters; include `.mp4` when compatibility is more important. Do not use `.m4a` for video because it is audio-only in normal web usage.
   - Posters/thumbnails: publish `.webp`.
4. Suggest practical web-preview size targets before posting:
   - Feed thumbnails/card media: default max long edge 1280 px, hard max 1600 px. Use 640-960 px variants when the project has many images or dense galleries.
   - Image file sizes: aim under 300-700 KB per preview image; allow up to about 1 MB only for detailed art where compression damage is visible.
   - Pixel art previews: preserve crisp edges; upscale intentionally, then encode WebP lossless or near-lossless.
   - Short loops: keep under 8-12 seconds when possible, remove audio unless needed, and target under 3-5 MB for feed previews.
   - Demo videos: default to 720p, use 1080p only when visual detail matters, 24-30 fps, muted unless audio is part of the result, and target under 8-15 MB for feed previews.
   - Posters: generate `.webp` posters at the same display aspect ratio as the video, usually 1280x720 or smaller.
5. Ensure the project repo exposes `public/home-feed.json`, and make media URLs point at optimized delivery files, not raw PNG/GIF/video captures.
6. Inspect `F:\Workspace\home\public\data\sources.json` and existing source IDs.
7. Choose a stable lowercase hyphenated `id`.
8. Prefer the bundled script for source registration:

```powershell
node F:\Workspace\home\skills\home-feed-publisher\scripts\upsert-home-feed-source.mjs `
  --home F:\Workspace\home `
  --id my-project `
  --title "My Project" `
  --feed-url "https://gameyang.github.io/my-project/home-feed.json" `
  --page-url "https://gameyang.github.io/my-project/" `
  --source-url "https://github.com/Gameyang/my-project" `
  --tags "AI,Game,Non-commercial"
```

9. For local sibling-project preview, create or update `public/data/local-sources.json` in the home repo. Keep this file ignored by git. Use `localProjectDir` to point at a project folder that sits beside `F:\Workspace\home`; the local server maps it to that project's `public` directory:

```json
[
  {
    "id": "my-project",
    "localProjectDir": "my-project"
  }
]
```

10. Run `home.ps1` or `home.cmd` for local preview when local sibling projects are needed. The launcher uses `scripts/local-home-server.mjs` to serve the home app at `/` and sibling project public folders at `/__local_projects/<project-folder>/`.

11. Verify the public home repo:

```powershell
node -e "JSON.parse(require('fs').readFileSync('public/data/sources.json','utf8')); console.log('SOURCES_JSON_OK')"
node --check public/js/main.js
```

12. Summarize what was connected, which optimized media formats were used, and call out any omitted private or unoptimized original assets.

## Schema Reference

Read `references/home-feed-schema.md` when adding fields, choosing media types, or preparing examples.
