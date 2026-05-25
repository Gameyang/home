# Home Feed Schema

The public home feed reads `public/data/projects.json`. Unknown fields are allowed but may not be displayed by the current UI.

## Standard Item

```json
{
  "id": "stable-slug",
  "title": "Public Title",
  "description": "Public-safe summary. Mention non-commercial AI learning or third-party resource limits when relevant.",
  "status": "draft",
  "week": "2026-W22",
  "date": "2026-05-25",
  "type": "Progress update",
  "author": "Gameyang",
  "thumbnail": "assets/thumbnails/stable-slug.png",
  "url": "#",
  "tags": ["AI", "Prototype", "Non-commercial"]
}
```

## Required Fields

- `id`: stable lowercase slug; used for comments as `feed-<id>`.
- `title`: public display title.
- `description`: public-safe summary.
- `status`: `published`, `draft`, or `archived`.
- `week`: ISO-like week label such as `2026-W22`.
- `date`: `YYYY-MM-DD`.
- `type`: short category label.
- `author`: usually `Gameyang`.
- `url`: public URL or `#`.
- `tags`: short public tags.

## Optional Fields

- `thumbnail`: relative path under `public/`.
- `source`: public source repository URL only. Omit for private repos.
- `licenseNote`: internal metadata for public caution; not displayed by the current UI.

## Examples

Progress from a private repo:

```json
{
  "id": "ai-map-tool-progress",
  "title": "AI Map Tool Progress",
  "description": "Non-commercial personal AI-learning progress update for an internal map tool prototype.",
  "status": "draft",
  "week": "2026-W22",
  "date": "2026-05-25",
  "type": "Progress update",
  "author": "Gameyang",
  "url": "#",
  "tags": ["AI", "Map", "Prototype", "Non-commercial"]
}
```

Completed private project with a public build:

```json
{
  "id": "private-game-demo",
  "title": "Private Game Demo",
  "description": "Public demo entry for a completed private project. Provided for non-commercial personal AI-learning review; third-party resources remain under their original licenses.",
  "status": "published",
  "week": "2026-W22",
  "date": "2026-05-25",
  "type": "Playable demo",
  "author": "Gameyang",
  "thumbnail": "assets/thumbnails/private-game-demo.png",
  "url": "projects/private-game-demo/",
  "tags": ["Game", "Demo", "Non-commercial"]
}
```
