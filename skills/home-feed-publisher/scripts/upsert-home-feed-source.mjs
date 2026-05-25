#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const args = parseArgs(process.argv.slice(2));

if (args.help || args.h) {
  printHelp();
  process.exit(0);
}

const home = args.home || 'F:\\Workspace\\home';
const dataPath = path.join(home, 'public', 'data', 'sources.json');

const required = ['id', 'title', 'feedUrl'];
const missing = required.filter(key => !args[key]);
if (missing.length) {
  fail(`Missing required arguments: ${missing.map(key => `--${key}`).join(', ')}`);
}

const id = slugify(args.id);
if (id !== args.id) {
  fail(`Invalid --id "${args.id}". Use lowercase letters, digits, and hyphens only. Suggested: ${id}`);
}

const item = {
  id,
  title: args.title,
  feedUrl: args.feedUrl,
  pageUrl: args.pageUrl || args.sourceUrl || '',
  sourceUrl: args.sourceUrl || '',
  tags: splitTags(args.tags)
};

validatePublicSafeItem(item);

const existing = readJsonArray(dataPath);
const index = existing.findIndex(source => source.id === item.id);
if (index >= 0) {
  existing[index] = { ...existing[index], ...item };
} else {
  existing.push(item);
}

fs.writeFileSync(dataPath, `${JSON.stringify(existing, null, 2)}\n`, 'utf8');

console.log(`${index >= 0 ? 'Updated' : 'Added'} ${item.id}`);
console.log(dataPath);

function parseArgs(argv) {
  const parsed = {};

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      fail(`Unexpected argument "${token}". Use --key value pairs.`);
    }

    const rawKey = token.slice(2);
    const eqIndex = rawKey.indexOf('=');
    if (eqIndex >= 0) {
      parsed[normalizeKey(rawKey.slice(0, eqIndex))] = rawKey.slice(eqIndex + 1);
      continue;
    }

    const key = normalizeKey(rawKey);
    if (i + 1 >= argv.length || argv[i + 1].startsWith('--')) {
      parsed[key] = true;
    } else {
      parsed[key] = argv[i + 1];
      i += 1;
    }
  }

  return parsed;
}

function normalizeKey(key) {
  return String(key).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

function readJsonArray(filePath) {
  if (!fs.existsSync(filePath)) {
    return [];
  }

  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!Array.isArray(parsed)) {
    fail(`${filePath} must contain a JSON array.`);
  }

  return parsed;
}

function validatePublicSafeItem(item) {
  const joined = JSON.stringify(item);
  const forbiddenPatterns = [
    /ghp_[A-Za-z0-9_]+/,
    /github_pat_[A-Za-z0-9_]+/,
    /access[_-]?token/i,
    /api[_-]?key/i,
    /secret/i,
    /[A-Za-z]:\\/,
    /file:\/\//i
  ];

  for (const pattern of forbiddenPatterns) {
    if (pattern.test(joined)) {
      fail(`Refusing to write item because it appears to contain a secret, token, or local path: ${pattern}`);
    }
  }

  for (const key of ['feedUrl', 'pageUrl', 'sourceUrl']) {
    if (item[key] && !/^https?:\/\//i.test(item[key])) {
      fail(`--${key} must be a public http(s) URL or omitted.`);
    }
  }
}

function splitTags(value) {
  if (!value) return ['Non-commercial'];
  return String(value)
    .split(',')
    .map(tag => tag.trim())
    .filter(Boolean);
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function printHelp() {
  console.log(`Usage:
node upsert-home-feed-source.mjs --home F:\\Workspace\\home --id my-project --title "My Project" --feed-url "https://gameyang.github.io/my-project/home-feed.json" --source-url "https://github.com/Gameyang/my-project" --tags "AI,Game"

Required:
  --id            lowercase hyphen slug
  --title         public title
  --feed-url      public home-feed.json URL

Optional:
  --home          public home repo path, defaults to F:\\Workspace\\home
  --page-url      public project or demo URL
  --source-url    public source repository URL
  --tags          comma-separated tags
`);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
