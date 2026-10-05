# SpotStory — Hackdays 2.O prototype

**A human-first, Gemini-powered skin-change visit-prep demo.** SpotStory uses Gemini image understanding only for neutral visual observations. It does not detect, diagnose, screen, triage, or estimate cancer risk.

## Run it

Requirements: Node.js 18.18+.

```bash
npm start
```

Open `http://localhost:4173`. No dependency install is required; the app uses Node's built-in HTTP server and `fetch`.

The **sample case works without a key** and is explicitly marked illustrative/static. It does not upload an image or make a Gemini request. For a live API demonstration after adding a fresh key, use **Create a synthetic image for live testing**; it generates abstract demo art locally and is not a clinical photo.

Run the built-in safety/input test suite with:

```bash
npm test
```

The ten tests check English/Hindi clinical-language filtering, neutral fallbacks, strict image MIME/signature validation, payload limits, HTTP smoke behavior, fail-closed key handling, and the Gemini proxy against a local test stub (no real key or external API call).

## Turn on live Gemini image notes

1. **Revoke the key that was previously pasted into chat.** Create a new key in Google AI Studio and restrict it to the Gemini / Generative Language API where possible.
2. Copy `.env.example` to `.env.local`.
3. Add the replacement key to `.env.local`:

   ```text
   GEMINI_API_KEY=your-new-key-here
   GEMINI_MODEL=gemini-3.5-flash
   PORT=4173
   ```

4. Restart `npm start`. The header should say **Gemini server ready**.
5. Click **Create a synthetic image for live testing**, check the live-analysis consent box, and run the photo note. It is generated locally and does not depict a patient. Do not use real patient or personal health photos.

The key is read only by `server.mjs`; it is never sent to browser code. `.env.local` is ignored by Git. Do not place a key in `public/`, `app.js`, a URL, screenshots, or a presentation. Set suitable quota/billing alerts.

## What data moves where

- The selected photo is previewed locally and only sent after the user opts into live analysis.
- The browser resizes/re-encodes it and sends only the image and output language to `/api/analyze`.
- The user's timeline, selected symptoms, and optional text are **not** sent to Gemini. The visit note is composed in the browser from those values.
- The Node server does not write the photo or request body to disk and sends the Gemini key in a server-to-server header.
- Gemini processes the live API request under Google's current API terms. Review those terms and applicable privacy/health-data requirements before any real personal or patient information is used.

## Demo talk track

> “Some photo-check apps return risk indications, while others focus on tracking. SpotStory tests a different handoff: Gemini is constrained to neutral visual notes, the person supplies the timeline, and the browser assembles a concise visit note. The timeline is not sent to the model. No cancer score or app database is part of the prototype.”

Show the sample case first (it works offline). If the team has added a new key server-side, switch to live mode with a synthetic image and explain the API request. Be transparent that the model output is not clinically validated.

## Project files

- `public/` — responsive prototype UI and local-only story builder
- `server.mjs` — same-origin Gemini proxy, input validation, rate limiting
- `lib/safety.mjs` — shared response filter and image-signature validator
- `tests/` — ten Node built-in unit, proxy-stub, and server smoke tests
- `research.md` — evidence summary, safety decisions, evaluation plan, citations
- `competitor_scan.md` — rapid market scan and honest differentiation hypothesis
- `pitch/SpotStory_Hackdays2O.pptx` — 7-slide deck in the event's supplied template style
- `pitch_notes.md` — pitch outline and submission reminders

## Safety / scope

This is an educational hackathon demo, not a medical device or a substitute for professional care. It cannot rule out a condition. Do not use it for real patients, diagnosis, screening, or treatment decisions. Any real-world use would need qualified clinical leadership, privacy/security review, representative validation, human-factors testing, and appropriate regulatory assessment.
