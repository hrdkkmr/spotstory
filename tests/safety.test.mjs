import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeGeminiResult, sanitizeModelText, validateImagePayload } from '../lib/safety.mjs';

function fakeJpeg(size = 64) {
  const bytes = Buffer.alloc(size);
  bytes.set([0xff, 0xd8, 0xff]);
  return bytes.toString('base64');
}

test('keeps concise neutral photo notes and strips markup/control characters', () => {
  const clean = sanitizeModelText('  <b>Dark brown oval</b>\u0000 in the centre  ');
  assert.ok(clean);
  assert.ok(!clean.includes('<'));
  assert.ok(!clean.includes('>'));
  assert.ok(!/[\u0000-\u001f]/.test(clean));
  assert.match(clean, /Dark brown oval/);
});

test('blocks diagnosis, reassurance, and risk language in English and Hindi', () => {
  assert.equal(sanitizeModelText('This spot looks benign.'), '');
  assert.equal(sanitizeModelText('This could be melanoma.'), '');
  assert.equal(sanitizeModelText('No concerning feature is visible.'), '');
  assert.equal(sanitizeModelText('यह कैंसर हो सकता है।'), '');
  assert.equal(sanitizeModelText('इसमें चिंता की बात नहीं है।'), '');
  assert.equal(sanitizeModelText('यह सुरक्षित है।'), '');
});

test('limits Gemini response to three safe notes and a supported quality value', () => {
  const result = sanitizeGeminiResult({
    photo_quality: 'Usable for a basic visual note',
    visual_observations: [
      'A dark oval shape appears near the centre.',
      'It might be suspicious.',
      'The image has a warm brown background.',
      'An extra visual note.',
      'One more visual note is beyond the cap.'
    ]
  });
  assert.equal(result.quality, 'Usable for a basic visual note');
  assert.equal(result.observations.length, 3);
  assert.deepEqual(result.observations, [
    'A dark oval shape appears near the centre.',
    'The image has a warm brown background.',
    'An extra visual note.'
  ]);
});

test('uses a neutral fallback when all model observations are unsafe', () => {
  const result = sanitizeGeminiResult({
    photo_quality: 'malignant and dangerous',
    visual_observations: ['This is cancer.', 'Looks normal.']
  }, 'English');
  assert.equal(result.quality, 'Limited by focus, lighting, or scale');
  assert.equal(result.observations.length, 1);
  assert.match(result.observations[0], /could not be prepared/);
});

test('localizes the image-quality label for Hindi without changing the schema', () => {
  const result = sanitizeGeminiResult({
    photo_quality: 'Not assessable from this photo',
    visual_observations: ['तस्वीर में एक गहरा अंडाकार आकार दिखता है।']
  }, 'Hindi');
  assert.equal(result.quality, 'इस तस्वीर से स्पष्ट रूप से नहीं बताया जा सकता');
  assert.equal(result.observations.length, 1);
});

test('accepts valid JPEG bytes and rejects an unsupported or spoofed image', () => {
  const imageData = fakeJpeg();
  const valid = validateImagePayload({ mimeType: 'image/jpeg', imageData });
  assert.equal(valid.ok, true);
  assert.equal(valid.mimeType, 'image/jpeg');
  assert.equal(validateImagePayload({ mimeType: 'image/gif', imageData }).ok, false);
  assert.equal(validateImagePayload({ mimeType: 'image/png', imageData }).ok, false);
});

test('rejects malformed and oversized image payloads', () => {
  assert.equal(validateImagePayload({ mimeType: 'image/jpeg', imageData: 'not valid base64'.repeat(4) }).ok, false);
  const imageData = fakeJpeg(128);
  assert.equal(validateImagePayload({ mimeType: 'image/jpeg', imageData, maxBytes: 50 }).status, 413);
  assert.equal(validateImagePayload({ mimeType: 'image/jpeg', imageData, maxBase64Chars: 40 }).status, 413);
});
