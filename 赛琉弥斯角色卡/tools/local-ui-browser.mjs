import { spawn } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

// Local rendering/encoding utility. It never attaches to the user's browser or chat.
export async function withLocalUiBrowser(outputDirectory, task) {
  const output = path.resolve(outputDirectory);
  if (!output.startsWith(workspace + path.sep)) throw new Error('Browser output must stay in the workspace');
  await mkdir(output, { recursive: true });
  const candidates = [
    process.env.TREASURE_UI_CHROME,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  ].filter(Boolean);
  let executable;
  for (const candidate of candidates) {
    try {
      await access(candidate);
      executable = candidate;
      break;
    } catch {}
  }
  if (!executable) throw new Error('Chrome is required; set TREASURE_UI_CHROME to its executable');
  const profile = await mkdtemp(path.join(output, 'browser-session-'));
  const chrome = spawn(
    executable,
    [
      '--headless=new',
      '--no-first-run',
      '--disable-extensions',
      '--no-default-browser-check',
      '--remote-debugging-port=0',
      `--user-data-dir=${profile}`,
      'about:blank',
    ],
    { windowsHide: true, stdio: 'ignore' },
  );
  let socket;
  try {
    let port;
    for (let n = 0; n < 100; n++) {
      try {
        port = (await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0];
        break;
      } catch {
        await pause(100);
      }
    }
    if (!port) throw new Error('Local Chrome did not start');
    const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    socket = new WebSocket(pages.find(page => page.type === 'page').webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', reject, { once: true });
    });
    let sequence = 0;
    const pending = new Map();
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      const entry = pending.get(message.id);
      if (entry) {
        pending.delete(message.id);
        message.error ? entry.reject(new Error(message.error.message)) : entry.resolve(message.result);
      }
    });
    const send = (method, params = {}) =>
      new Promise((resolve, reject) => {
        const id = ++sequence;
        pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params }));
      });
    const evaluate = async expression => {
      const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
      return result.result.value;
    };
    await send('Page.enable');
    await send('Runtime.enable');
    const result = await task({ send, evaluate, pause });
    await Promise.race([send('Browser.close').catch(() => {}), pause(500)]);
    return result;
  } finally {
    socket?.close();
    chrome.kill();
    await pause(700);
    if (profile.startsWith(output + path.sep) && path.basename(profile).startsWith('browser-session-')) {
      await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }).catch(error =>
        console.warn(`Temporary browser profile retained: ${error.code}`),
      );
    }
  }
}
