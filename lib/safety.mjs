const DISALLOWED_LANGUAGE = /\b(cancer|melanoma|carcinoma|tumou?r|benign|malignant|suspicious|diagnos(?:e|is|ed|tic)?|risk|probabilit(?:y|ies)|harmless|normal|urgent|urgency|treatment|cure|safe|dangerous|doctor|clinician|medical|lesion|reassur(?:e|ed|ing|ance)?|concern(?:ing)?|worrisome|okay|healthy|unlikely|fine|clear|all\s+clear)\b|कैंसर|मेलेनोमा|मेलानोमा|ट्यूमर|निदान|जोखिम|संभावना|आशंका|चिंता|सामान्य|स्वस्थ|हानिरहित|सौम्य|घातक|इलाज|उपचार|चिकित्सक|डॉक्टर|खतरनाक|सुरक्षित|बीमारी|रोग|जांच|जाँच/i;
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const QUALITY_OPTIONS = new Set([
  'Usable for a basic visual note',
  'Limited by focus, lighting, or scale',
  'Not assessable from this photo'
]);
const HINDI_QUALITY = {
  'Usable for a basic visual note': 'साधारण दृश्य नोट के लिए उपयोगी',
  'Limited by focus, lighting, or scale': 'फोकस, रोशनी या पैमाने के कारण सीमित',
  'Not assessable from this photo': 'इस तस्वीर से स्पष्ट रूप से नहीं बताया जा सकता'
};

// Structured, non-diagnostic ABCDE dossier schema returned by the model.
export const ABCDE_FIELDS = ['asymmetry', 'border', 'color', 'diameter_relative', 'evolution'];
export const URGENCY_LEVELS = ['Routine clinical review', 'Prompt specialist evaluation'];
const ABCDE_LABELS = {
  asymmetry: 'Asymmetry',
  border: 'Border',
  color: 'Color',
  diameter_relative: 'Diameter (relative)',
  evolution: 'Evolution'
};
const FALLBACK_DESCRIPTOR = 'Not assessable from this photo';
const HINDI_FALLBACK_DESCRIPTOR = 'इस तस्वीर से आकलन उपलब्ध नहीं है';
const FALLBACK_SUMMARY = 'No additional observation summary was returned for this photo.';
const HINDI_FALLBACK_SUMMARY = 'इस तस्वीर के लिए कोई अतिरिक्त सारांश नहीं मिला।';
const DEFAULT_RETAKE_PROMPT = 'Retake the photo with steady focus, even lighting, and the camera held parallel to the skin.';
const HINDI_RETAKE_PROMPT = 'फोकस, रोशनी और कोण ठीक करके तस्वीर दोबारा लें।';

export function sanitizeModelText(value, maxLength = 180) {
  if (typeof value !== 'string') return '';
  const clean = value.replace(/[<>\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!clean || DISALLOWED_LANGUAGE.test(clean)) return '';
  return clean.slice(0, maxLength).trim();
}

export function buildSystemInstruction(language = 'English') {
  return [
    'You are a constrained clinical-observation describer inside SpotStory, a non-diagnostic visit-preparation tool. You describe visible photographic features only.',
    'You NEVER name, spell out, or hint at a specific pathology or condition. Forbidden examples include melanoma, basal cell carcinoma, dysplastic nevus, and eczema, and the rule covers every disease name. You never diagnose, never reassure, never estimate risk or probability, and never recommend treatment or medication.',
    'Report only these structured ABCDE descriptors:',
    '- asymmetry: axis alignment and structural balance of the visible area.',
    '- border: definition, regularity, and notching of the edge.',
    '- color: shading, uniformity, and variegation.',
    '- diameter_relative: relative visual framing compared with nearby features. Never claim absolute millimetres or centimetres; the photo has no scale reference.',
    '- evolution: relative deltas across sequential photos, or the user-reported change when no earlier photo exists. If neither exists, state that evolution cannot be assessed from this photo.',
    '- urgency_level: exactly one allowed value, "Routine clinical review" or "Prompt specialist evaluation". It is a conversation-prioritisation hint for the patient, never a decision about care.',
    '- summary_notes: a professional, objective observation summary ready for physician review, in neutral descriptive language with no condition names.',
    'Edge cases: if the photo is blurry, occluded, poorly lit, or does not show skin, set quality_warning to true, keep every descriptor conservative, and put a short prompt to retake the photo into retake_prompt.',
    'Return only the requested JSON object. Output language: ' + language + '.'
  ].join(' ');
}

export function buildUserPrompt(language = 'English') {
  return 'Create a cautious, non-diagnostic ABCDE observation note from this photo. Fill every field with plain observational text, use relative wording instead of measurements, and set quality_warning to true with a retake prompt when focus, lighting, framing, occlusion, or non-skin content limits the observation. If nothing can be observed, say so plainly instead of guessing. Do not provide advice. Output language: ' + language + '.';
}

function sanitizeDescriptor(value, language) {
  return sanitizeModelText(value, 240) || (language === 'Hindi' ? HINDI_FALLBACK_DESCRIPTOR : FALLBACK_DESCRIPTOR);
}

export function sanitizeDossier(parsed, language = 'English') {
  if (!parsed || typeof parsed !== 'object') return null;
  const schemaKeys = [...ABCDE_FIELDS, 'urgency_level', 'summary_notes', 'quality_warning', 'retake_prompt'];
  if (!schemaKeys.some((key) => Object.hasOwn(parsed, key))) return null;
  const warningFlag = parsed.quality_warning === true || /^(true|yes|1)$/i.test(String(parsed.quality_warning ?? '').trim());
  const qualityUnusable = sanitizeModelText(parsed.photo_quality, 80) === 'Not assessable from this photo';
  const quality_warning = warningFlag || qualityUnusable;
  const urgencyRaw = String(parsed.urgency_level || '').trim();
  const urgency_level = URGENCY_LEVELS.includes(urgencyRaw) ? urgencyRaw : URGENCY_LEVELS[0];
  const summary_notes = sanitizeModelText(parsed.summary_notes, 420)
    || (language === 'Hindi' ? HINDI_FALLBACK_SUMMARY : FALLBACK_SUMMARY);
  const retake_prompt = quality_warning
    ? (sanitizeModelText(parsed.retake_prompt, 220) || (language === 'Hindi' ? HINDI_RETAKE_PROMPT : DEFAULT_RETAKE_PROMPT))
    : '';
  const descriptors = {};
  for (const field of ABCDE_FIELDS) descriptors[field] = sanitizeDescriptor(parsed[field], language);
  return { ...descriptors, urgency_level, summary_notes, quality_warning, retake_prompt };
}

function deriveAbcdeObservations(dossier) {
  return ABCDE_FIELDS
    .map((field) => (dossier[field] ? `${ABCDE_LABELS[field]}: ${dossier[field]}` : ''))
    .filter(Boolean)
    .map((line) => line.slice(0, 200));
}

export function sanitizeGeminiResult(parsed, language = 'English') {
  const dossier = sanitizeDossier(parsed, language);
  const qualityText = sanitizeModelText(parsed?.photo_quality, 80);
  let qualityEnglish = QUALITY_OPTIONS.has(qualityText) ? qualityText : null;
  let observations = Array.isArray(parsed?.visual_observations)
    ? parsed.visual_observations.map((item) => sanitizeModelText(item)).filter(Boolean).slice(0, 3)
    : [];
  if (dossier) {
    if (!qualityEnglish) qualityEnglish = dossier.quality_warning ? 'Limited by focus, lighting, or scale' : 'Usable for a basic visual note';
    if (!observations.length) observations = deriveAbcdeObservations(dossier).slice(0, 3);
  }
  if (!qualityEnglish) qualityEnglish = 'Limited by focus, lighting, or scale';
  const quality = language === 'Hindi' ? (HINDI_QUALITY[qualityEnglish] || qualityEnglish) : qualityEnglish;
  if (!observations.length) {
    observations.push(language === 'Hindi'
      ? 'इस तस्वीर से स्पष्ट, गैर-चिकित्सीय दृश्य नोट तैयार नहीं हो सका।'
      : 'A clear, non-clinical visual note could not be prepared from this photo.');
  }
  return { quality, observations, dossier };
}

function bytesMatchMime(bytes, mimeType) {
  if (mimeType === 'image/jpeg') return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mimeType === 'image/png') return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mimeType === 'image/webp') return bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  return false;
}

export function validateImagePayload({ mimeType, imageData, maxBase64Chars = 7_000_000, maxBytes = 5 * 1024 * 1024 } = {}) {
  if (typeof mimeType !== 'string' || !ALLOWED_MIME_TYPES.has(mimeType.toLowerCase())) {
    return { ok: false, status: 400, message: 'Choose a JPG, PNG, or WEBP example.' };
  }
  if (typeof imageData !== 'string' || imageData.length < 40 || !/^[A-Za-z0-9+/]+={0,2}$/.test(imageData)) {
    return { ok: false, status: 400, message: 'The image data is invalid. Choose a JPG, PNG, or WEBP example.' };
  }
  if (imageData.length > maxBase64Chars) {
    return { ok: false, status: 413, message: 'The encoded image is too large.' };
  }
  const imageBytes = Buffer.from(imageData, 'base64');
  const canonical = imageBytes.toString('base64').replace(/=+$/, '');
  if (canonical !== imageData.replace(/=+$/, '')) {
    return { ok: false, status: 400, message: 'The image data is malformed.' };
  }
  if (imageBytes.length > maxBytes) {
    return { ok: false, status: 413, message: 'The resized image is too large.' };
  }
  if (!bytesMatchMime(imageBytes, mimeType.toLowerCase())) {
    return { ok: false, status: 400, message: 'The file contents do not match the selected image format.' };
  }
  return { ok: true, buffer: imageBytes, mimeType: mimeType.toLowerCase() };
}
