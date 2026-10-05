import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSystemInstruction, buildUserPrompt, sanitizeGeminiResult, validateImagePayload } from './lib/safety.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicRoot = path.join(__dirname, 'public');
loadLocalEnv(path.join(__dirname, '.env.local'));

function loadLocalEnv(filePath) {
  try {
    const text = fs.readFileSync(filePath, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (!match || Object.hasOwn(process.env, match[1])) continue;
      let value = match[2];
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
      process.env[match[1]] = value;
    }
  } catch { /* Optional local secret file. */ }
}

const API_KEY = (process.env.GEMINI_API_KEY || '').trim();
// Model routing: always call the v1beta REST surface and drop a duplicated "models/" prefix.
const cleanModel = (process.env.GEMINI_MODEL || 'gemini-2.0-flash').trim().replace(/^models\//, '');
const MODEL = cleanModel;
const PORT = Number(process.env.PORT || 4173);
function getGeminiBaseUrl() {
  if (process.env.NODE_ENV === 'test' && process.env.GEMINI_API_BASE_URL) {
    try {
      const candidate = new URL(process.env.GEMINI_API_BASE_URL);
      if (candidate.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(candidate.hostname)) return candidate.origin;
    } catch { /* Fall through to the production endpoint. */ }
  }
  return 'https://generativelanguage.googleapis.com';
}
const GEMINI_BASE_URL = getGeminiBaseUrl();
const MAX_JSON_BYTES = 7 * 1024 * 1024;
const requestsByAddress = new Map();

function redactSecret(value) {
  const text = String(value || '');
  return API_KEY ? text.split(API_KEY).join('[redacted]') : text;
}

function extractUpstreamError(bodyText) {
  try {
    const parsed = JSON.parse(bodyText);
    const message = parsed?.error?.message;
    if (typeof message === 'string' && message.trim()) return redactSecret(message.trim().slice(0, 400));
  } catch { /* Not a JSON error body; fall through to the raw text. */ }
  return redactSecret(String(bodyText || '').trim().slice(0, 400));
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store, max-age=0',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer'
  });
  res.end(payload);
}

function sendText(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, {
    'Content-Type': type,
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer'
  });
  res.end(body);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let bytes = 0;
    let failed = false;
    req.on('data', (chunk) => {
      if (failed) return;
      bytes += chunk.length;
      if (bytes > MAX_JSON_BYTES) {
        failed = true;
        chunks.length = 0;
        reject(Object.assign(new Error('Request is too large.'), { status: 413 }));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(Object.assign(new Error('Invalid request body.'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

function rateLimitOk(address) {
  const now = Date.now();
  const entry = requestsByAddress.get(address) || { start: now, count: 0 };
  if (now - entry.start > 60_000) {
    entry.start = now;
    entry.count = 0;
  }
  entry.count += 1;
  requestsByAddress.set(address, entry);
  return entry.count <= 12;
}

function parseModelJson(text) {
  const raw = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('The model did not return structured text.');
  return JSON.parse(raw.slice(start, end + 1));
}

async function analyzeImage(req, res) {
  if (!API_KEY) {
    return sendJson(res, 503, { code: 'GEMINI_KEY_MISSING', message: 'Live Gemini is not configured. Add a fresh key to .env.local on the server, then restart.' });
  }
  const remoteAddress = req.socket.remoteAddress || 'unknown';
  if (!rateLimitOk(remoteAddress)) {
    return sendJson(res, 429, { code: 'RATE_LIMIT', message: 'Demo request limit reached. Wait a minute and try again.' });
  }
  let input;
  try { input = await readJson(req); }
  catch (error) { return sendJson(res, error.status || 400, { message: error.message || 'Invalid request.' }); }

  const imageData = typeof input.imageData === 'string' ? input.imageData : '';
  const mimeType = typeof input.mimeType === 'string' ? input.mimeType.toLowerCase() : '';
  const language = input.language === 'Hindi' ? 'Hindi' : 'English';
  const imageValidation = validateImagePayload({ mimeType, imageData });
  if (!imageValidation.ok) return sendJson(res, imageValidation.status, { message: imageValidation.message });

  const url = `${GEMINI_BASE_URL}/v1beta/models/${encodeURIComponent(cleanModel)}:generateContent`;
  const payload = {
    systemInstruction: { parts: [{ text: buildSystemInstruction(language) }] },
    contents: [{
      role: 'user',
      parts: [
        { text: buildUserPrompt(language) },
        { inlineData: { mimeType, data: imageData } }
      ]
    }],
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.2
    }
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': API_KEY },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    const bodyText = await response.text().catch(() => '');
    if (!response.ok) {
      const upstreamStatus = response.status;
      const detail = extractUpstreamError(bodyText);
      console.error(`Gemini API returned HTTP ${upstreamStatus}.`);
      console.error('Request URL was:', url);
      console.error('Raw Google response:', bodyText);
      const message = detail
        ? `Gemini API error (HTTP ${upstreamStatus}): ${detail}`
        : `Gemini API returned HTTP ${upstreamStatus} with no error detail. Check the server key and model access.`;
      return sendJson(res, upstreamStatus === 429 ? 429 : 502, {
        code: upstreamStatus === 429 ? 'GEMINI_QUOTA' : 'GEMINI_REQUEST_FAILED',
        upstreamStatus,
        message,
        detail: message
      });
    }
    let data;
    try { data = JSON.parse(bodyText); }
    catch { throw new Error('Gemini returned a non-JSON response body.'); }
    const text = data?.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') || '';
    const parsed = parseModelJson(text);
    const { quality, observations, dossier } = sanitizeGeminiResult(parsed, language);
    return sendJson(res, 200, { mode: 'gemini', model: cleanModel, quality, observations, dossier });
  } catch (error) {
    if (error.name === 'AbortError') return sendJson(res, 504, { message: 'Gemini took too long to respond. Please try again.' });
    console.error('Gemini request failed:', error.message);
    return sendJson(res, 502, { message: redactSecret(`Gemini is temporarily unavailable (${error.message}). Try again or use the sample case.`) });
  } finally {
    clearTimeout(timeout);
  }
}

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon'
};

async function serveStatic(req, res, pathname) {
  let decoded;
  try { decoded = decodeURIComponent(pathname); }
  catch { return sendText(res, 400, 'Bad URL'); }
  const relative = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  const fullPath = path.resolve(publicRoot, relative);
  if (!fullPath.startsWith(publicRoot + path.sep)) return sendText(res, 403, 'Forbidden');
  try {
    const stat = await fs.promises.stat(fullPath);
    if (!stat.isFile()) return sendText(res, 404, 'Not found');
    const content = await fs.promises.readFile(fullPath);
    res.writeHead(200, {
      'Content-Type': contentTypes[path.extname(fullPath)] || 'application/octet-stream',
      'Content-Length': content.length,
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer'
    });
    res.end(content);
  } catch {
    return sendText(res, 404, 'Not found');
  }
}

const server = http.createServer(async (req, res) => {
  const host = req.headers.host || 'localhost';
  let url;
  try { url = new URL(req.url || '/', `http://${host}`); }
  catch { return sendText(res, 400, 'Bad URL'); }
  if (url.pathname === '/api/status' && req.method === 'GET') {
    return sendJson(res, 200, { configured: Boolean(API_KEY), model: MODEL, storage: 'none' });
  }
  if (url.pathname === '/api/analyze' && req.method === 'POST') return analyzeImage(req, res);
  if (url.pathname.startsWith('/api/')) return sendJson(res, 404, { message: 'Not found.' });
  if (!['GET', 'HEAD'].includes(req.method)) return sendText(res, 405, 'Method not allowed');
  return serveStatic(req, res, url.pathname);
});

server.listen(PORT, '0.0.0.0', () => {
  const actualPort = server.address()?.port || PORT;
  console.log(`SpotStory is running on http://0.0.0.0:${actualPort}`);
  console.log(`Gemini live mode: ${API_KEY ? `configured (${MODEL})` : 'off — add GEMINI_API_KEY to .env.local'}`);
});
