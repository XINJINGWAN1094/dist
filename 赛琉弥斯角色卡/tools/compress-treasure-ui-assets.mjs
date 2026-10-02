import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { withLocalUiBrowser } from './local-ui-browser.mjs';

const card = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assets = path.join(card, 'src/角色卡玩法规则包/界面/人物与宝物/assets');
const names = (await readdir(assets)).filter(name => name.endsWith('.png')).sort();
if (!names.length) throw new Error('No PNG working sources to encode');
const permitted = new Set(names);
const server = http.createServer(async (req, res) => {
  try {
    const name = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname.slice(1));
    if (!name) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<!doctype html><title>Local WebP encoder</title>');
      return;
    }
    if (!permitted.has(name)) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, { 'Content-Type': 'image/png' });
    res.end(await readFile(path.join(assets, name)));
  } catch {
    res.writeHead(500);
    res.end();
  }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
try {
  const entries = await withLocalUiBrowser(
    path.join(card, 'output/人物与宝物UI'),
    async ({ send, evaluate, pause }) => {
      await send('Page.navigate', { url: origin });
      for (let n = 0; n < 50; n++) {
        if (await evaluate(`location.origin === ${JSON.stringify(origin)} && document.readyState === 'complete'`))
          break;
        await pause(100);
      }
      const results = [];
      for (const name of names) {
        const encoded = await evaluate(`(async()=>{
        const response=await fetch(${JSON.stringify('/' + encodeURIComponent(name))});
        if(!response.ok)throw Error('Source image unavailable');
        const bitmap=await createImageBitmap(await response.blob());
        const canvas=new OffscreenCanvas(bitmap.width,bitmap.height);
        canvas.getContext('2d',{alpha:true}).drawImage(bitmap,0,0);
        const blob=await canvas.convertToBlob({type:'image/webp',quality:0.95});
        if(blob.type!=='image/webp')throw Error('WebP encoder unavailable');
        const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.onerror=reject;reader.readAsDataURL(blob)});
        const width=bitmap.width,height=bitmap.height;bitmap.close();return {data,width,height};
      })()`);
        const bytes = Buffer.from(encoded.data, 'base64');
        if (bytes.toString('ascii', 8, 12) !== 'WEBP') throw new Error('Invalid WebP result');
        const filename = name.replace(/\.png$/, '.webp');
        await writeFile(path.join(assets, filename), bytes);
        results.push({
          file: filename,
          width: encoded.width,
          height: encoded.height,
          quality: 95,
          sourceBytes: (await stat(path.join(assets, name))).size,
          bytes: bytes.length,
        });
      }
      return results;
    },
  );
  const originalBytes = entries.reduce((sum, item) => sum + item.sourceBytes, 0);
  const encodedBytes = entries.reduce((sum, item) => sum + item.bytes, 0);
  const report = {
    format: 'WebP',
    quality: 95,
    encoder: 'Chrome canvas / libwebp',
    alpha: 'preserved',
    resized: false,
    originalBytes,
    encodedBytes,
    reductionPercent: Number((100 * (1 - encodedBytes / originalBytes)).toFixed(1)),
    entries,
  };
  await writeFile(path.join(assets, 'webp-manifest.json'), JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify({
      images: entries.length,
      originalBytes,
      encodedBytes,
      reductionPercent: report.reductionPercent,
      quality: 95,
    }),
  );
} finally {
  await new Promise(resolve => server.close(resolve));
}
