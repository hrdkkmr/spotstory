import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const serverFile = path.join(root, 'server.mjs');
let appProcess;
let mockGemini;
let appUrl;
let mockUrl;
let capturedRequest;

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve(`http://127.0.0.1:${server.address().port}`);
    });
  });
}

before(async () => {
  mockGemini = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    capturedRequest = {
      method: req.method,
      url: req.url,
      apiKeyHeader: req.headers['x-goog-api-key'],
      body: JSON.parse(Buffer.concat(chunks).toString('utf8'))
    };
    const response = {
      candidates: [{ content: { parts: [{ text: JSON.stringify({
        photo_quality: 'Usable for a basic visual note',
        visual_observations: [
          'A dark oval shape appears near the centre.',
          'This looks benign and harmless.'
        ]
      }) }] } }]
    };
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(response));
  });
  mockUrl = await listen(mockGemini);

  appProcess = spawn(process.execPath, [serverFile], {
    cwd: root,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: '0',
      GEMINI_API_KEY: 'unit-test-key-not-a-real-credential',
      GEMINI_MODEL: 'gemini-3.5-flash',
      GEMINI_API_BASE_URL: mockUrl
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const lines = createInterface({ input: appProcess.stdout });
  appUrl = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Proxy test server did not start in time.')), 6000);
    timeout.unref?.();
    lines.on('line', (line) => {
      const match = line.match(/http:\/\/0\.0\.0\.0:(\d+)/);
      if (!match) return;
      clearTimeout(timeout);
      resolve(`http://127.0.0.1:${match[1]}`);
    });
    appProcess.once('error', (error) => { clearTimeout(timeout); reject(error); });
    appProcess.once('exit', (code) => {
      if (!appUrl) {
        clearTimeout(timeout);
        reject(new Error(`Proxy test server exited before startup (code ${code}).`));
      }
    });
  });
});

after(() => {
  if (appProcess && !appProcess.killed) appProcess.kill('SIGTERM');
  if (mockGemini?.listening) mockGemini.close();
});

test('proxy sends the image to a loopback Gemini stub and filters an unsafe model claim', async () => {
  const jpegBytes = Buffer.alloc(96);
  jpegBytes.set([0xff, 0xd8, 0xff]);
  const imageData = jpegBytes.toString('base64');
  const response = await fetch(`${appUrl}/api/analyze`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ imageData, mimeType: 'image/jpeg', language: 'English' })
  });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.mode, 'gemini');
  assert.equal(result.model, 'gemini-3.5-flash');
  assert.deepEqual(result.observations, ['A dark oval shape appears near the centre.']);
  assert.equal(result.quality, 'Usable for a basic visual note');
  assert.equal(result.apiKey, undefined);
  assert.equal(JSON.stringify(result).includes('unit-test-key-not-a-real-credential'), false);

  assert.equal(capturedRequest.method, 'POST');
  assert.equal(capturedRequest.url, '/v1beta/models/gemini-3.5-flash:generateContent');
  assert.equal(capturedRequest.apiKeyHeader, 'unit-test-key-not-a-real-credential');
  const sentParts = capturedRequest.body.contents[0].parts;
  assert.equal(sentParts.some((part) => part.inlineData?.mimeType === 'image/jpeg'), true);
  assert.equal(JSON.stringify(capturedRequest.body).includes('timeline'), false);
  assert.equal(JSON.stringify(capturedRequest.body).includes('itchy'), false);
});
