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

test('sanitizes the ABCDE dossier, blocks pathology names, and clamps urgency to the triage enum', () => {
  const result = sanitizeGeminiResult({
    asymmetry: 'The vertical and horizontal axes are not aligned.',
    border: 'Mostly defined with a small notch on the lower edge.',
    color: 'Mid-brown shading with a darker upper region.',
    diameter_relative: 'Occupies a small portion of the frame relative to surrounding skin.',
    evolution: 'No earlier photo; the user reports gradual change.',
    urgency_level: 'Emergency surgery now',
    summary_notes: 'This is melanoma and it looks benign.',
    quality_warning: true,
    retake_prompt: 'Retake with steady focus and even lighting.'
  }, 'English');
  assert.ok(result.dossier);
  assert.equal(result.dossier.urgency_level, 'Routine clinical review');
  assert.equal(result.dossier.quality_warning, true);
  assert.equal(result.dossier.asymmetry, 'The vertical and horizontal axes are not aligned.');
  assert.ok(!result.dossier.summary_notes.includes('melanoma'));
  assert.ok(!result.dossier.summary_notes.includes('benign'));
  assert.match(result.dossier.retake_prompt, /Retake/);
  assert.equal(result.quality, 'Limited by focus, lighting, or scale');
  assert.ok(result.observations.length > 0);
});

test('keeps a valid triage label and derives quality/observations from ABCDE-only output', () => {
  const result = sanitizeGeminiResult({
    asymmetry: 'Roughly balanced across both axes.',
    border: 'Well defined and evenly rounded.',
    color: 'One consistent shade throughout.',
    diameter_relative: 'Comparable in scale to nearby features.',
    evolution: 'No earlier photo is available for comparison.',
    urgency_level: 'Prompt specialist evaluation',
    summary_notes: 'Objective descriptors prepared for physician review.',
    quality_warning: false
  }, 'English');
  assert.equal(result.dossier.urgency_level, 'Prompt specialist evaluation');
  assert.equal(result.dossier.quality_warning, false);
  assert.equal(result.dossier.retake_prompt, '');
  assert.equal(result.quality, 'Usable for a basic visual note');
  assert.equal(result.observations.length, 3);
  assert.equal(sanitizeGeminiResult({ photo_quality: 'Usable for a basic visual note' }).dossier, null);
});
