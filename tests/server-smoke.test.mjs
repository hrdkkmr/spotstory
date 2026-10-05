import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const serverFile = path.join(root, 'server.mjs');
let serverProcess;
let baseUrl;

before(async () => {
  serverProcess = spawn(process.execPath, [serverFile], {
    cwd: root,
    env: { ...process.env, PORT: '0', GEMINI_API_KEY: '', GEMINI_MODEL: 'gemini-3.5-flash' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const lines = createInterface({ input: serverProcess.stdout });
  baseUrl = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Smoke-test server did not start in time.')), 6000);
    timeout.unref?.();
    lines.on('line', (line) => {
      const match = line.match(/http:\/\/0\.0\.0\.0:(\d+)/);
      if (!match) return;
      clearTimeout(timeout);
      resolve(`http://127.0.0.1:${match[1]}`);
    });
    serverProcess.once('error', (error) => { clearTimeout(timeout); reject(error); });
    serverProcess.once('exit', (code) => {
      if (!baseUrl) {
        clearTimeout(timeout);
        reject(new Error(`Smoke-test server exited before startup (code ${code}).`));
      }
    });
  });
});

after(() => {
  if (serverProcess && !serverProcess.killed) serverProcess.kill('SIGTERM');
});

test('serves the prototype and reports live mode as off when no secret is set', async () => {
  const page = await fetch(`${baseUrl}/`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /SpotStory/);
  const status = await fetch(`${baseUrl}/api/status`);
  assert.equal(status.status, 200);
  assert.deepEqual(await status.json(), { configured: false, model: 'gemini-3.5-flash', storage: 'none' });
});

test('fails closed for a live request when no Gemini key is configured', async () => {
  const response = await fetch(`${baseUrl}/api/analyze`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ imageData: 'not-a-real-image', mimeType: 'image/jpeg', language: 'English' })
  });
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.code, 'GEMINI_KEY_MISSING');
  assert.doesNotMatch(JSON.stringify(body), /AIza|GEMINI_API_KEY=/);
});
