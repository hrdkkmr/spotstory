const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const imageInput = $('#imageInput');
const dropzone = $('#dropzone');
const previewImage = $('#previewImage');
const liveButton = $('#liveButton');
const liveConsent = $('#liveConsent');
const apiStatus = $('#apiStatus');
const liveHint = $('#liveHint');
const resultPanel = $('#resultPanel');
const toast = $('#toast');
let selectedImage = null;
let imageObjectUrl = null;
let apiReady = false;
let currentBrief = '';
let toastTimer = null;

const signalCopy = {
  new: { en: 'a new spot', hi: 'नया दाग़ / निशान' },
  changing: { en: 'a spot that is changing', hi: 'बदलता हुआ दाग़ / निशान' },
  different: { en: 'a spot that looks different from others', hi: 'बाकी से अलग दिखता दाग़ / निशान' },
  'itchy or tender': { en: 'itching or tenderness', hi: 'खुजली या छूने पर कोमलता' },
  'bleeding or crusting': { en: 'bleeding or crusting', hi: 'खून आना या पपड़ी बनना' },
  'not healing': { en: 'a spot that is not healing', hi: 'न भरने वाला घाव / दाग़' }
};

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 2600);
}

function setApiStatus(ready) {
  apiReady = ready;
  apiStatus.classList.toggle('live', ready);
  apiStatus.classList.toggle('demo', !ready);
  apiStatus.innerHTML = `<i></i><span>${ready ? 'Gemini server ready' : 'Sample mode ready'}</span>`;
  updateLiveState();
}

async function checkApiStatus() {
  try {
    const response = await fetch('/api/status', { cache: 'no-store' });
    const data = await response.json();
    setApiStatus(Boolean(data.configured));
  } catch {
    setApiStatus(false);
  }
}

function updateLiveState() {
  const hasConsent = liveConsent.checked;
  const hasImage = Boolean(selectedImage);
  liveButton.disabled = !(apiReady && hasImage && hasConsent);
  if (!apiReady) {
    liveHint.textContent = 'Live Gemini is off until a server-side key is configured. The sample case works without a key.';
  } else if (!hasImage) {
    liveHint.textContent = 'Add a non-identifying example image and confirm the consent note to run Gemini image notes.';
  } else if (!hasConsent) {
    liveHint.textContent = 'Confirm the consent note before sending this example image to Gemini.';
  } else {
    liveHint.textContent = 'Ready — only the re-encoded photo and output language are sent to Gemini. Your timeline stays in this browser.';
  }
}

function chooseImage(file) {
  if (!file) return;
  const allowed = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowed.includes(file.type)) {
    showToast('Choose a JPG, PNG, or WEBP image.');
    return;
  }
  if (file.size > 12 * 1024 * 1024) {
    showToast('That image is over 12 MB. Choose a smaller example.');
    return;
  }
  if (imageObjectUrl) URL.revokeObjectURL(imageObjectUrl);
  selectedImage = file;
  imageObjectUrl = URL.createObjectURL(file);
  previewImage.src = imageObjectUrl;
  $('#emptyPhoto').hidden = true;
  $('#photoPreview').hidden = false;
  $('#dropzone').classList.add('has-image');
  $('.preview-label').textContent = file.name === 'spotstory-synthetic-demo.jpg' ? 'SYNTHETIC EXAMPLE · NOT SENT YET' : 'LOCAL PREVIEW · NOT SENT YET';
  updateLiveState();
}

function removeImage(event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  selectedImage = null;
  if (imageObjectUrl) URL.revokeObjectURL(imageObjectUrl);
  imageObjectUrl = null;
  previewImage.removeAttribute('src');
  $('#photoPreview').hidden = true;
  $('#emptyPhoto').hidden = false;
  imageInput.value = '';
  updateLiveState();
}

async function createSyntheticImage() {
  const canvas = document.createElement('canvas');
  canvas.width = 960;
  canvas.height = 700;
  const ctx = canvas.getContext('2d');
  const base = ctx.createLinearGradient(0, 0, 960, 700);
  base.addColorStop(0, '#f2d7c2');
  base.addColorStop(.52, '#dfb49a');
  base.addColorStop(1, '#c88e76');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const glow = ctx.createRadialGradient(245, 165, 18, 430, 330, 540);
  glow.addColorStop(0, 'rgba(255,240,222,.54)');
  glow.addColorStop(1, 'rgba(255,240,222,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.shadowColor = 'rgba(66,39,31,.25)';
  ctx.shadowBlur = 22;
  ctx.fillStyle = '#60443a';
  ctx.beginPath();
  ctx.moveTo(460, 286);
  ctx.bezierCurveTo(505, 257, 557, 276, 566, 322);
  ctx.bezierCurveTo(581, 371, 547, 425, 499, 428);
  ctx.bezierCurveTo(450, 438, 405, 402, 410, 354);
  ctx.bezierCurveTo(409, 322, 427, 300, 460, 286);
  ctx.fill();
  ctx.restore();
  const edge = ctx.createRadialGradient(481, 352, 15, 481, 352, 79);
  edge.addColorStop(0, 'rgba(0,0,0,0)');
  edge.addColorStop(.74, 'rgba(0,0,0,0)');
  edge.addColorStop(1, 'rgba(67,43,36,.35)');
  ctx.fillStyle = edge;
  ctx.beginPath();
  ctx.ellipse(481, 352, 79, 91, .14, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(36,51,43,.65)';
  ctx.font = '600 19px system-ui, sans-serif';
  ctx.fillText('SYNTHETIC DEMO ART · NOT A CLINICAL IMAGE', 28, 665);
  const blob = await new Promise((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Could not create the synthetic image.')), 'image/jpeg', .9));
  chooseImage(new File([blob], 'spotstory-synthetic-demo.jpg', { type: 'image/jpeg', lastModified: Date.now() }));
  showToast('Synthetic test image loaded. It is not a clinical photo.');
}

$('#syntheticPhoto').addEventListener('click', () => {
  createSyntheticImage().catch((error) => showToast(error.message || 'Could not create the synthetic image.'));
});

imageInput.addEventListener('change', () => chooseImage(imageInput.files?.[0]));
dropzone.addEventListener('click', (event) => {
  if (event.target.closest('#removePhoto')) return;
  imageInput.click();
});
dropzone.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    imageInput.click();
  }
});
dropzone.addEventListener('dragover', (event) => {
  event.preventDefault();
  dropzone.classList.add('is-dragging');
});
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('is-dragging'));
dropzone.addEventListener('drop', (event) => {
  event.preventDefault();
  dropzone.classList.remove('is-dragging');
  chooseImage(event.dataTransfer?.files?.[0]);
});
$('#removePhoto').addEventListener('click', removeImage);
liveConsent.addEventListener('change', updateLiveState);
$('#extraNote').addEventListener('input', (event) => { $('#charCount').textContent = String(event.target.value.length); });

function currentStory() {
  return {
    area: $('#bodyArea').value,
    duration: $('#duration').value,
    signals: $$('input[name="signal"]:checked').map((input) => input.value),
    extra: $('#extraNote').value.trim(),
    language: $('#languageSelect').value
  };
}

function joinHuman(items, conjunction = 'and') {
  if (!items.length) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} ${conjunction} ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, ${conjunction} ${items.at(-1)}`;
}

function buildVisitNote(story) {
  const isHindi = story.language === 'Hindi';
  const selected = story.signals.map((signal) => signalCopy[signal]?.[isHindi ? 'hi' : 'en']).filter(Boolean);
  if (isHindi) {
    const areaMap = {
      'a part of the body': 'शरीर के एक हिस्से',
      'Face or scalp': 'चेहरे या सिर की त्वचा',
      'Arm or hand': 'हाथ या बाँह',
      'Leg or foot': 'पैर या टांग',
      'Palm or sole': 'हथेली या तलवा',
      'Under or around a nail': 'नाखून के नीचे या आसपास',
      'Torso or back': 'धड़ या पीठ',
      'Other area': 'अन्य हिस्से',
      'Prefer not to say': 'बताने में सहज नहीं हूँ'
    };
    const durationMap = {
      'Choose a timeframe': 'मुझे इसकी शुरुआत का समय बताना है',
      'I noticed it recently': 'मैंने इसे हाल ही में देखा',
      'For a few weeks': 'मैंने इसे कुछ हफ्तों से देखा है',
      'For a few months': 'मैंने इसे कुछ महीनों से देखा है',
      'For more than a year': 'मैंने इसे एक साल से अधिक समय से देखा है',
      "I'm not sure when it started": 'मुझे इसकी शुरुआत का समय याद नहीं है'
    };
    const area = areaMap[story.area] || areaMap['a part of the body'];
    const duration = durationMap[story.duration] || durationMap["I'm not sure when it started"];
    const opening = story.area === 'Prefer not to say' ? 'मेरे शरीर पर एक निशान है, जिसके बारे में मैं स्वास्थ्यकर्मी से बात करना चाहता/चाहती हूँ।' : `मेरे ${area} पर एक निशान है, जिसके बारे में मैं स्वास्थ्यकर्मी से बात करना चाहता/चाहती हूँ।`;
    const lines = [opening, `${duration}।`];
    if (selected.length) lines.push(`मैंने यह देखा है: ${joinHuman(selected, 'और')}।`);
    else lines.push('मैंने अभी तक बदलाव या लक्षणों की जानकारी नहीं जोड़ी है।');
    if (story.extra) lines.push(`मेरी अतिरिक्त बात: “${story.extra}”`);
    lines.push('मैं चाहता/चाहती हूँ कि स्वास्थ्यकर्मी इसे देखकर सलाह दें।');
    return lines.join('\n');
  }
  const area = story.area === 'a part of the body' || story.area === 'Prefer not to say' ? 'a part of my body' : story.area.toLowerCase();
  const duration = story.duration === 'Choose a timeframe' ? 'I’m not sure when it started' : story.duration.toLowerCase();
  const lines = [`I would like a healthcare professional to look at a spot on my ${area}.`, `I have noticed it ${duration}.`];
  if (selected.length) lines.push(`I have noticed: ${joinHuman(selected)}.`);
  else lines.push('I have not added details about changes or symptoms yet.');
  if (story.extra) lines.push(`My note: “${story.extra}”`);
  return lines.join('\n');
}

function buildGuidance(story) {
  const isHindi = story.language === 'Hindi';
  if (story.signals.length) {
    if (isHindi) {
      return '<b>सामान्य जानकारी:</b> आपने ऊपर दिए गए बदलाव / लक्षण चुने हैं। American Cancer Society नए या बदलते दाग़ और खुजली, छूने पर दर्द या खून आने जैसे बदलावों को स्वास्थ्यकर्मी से चर्चा करने योग्य संकेत बताती है। यह जोखिम का आकलन नहीं है; यह ऐप बीमारी या तात्कालिकता तय नहीं कर सकता।';
    }
    return '<b>General information:</b> You selected a change or symptom above. The American Cancer Society lists new or changing spots and changes such as itch, tenderness, or bleeding among signs worth discussing with a healthcare professional. This is not a risk rating; this app cannot determine a diagnosis or urgency.';
  }
  if (isHindi) {
    return '<b>सामान्य जानकारी:</b> यहाँ कोई बदलाव / लक्षण नहीं चुना गया है। इससे किसी बीमारी की पुष्टि या उसे खारिज नहीं किया जा सकता। यदि दाग़ नया, बदलता हुआ, अलग दिखता है, या आपको चिंता है, तो स्वास्थ्यकर्मी से बात करें।';
  }
  return '<b>General information:</b> No change or symptom was selected here. That does not rule a condition in or out. If the spot is new, changing, unusual, or concerns you, speak with a qualified healthcare professional.';
}

function addVisualNote(text) {
  const li = document.createElement('li');
  li.textContent = text;
  $('#visualNotes').appendChild(li);
}

function makeBriefText(story, quality, observations, mode) {
  const label = mode === 'gemini' ? 'Gemini image note (not clinically validated)' : 'Sample case (illustrative only)';
  return [
    'SPOTSTORY — VISIT PREP NOTE',
    `Mode: ${label}`,
    '',
    'PHOTO NOTE',
    `Photo quality: ${quality}`,
    ...observations.map((line) => `• ${line}`),
    '',
    'MY STORY',
    buildVisitNote(story),
    '',
    'GENERAL GUIDANCE',
    story.signals.length ? 'The American Cancer Society lists new or changing spots and some skin changes among reasons to talk with a healthcare professional. This app cannot determine diagnosis or urgency.' : 'No change or symptom selected here rules nothing in or out. If the spot is new, changing, unusual, or concerns you, speak with a qualified healthcare professional.',
    '',
    'This AI prototype is not a diagnosis, screening, or triage tool. A photo cannot rule skin cancer in or out.'
  ].join('\n');
}

function renderResult({ mode, quality, observations, story = currentStory() }) {
  $('#resultMode').textContent = mode === 'gemini' ? 'LIVE GEMINI · NOT CLINICALLY VALIDATED' : 'SAMPLE BRIEF · STATIC DEMO';
  $('#photoNoteTag').textContent = mode === 'gemini' ? 'AI OBSERVATION' : 'ILLUSTRATIVE';
  $('#photoQuality').textContent = quality;
  const list = $('#visualNotes');
  list.replaceChildren();
  observations.forEach(addVisualNote);
  $('#visitNote').textContent = buildVisitNote(story);
  $('#generalGuidance').innerHTML = buildGuidance(story);
  $('#resultLimit').textContent = 'Gemini can misread details. Focus, lighting, camera processing, and missing scale can change what a photo appears to show.';
  currentBrief = makeBriefText(story, quality, observations, mode);
  resultPanel.hidden = false;
  resultPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function runSampleCase() {
  $('#bodyArea').value = 'Arm or hand';
  $('#duration').value = 'For a few months';
  $$('input[name="signal"]').forEach((input) => { input.checked = ['changing', 'itchy or tender'].includes(input.value); });
  $('#extraNote').value = 'I would like help keeping track of the changes.';
  $('#charCount').textContent = String($('#extraNote').value.length);
  const story = currentStory();
  const isHindi = story.language === 'Hindi';
  const observations = isHindi
    ? ['इस उदाहरण में किसी असली त्वचा की तस्वीर का विश्लेषण नहीं किया गया है।', 'यह नमूना सिर्फ़ यह दिखाता है कि आपकी बताई बातों को नोट में कैसे बदला जा सकता है।']
    : ['No real skin photo was analyzed in this sample.', 'This fictional example shows how your own reported details can be organized into a visit note.'];
  const quality = isHindi ? 'नमूना उदाहरण — तस्वीर का विश्लेषण नहीं हुआ' : 'Sample only — no image analyzed';
  renderResult({ mode: 'demo', quality, observations, story });
}

async function imageToJpegBase64(file) {
  const bitmap = await createImageBitmap(file);
  const maxSide = 1280;
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  const blob = await new Promise((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Could not resize the photo.')), 'image/jpeg', 0.84));
  if (blob.size > 5 * 1024 * 1024) throw new Error('The resized photo is too large. Please choose a smaller image.');
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read the photo.'));
    reader.readAsDataURL(blob);
  });
  return { imageData: String(dataUrl).split(',')[1], mimeType: 'image/jpeg' };
}

async function runGemini() {
  if (!apiReady || !selectedImage || !liveConsent.checked) return;
  const originalLabel = liveButton.innerHTML;
  liveButton.disabled = true;
  liveButton.textContent = 'Preparing a private image note…';
  try {
    const image = await imageToJpegBase64(selectedImage);
    liveButton.textContent = 'Asking Gemini…';
    const response = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({ ...image, language: $('#languageSelect').value })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || 'Gemini could not process this image. Try again or use the sample case.');
    if (!Array.isArray(data.observations) || !data.observations.length) throw new Error('No safe visual note was returned. Use the sample case or try a clearer example.');
    renderResult({ mode: 'gemini', quality: data.quality || 'Limited — visual details may be unreliable', observations: data.observations });
  } catch (error) {
    showToast(error.message || 'Something went wrong. Try the sample case.');
  } finally {
    liveButton.innerHTML = originalLabel;
    updateLiveState();
  }
}

$('#demoButton').addEventListener('click', runSampleCase);
$('#heroDemo').addEventListener('click', runSampleCase);
liveButton.addEventListener('click', runGemini);
$('#closeResult').addEventListener('click', () => { resultPanel.hidden = true; $('#workspace').scrollIntoView({ behavior: 'smooth', block: 'start' }); });

$('#copyBrief').addEventListener('click', async () => {
  if (!currentBrief) return;
  try {
    await navigator.clipboard.writeText(currentBrief);
    showToast('Visit note copied. You can edit it before sharing.');
  } catch {
    showToast('Copy was blocked by this browser. Use Download .txt instead.');
  }
});
$('#downloadBrief').addEventListener('click', () => {
  if (!currentBrief) return;
  const blob = new Blob([currentBrief], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'spotstory-visit-note.txt';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

const menuToggle = $('#menuToggle');
menuToggle.addEventListener('click', () => {
  const expanded = menuToggle.getAttribute('aria-expanded') === 'true';
  menuToggle.setAttribute('aria-expanded', String(!expanded));
  $('.main-nav').classList.toggle('is-open', !expanded);
});
$$('.main-nav a').forEach((link) => link.addEventListener('click', () => {
  $('.main-nav').classList.remove('is-open');
  menuToggle.setAttribute('aria-expanded', 'false');
}));

checkApiStatus();
