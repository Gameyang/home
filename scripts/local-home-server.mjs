import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const homeRoot = path.resolve(scriptDir, '..');
const workspaceRoot = path.dirname(homeRoot);
const homePublicRoot = path.join(homeRoot, 'public');
const port = Number(readArg('--port') || process.env.PORT || 4000);
const host = '127.0.0.1';

const mimeTypes = new Map([
  ['.avif', 'image/avif'],
  ['.css', 'text/css; charset=utf-8'],
  ['.gif', 'image/gif'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.mp4', 'video/mp4'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml; charset=utf-8'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.webm', 'video/webm'],
  ['.webp', 'image/webp']
]);

if (!fs.existsSync(homePublicRoot)) {
  console.error(`public directory not found: ${homePublicRoot}`);
  process.exit(2);
}

const server = http.createServer((request, response) => {
  try {
    const url = new URL(request.url || '/', `http://${request.headers.host || `${host}:${port}`}`);

    if (url.pathname === '/.local-home-server.json') {
      sendJson(response, {
        localProjectRoute: '/__local_projects/'
      });
      return;
    }

    const target = resolveTarget(url.pathname);

    if (!target) {
      sendText(response, 404, 'Not found');
      return;
    }

    serveFile(request, response, target);
  } catch (error) {
    console.error(error);
    sendText(response, 500, 'Internal server error');
  }
});

server.listen(port, host, () => {
  console.log(`Weekly Project Home: http://${host}:${port}`);
  console.log(`Home public root: ${homePublicRoot}`);
  console.log(`Local project route: /__local_projects/<sibling-project-folder>/`);
  console.log('Press Ctrl+C to stop.');
});

function readArg(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return '';
  return process.argv[index + 1] || '';
}

function resolveTarget(urlPathname) {
  const pathname = decodePathname(urlPathname);
  const localPrefix = '/__local_projects/';

  if (pathname.startsWith(localPrefix)) {
    const rest = pathname.slice(localPrefix.length);
    const [projectDir, ...segments] = rest.split('/').filter(Boolean);
    if (!projectDir || projectDir.includes('..') || path.isAbsolute(projectDir)) return null;

    const projectPublicRoot = path.join(workspaceRoot, projectDir, 'public');
    return resolveInside(projectPublicRoot, segments.join('/'));
  }

  return resolveInside(homePublicRoot, pathname.replace(/^\/+/, ''));
}

function decodePathname(pathname) {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return pathname;
  }
}

function resolveInside(root, relativePath) {
  const safeRoot = path.resolve(root);
  const target = path.resolve(safeRoot, relativePath || '.');
  if (target !== safeRoot && !target.startsWith(`${safeRoot}${path.sep}`)) return null;
  return target;
}

function serveFile(request, response, target) {
  let filePath = target;

  if (!fs.existsSync(filePath)) {
    sendText(response, 404, 'Not found');
    return;
  }

  const stat = fs.statSync(filePath);
  if (stat.isDirectory()) {
    filePath = path.join(filePath, 'index.html');
    if (!fs.existsSync(filePath)) {
      sendText(response, 404, 'Not found');
      return;
    }
  }

  const fileStat = fs.statSync(filePath);
  if (!fileStat.isFile()) {
    sendText(response, 404, 'Not found');
    return;
  }

  const headers = {
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-store',
    'Content-Type': mimeTypes.get(path.extname(filePath).toLowerCase()) || 'application/octet-stream'
  };

  const range = request.headers.range;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match) {
      sendText(response, 416, 'Range not satisfiable');
      return;
    }

    const start = match[1] ? Number(match[1]) : 0;
    const end = match[2] ? Number(match[2]) : fileStat.size - 1;
    if (start >= fileStat.size || end >= fileStat.size || start > end) {
      response.writeHead(416, {
        ...headers,
        'Content-Range': `bytes */${fileStat.size}`
      });
      response.end();
      return;
    }

    response.writeHead(206, {
      ...headers,
      'Content-Length': end - start + 1,
      'Content-Range': `bytes ${start}-${end}/${fileStat.size}`
    });
    fs.createReadStream(filePath, { start, end }).pipe(response);
    return;
  }

  response.writeHead(200, {
    ...headers,
    'Content-Length': fileStat.size
  });
  fs.createReadStream(filePath).pipe(response);
}

function sendText(response, status, message) {
  response.writeHead(status, {
    'Cache-Control': 'no-store',
    'Content-Type': 'text/plain; charset=utf-8'
  });
  response.end(message);
}

function sendJson(response, value) {
  response.writeHead(200, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8'
  });
  response.end(`${JSON.stringify(value)}\n`);
}
