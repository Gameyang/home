# Home Feed Schema

The public home feed reads `public/data/sources.json`. Each source points to a public project's static `home-feed.json`.

## Source Registry

```json
[
  {
    "id": "stable-project-slug",
    "title": "Public Project Title",
    "feedUrl": "https://gameyang.github.io/stable-project-slug/home-feed.json",
    "pageUrl": "https://gameyang.github.io/stable-project-slug/",
    "sourceUrl": "https://github.com/Gameyang/stable-project-slug",
    "tags": ["AI", "Game", "Non-commercial"]
  }
]
```

## Project Feed

Each public project should expose this file at `public/home-feed.json`.

```json
{
  "schemaVersion": 1,
  "project": {
    "id": "stable-project-slug",
    "title": "Public Project Title",
    "description": "Public-safe summary.",
    "pageUrl": "https://gameyang.github.io/stable-project-slug/",
    "sourceUrl": "https://github.com/Gameyang/stable-project-slug",
    "tags": ["AI", "Game", "Non-commercial"]
  },
  "posts": [
    {
      "id": "2026-05-25-visual-update",
      "date": "2026-05-25",
      "type": "gallery",
      "title": "Visual Update",
      "text": "Short social post text.",
      "media": [
        {
          "type": "image",
          "url": "assets/example.png",
          "alt": "Example image"
        }
      ],
      "url": "https://gameyang.github.io/stable-project-slug/",
      "linkLabel": "Open project",
      "tags": ["Screenshot"]
    }
  ]
}
```

`text` renders as the postcard introduction. `url` renders as a link inside that introduction, and optional `linkLabel` controls the visible link text.

## Media Types

- `image`: one screenshot or rendered asset
- `gallery`: multiple images
- `gif`: animated GIF preview
- `video`: mp4/webm video
- `embed`: iframe demo or mini-game URL
- `text`: short note without media

Relative media URLs are resolved relative to the project `home-feed.json` URL.
