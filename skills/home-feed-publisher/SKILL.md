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
- Each project feed should include only public-safe visual posts: images, GIFs, videos, demo embeds, and short promotional text.
- Mention non-commercial/personal AI-learning context when license risk or third-party resources are material.

## Workflow

1. Inspect the project repo enough to confirm it has public-safe assets and a planned public GitHub Pages URL.
2. Ensure the project repo exposes `public/home-feed.json`.
3. Inspect `F:\Workspace\home\public\data\sources.json` and existing source IDs.
4. Choose a stable lowercase hyphenated `id`.
5. Prefer the bundled script for source registration:

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

6. Verify the public home repo:

```powershell
node -e "JSON.parse(require('fs').readFileSync('public/data/sources.json','utf8')); console.log('SOURCES_JSON_OK')"
node --check public/js/main.js
```

7. Summarize what was connected and call out any omitted private details.

## Schema Reference

Read `references/home-feed-schema.md` when adding fields, choosing media types, or preparing examples.
