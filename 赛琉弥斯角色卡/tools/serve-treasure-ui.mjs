import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
const card = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.resolve(card, '..', 'dist/角色卡玩法规则包/界面/人物与宝物');
const portraitRoot = path.join(card, 'output/人物与宝物UI/portraits');
const mappingFile = path.join(portraitRoot, 'preview-person-portraits.json');
const port = Number(process.env.TREASURE_UI_PORT || 8356);
const host = `127.0.0.1:${port}`;
await mkdir(portraitRoot, { recursive: true });
let mappings = {};
try {
  mappings = JSON.parse(await readFile(mappingFile, 'utf8'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const json = (res, status, value) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
};
const body = async req => {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 8 * 1024 * 1024) throw Object.assign(new Error('Image too large'), { status: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
};
const localUrl = value => {
  const url = new URL(value, `http://${host}/`);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
    url.username ||
    url.password
  )
    throw Object.assign(new Error('Use a local HTTP image URL'), { status: 400 });
  return url.href;
};
let writeQueue = Promise.resolve();
const saveMapping = (id, url) => {
  const job = writeQueue.then(async () => {
    const next = { ...mappings, [id]: url };
    await writeFile(mappingFile, JSON.stringify(next, null, 2), 'utf8');
    mappings = next;
  });
  writeQueue = job.catch(() => {});
  return job;
};
http
  .createServer(async (req, res) => {
    try {
      if (![host, `localhost:${port}`].includes(req.headers.host))
        return json(res, 403, { error: 'Local preview only' });
      const pathname = decodeURIComponent(new URL(req.url, `http://${host}`).pathname);
      if (pathname === '/api/portraits' && req.method === 'GET') return json(res, 200, mappings);
      if (pathname.startsWith('/api/portraits/') && ['POST', 'PUT'].includes(req.method)) {
        if (req.headers.origin !== `http://${req.headers.host}`)
          return json(res, 403, { error: 'Use the local preview page' });
        const id = pathname.slice('/api/portraits/'.length);
        if (!['yun', 'lia'].includes(id)) return json(res, 400, { error: 'Unknown preview character' });
        const bytes = await body(req);
        let url;
        if (req.method === 'PUT') {
          url = localUrl(JSON.parse(bytes.toString('utf8')).url);
        } else {
          let extension;
          if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) extension = 'png';
          else if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) extension = 'jpg';
          else if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP')
            extension = 'webp';
          else return json(res, 415, { error: 'PNG, JPG or WebP required' });
          const filename = `${id}-${randomUUID()}.${extension}`;
          await writeFile(path.join(portraitRoot, filename), bytes, { flag: 'wx' });
          url = `/portraits/${filename}`;
        }
        await saveMapping(id, url);
        return json(res, 200, { url });
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'Method not allowed' });
      const isPortrait = pathname.startsWith('/portraits/');
      const folder = isPortrait ? portraitRoot : root;
      const relative = isPortrait
        ? pathname.slice('/portraits/'.length)
        : pathname === '/'
          ? 'index.html'
          : pathname.slice(1);
      const filename = path.resolve(folder, relative);
      if (!filename.startsWith(folder + path.sep) || (isPortrait && !/\.(png|jpg|webp)$/i.test(filename)))
        return json(res, 403, { error: 'Forbidden' });
      const bytes = await readFile(filename);
      const types = {
        '.html': 'text/html; charset=utf-8',
        '.js': 'text/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.webp': 'image/webp',
        '.json': 'application/json',
      };
      res.writeHead(200, {
        'Content-Type': types[path.extname(filename)] || 'application/octet-stream',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      res.end(req.method === 'HEAD' ? undefined : bytes);
    } catch (error) {
      json(res, error.status || (error.code === 'ENOENT' ? 404 : 500), {
        error: error.status ? error.message : 'Request failed',
      });
    }
  })
  .listen(port, '127.0.0.1', () => console.log(`Treasure UI preview: http://${host}`));
