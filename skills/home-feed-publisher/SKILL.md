---
name: home-feed-publisher
description: Publish public-safe progress updates or completed private-project entry points from private repositories into the public Weekly Project Home feed. Use when Codex is working in another private repo and needs to add or update an item in a Weekly Project Home public feed, prepare a GitHub Pages entry, avoid leaking private source links/secrets/local paths, and preserve the non-commercial/personal AI-learning usage notice.
---

# Home Feed Publisher

## Overview

Use this skill to move a private repo's public-safe progress or release summary into the public `Weekly Project Home` feed. Treat the user's `home` repo as the public target; if the path is not obvious, ask for the local path or use the current repository when it contains `public/data/projects.json`.

## Privacy Rules

- Do not expose private repository URLs, private branch names, tokens, API keys, local absolute paths, unreleased prompts, internal notes, paid assets, or licensed third-party files unless the user explicitly marks them public-safe.
- For private projects, omit `source` by default. Add `source` only when the target repository is intentionally public.
- Use `url: "#"` for progress-only items that do not have a public build yet.
- Use a public GitHub Pages URL or `projects/<project-slug>/` only after the build output has been intentionally copied into the public home repo.
- Mention non-commercial/personal AI-learning context in the item description when license risk or third-party resources are material.

## Feed Item Choices

- Progress update: `status: "draft"`, `type: "Progress update"`, `url: "#"`, no private `source`.
- Completed public entry: `status: "published"`, `type` such as `"Playable demo"` or `"Interactive demo"`, public `url`, no private `source` unless public.
- Retired entry: `status: "archived"`, public `url` if still available.

## Workflow

1. Inspect the private repo enough to summarize only public-safe progress.
2. Inspect `<home-repo>/public/data/projects.json` and existing item IDs.
3. Choose a stable lowercase hyphenated `id`.
4. Prefer the bundled script for JSON updates:

```powershell
node <skill-dir>\scripts\upsert-home-feed-item.mjs `
  --home <home-repo> `
  --id my-project-progress `
  --title "My Project Progress" `
  --description "Public-safe non-commercial AI learning progress summary." `
  --status draft `
  --week 2026-W22 `
  --date 2026-05-25 `
  --type "Progress update" `
  --author Gameyang `
  --url "#" `
  --tags "AI,Prototype,Non-commercial"
```

5. If a thumbnail is used, place only public-safe/licensed-for-display assets under `public/assets/thumbnails/` and pass its relative path with `--thumbnail`.
6. Verify the public home repo:

```powershell
node -e "JSON.parse(require('fs').readFileSync('public/data/projects.json','utf8')); console.log('JSON_OK')"
node --check public/js/main.js
```

7. Summarize what was added or updated, and call out any omitted private details.

## Schema Reference

Read `references/home-feed-schema.md` when adding fields, choosing statuses, or preparing examples.
