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

export function sanitizeModelText(value, maxLength = 180) {
  if (typeof value !== 'string') return '';
  const clean = value.replace(/[<>\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!clean || DISALLOWED_LANGUAGE.test(clean)) return '';
  return clean.slice(0, maxLength).trim();
}

export function sanitizeGeminiResult(parsed, language = 'English') {
  const qualityText = sanitizeModelText(parsed?.photo_quality, 80);
  const qualityEnglish = QUALITY_OPTIONS.has(qualityText)
    ? qualityText
    : 'Limited by focus, lighting, or scale';
  const quality = language === 'Hindi' ? HINDI_QUALITY[qualityEnglish] : qualityEnglish;
  const observations = Array.isArray(parsed?.visual_observations)
    ? parsed.visual_observations.map((item) => sanitizeModelText(item)).filter(Boolean).slice(0, 3)
    : [];
  if (!observations.length) {
    observations.push(language === 'Hindi'
      ? 'इस तस्वीर से स्पष्ट, गैर-चिकित्सीय दृश्य नोट तैयार नहीं हो सका।'
      : 'A clear, non-clinical visual note could not be prepared from this photo.');
  }
  return { quality, observations };
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
