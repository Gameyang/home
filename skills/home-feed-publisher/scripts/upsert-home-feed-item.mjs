#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const allowedStatuses = new Set(['published', 'draft', 'archived']);

const args = parseArgs(process.argv.slice(2));

if (args.help || args.h) {
  printHelp();
  process.exit(0);
}

const home = args.home ? path.resolve(args.home) : findHomeRepo(process.cwd());
if (!home) {
  fail('Cannot find a Weekly Project Home repo from the current directory. Pass --home <path-to-home-repo>.');
}
const dataPath = path.join(home, 'public', 'data', 'projects.json');

const required = ['id', 'title', 'description', 'status'];
const missing = required.filter(key => !args[key]);
if (missing.length) {
  fail(`Missing required arguments: ${missing.map(key => `--${key}`).join(', ')}`);
}

const id = slugify(args.id);
if (id !== args.id) {
  fail(`Invalid --id "${args.id}". Use lowercase letters, digits, and hyphens only. Suggested: ${id}`);
}

if (!allowedStatuses.has(args.status)) {
  fail(`Invalid --status "${args.status}". Use published, draft, or archived.`);
}

const item = {
  id,
  title: args.title,
  description: args.description,
  status: args.status,
  week: args.week || isoWeekLabel(new Date()),
  date: args.date || todayLabel(new Date()),
  type: args.type || defaultType(args.status),
  author: args.author || 'Gameyang',
  url: args.url || '#',
  tags: splitTags(args.tags)
};

for (const key of ['thumbnail', 'source', 'licenseNote']) {
  if (args[key]) item[key] = args[key];
}

validatePublicSafeItem(item);

const existing = readJsonArray(dataPath);
const index = existing.findIndex(project => project.id === item.id);
if (index >= 0) {
  existing[index] = { ...existing[index], ...item };
} else {
  existing.unshift(item);
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
      parsed[rawKey.slice(0, eqIndex)] = rawKey.slice(eqIndex + 1);
      continue;
    }

    if (i + 1 >= argv.length || argv[i + 1].startsWith('--')) {
      parsed[rawKey] = true;
    } else {
      parsed[rawKey] = argv[i + 1];
      i += 1;
    }
  }

  return parsed;
}

function readJsonArray(filePath) {
  if (!fs.existsSync(filePath)) {
    fail(`Cannot find ${filePath}`);
  }

  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!Array.isArray(parsed)) {
    fail(`${filePath} must contain a JSON array.`);
  }

  return parsed;
}

function findHomeRepo(startDir) {
  let current = path.resolve(startDir);

  while (true) {
    const candidate = path.join(current, 'public', 'data', 'projects.json');
    if (fs.existsSync(candidate)) return current;

    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
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

  for (const key of ['url', 'source', 'thumbnail']) {
    if (item[key] && /^(?:\.\.\/|\/)/.test(item[key])) {
      fail(`Refusing unsafe ${key}: ${item[key]}`);
    }
  }

  if (item.source && !/^https?:\/\//i.test(item.source)) {
    fail(`--source must be a public http(s) URL or omitted.`);
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

function todayLabel(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isoWeekLabel(date) {
  const utcDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((utcDate - yearStart) / 86400000) + 1) / 7);
  return `${utcDate.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function defaultType(status) {
  if (status === 'draft') return 'Progress update';
  if (status === 'archived') return 'Archived build';
  return 'Public demo';
}

function printHelp() {
  console.log(`Usage:
node upsert-home-feed-item.mjs --home <path-to-home-repo> --id my-project --title "Title" --description "Summary" --status draft --tags "AI,Prototype"

Required:
  --id            lowercase hyphen slug
  --title         public title
  --description   public-safe description
  --status        published | draft | archived

Optional:
  --home          public home repo path, otherwise discovered from the current directory
  --week          week label, defaults to current ISO week
  --date          YYYY-MM-DD, defaults to today
  --type          display type
  --author        defaults to Gameyang
  --thumbnail     relative path under public/
  --url           public URL or #, defaults to #
  --source        public source URL only
  --tags          comma-separated tags
  --licenseNote   metadata note, not currently displayed
`);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
