# Weekly Project Home

주간 프로젝트를 소셜 미디어 피드처럼 모아 보는 정적 웹 허브입니다. 각 공개 프로젝트가 제공하는 `home-feed.json`을 읽어 이미지, GIF, 영상, 미니게임 포스트를 타임라인으로 표시합니다.

이 저장소는 GitHub Pages 배포를 전제로 합니다. 서버 애플리케이션이나 데이터베이스를 실행하지 않고, `public/` 아래의 HTML, CSS, JavaScript, JSON 파일만으로 동작합니다.

## Features

- 공개 프로젝트의 feed JSON을 모아 세로형 소셜 피드 UI로 표시
- 이미지, GIF, 영상, 데모 미디어 필터
- 포스트 제목, 설명, 날짜, 유형, 태그 검색
- 갤러리 이미지, GIF, 비디오, iframe 데모 표시
- 프로젝트 공개 URL 및 GitHub 소스 링크 제공
- GitHub Issues 기반 댓글 위젯 지원
- GitHub Pages에 바로 배포 가능한 정적 파일 구조

## Repository Structure

```text
/
├── README.md
├── skills/
│   └── home-feed-publisher/
│       ├── SKILL.md
│       ├── agents/
│       ├── references/
│       └── scripts/
└── public/
    ├── index.html
    ├── css/
    │   └── style.css
    ├── js/
    │   └── main.js
    ├── data/
    │   └── sources.json
    └── assets/
        └── thumbnails/
```

## Feed Data

홈이 읽을 공개 프로젝트 목록은 `public/data/sources.json`에서 관리합니다.

```json
[
  {
    "id": "gpt-genimage2-2d-game-art-resource-test",
    "title": "GPT GenImage2 2D Game Art Resource Test",
    "feedUrl": "https://gameyang.github.io/GPT-GenImage2-2D-Game-Art-Resource-Test/home-feed.json",
    "pageUrl": "https://github.com/Gameyang/GPT-GenImage2-2D-Game-Art-Resource-Test",
    "sourceUrl": "https://github.com/Gameyang/GPT-GenImage2-2D-Game-Art-Resource-Test",
    "tags": ["AI", "Game Art", "Pixel Art", "Non-commercial"]
  }
]
```

각 공개 프로젝트는 GitHub Pages에서 `home-feed.json`을 노출합니다.

```json
{
  "schemaVersion": 1,
  "project": {
    "id": "project-id",
    "title": "Project Title",
    "description": "Public project summary",
    "pageUrl": "https://gameyang.github.io/project-id/",
    "sourceUrl": "https://github.com/Gameyang/project-id",
    "tags": ["AI", "Game"]
  },
  "posts": [
    {
      "id": "2026-05-25-demo",
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
      "url": "https://gameyang.github.io/project-id/",
      "linkLabel": "Open project",
      "tags": ["Screenshot"]
    }
  ]
}
```

## Local Preview

`fetch()`로 JSON 데이터를 읽기 때문에 파일을 직접 여는 대신 로컬 정적 서버로 확인하는 것이 안전합니다.

```bash
npx serve public -l 4000
```

브라우저에서 아래 주소로 접속합니다.

```text
http://127.0.0.1:4000
```

## GitHub Pages Deployment

GitHub Pages에서 `public/` 디렉터리를 배포 대상으로 사용합니다. GitHub Actions를 사용할 경우 아래 워크플로우를 `.github/workflows/deploy.yml`에 추가할 수 있습니다.

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: ["main"]

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: "pages"
  cancel-in-progress: false

jobs:
  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v6

      - name: Setup Pages
        uses: actions/configure-pages@v5

      - name: Upload artifact
        uses: actions/upload-pages-artifact@v4
        with:
          path: "./public"

      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

프로젝트 페이지 URL은 일반적으로 다음 형식입니다.

```text
https://gameyang.github.io/home/
```

## Comments

댓글은 GitHub Pages 자체 기능이 아니라 [Utterances](https://utteranc.es/) 위젯을 통해 GitHub Issues에 저장됩니다. 방문자는 GitHub 계정으로 로그인한 뒤 댓글을 남길 수 있습니다.

설정 절차:

1. `Gameyang/home` 저장소에서 Issues를 활성화합니다.
2. [utterances GitHub App](https://github.com/apps/utterances)을 저장소에 설치합니다.
3. `public/index.html`의 `body` 속성이 저장소와 맞는지 확인합니다.

```html
<body data-comments-repo="Gameyang/home" data-comments-theme="github-light" data-comments-label="feed-comment">
```

각 포스트 댓글은 `feed-<project-id>-<post-id>` 형식의 GitHub Issue에 연결됩니다.

## Codex Skill

이 저장소에는 비공개 프로젝트의 공개 가능한 진행 상황이나 완료 빌드 진입점을 `Weekly Project Home` 피드에 추가하기 위한 Codex skill이 포함되어 있습니다.

```text
skills/home-feed-publisher/
```

이 skill은 다른 비공개 repo에서 작업할 때 다음 용도로 사용합니다.

- 공개 가능한 개발 진행글이나 비주얼 포스트를 홈 피드에 연결
- 완료된 공개 프로젝트의 Pages feed endpoint를 `sources.json`에 등록
- private repo URL, token, local path, 비공개 노트가 공개 `projects.json`에 들어가지 않도록 점검
- 비상업 개인 AI 학습용 및 외부 리소스 라이선스 주의 문구 유지

로컬 Codex에서 사용하려면 이 폴더를 개인 skill 디렉터리에 복사합니다.

```powershell
Copy-Item -Recurse -Force .\skills\home-feed-publisher $env:CODEX_HOME\skills\
```

`CODEX_HOME`이 없다면 보통 아래 위치를 사용할 수 있습니다.

```powershell
Copy-Item -Recurse -Force .\skills\home-feed-publisher $HOME\.codex\skills\
```

사용 예시:

```text
Use $home-feed-publisher to add this private project progress to my public home feed.
```

## License and Usage Notice

이 저장소와 공개 페이지에 연결된 프로젝트들은 개인 AI 학습, 실험, 포트폴리오 정리를 목적으로 만든 비상업용 개인 페이지입니다.

- 이 페이지와 연결된 프로젝트들은 상업적 서비스, 판매, 광고, 유료 배포를 목적으로 제공되지 않습니다.
- 공개 저장소라고 해서 모든 코드, 이미지, 사운드, 폰트, 모델, 데이터, 기타 리소스의 자유로운 재사용을 허가하는 것은 아닙니다.
- 프로젝트 중 일부에는 별도 라이선스가 있는 외부 리소스가 포함될 수 있습니다.
- 제3자 리소스의 저작권과 라이선스는 각 원저작자와 배포처의 조건을 우선합니다.
- 외부 리소스는 학습 및 데모 페이지 구성을 위해 제한적으로 사용되었으며, 재배포나 상업적 사용 권한을 부여하지 않습니다.
- 별도 라이선스가 명시되지 않은 이 저장소의 작성물은 기본적으로 개인 비상업 학습용으로만 공개됩니다.

라이선스 문제가 있거나 삭제가 필요한 리소스가 있다면 GitHub Issue 또는 저장소 연락 경로를 통해 알려 주세요. 확인 후 수정하거나 제거하겠습니다.

## Adding a Project

1. 프로젝트 repo를 공개하고 GitHub Pages에서 `public/`을 배포합니다.
2. 프로젝트의 `public/home-feed.json`에 공개 포스트와 미디어를 기록합니다.
3. 홈의 `public/data/sources.json`에 프로젝트 `feedUrl`을 추가합니다.
4. 로컬 서버에서 피드, 검색, 필터, 링크를 확인합니다.
5. `main` 브랜치에 반영하면 GitHub Pages 배포가 갱신됩니다.

## Notes

- 이 프로젝트는 정적 사이트입니다. 서버 측 인증, 자체 댓글 DB, 파일 업로드, 관리자 API는 포함하지 않습니다.
- 댓글 데이터는 GitHub Issues에 저장되므로 공개 저장소의 공개 이슈 정책을 따릅니다.
- 공개하면 안 되는 실험 기록, 비공개 자산, 내부 노트는 이 저장소에 포함하지 않는 것을 권장합니다.
- 라이선스가 불명확한 외부 리소스는 가능하면 제거하거나 출처와 사용 조건을 프로젝트별로 기록하는 것을 권장합니다.
