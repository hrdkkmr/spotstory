# SpotStory — pitch notes

## 30-second opener

“People notice a skin change but often struggle to describe how long it has been there, what changed, and what they want a clinician to check. We built SpotStory: Gemini helps create a neutral photo note, the person supplies the timeline, and the product turns those exact facts into a visit-prep summary. We intentionally do not ask Gemini whether it is cancer.”

## 2-minute demo sequence

1. Explain the safety stance first: this is a communication tool, not a cancer detector.
2. Click **Explore a sample case**. It is a static illustrative example; no photo is analyzed and no API call is made.
3. Show that the timeline comes from user-selected facts, not inferred symptoms.
4. Explain the live path: optional synthetic image → browser resizing → server-only Gemini key → constrained JSON visual note → static rules / local handoff.
5. Show the source references and privacy boundary. State clearly if live Gemini was not enabled for the presentation.

## Judges' likely questions

**Why not predict cancer?**  
A general-purpose Gemini model is not validated as a skin-cancer classifier. A misleading “all clear” could delay care. We chose a safe, useful task: photo description and visit preparation.

**What is the best use of Gemini?**  
Multimodal input plus structured output: convert an image into bounded, understandable visual observations while noting image limitations. The user's story remains local; the model is constrained and filtered, but the output still needs human review and is not clinically validated.

**Is the idea unique?**  
Do not claim “first” or category-level uniqueness. Miiskin already offers photo tracking/body mapping and explicitly says it does not diagnose; SkinVision offers photo-based risk indications. Our differentiation hypothesis is narrower: a Gemini visual note plus a user-authored, locally assembled clinician brief, without a cancer-risk label. The public feature scan is in `competitor_scan.md`.

**What is innovative?**  
We separate perception from decision: Gemini describes; people report their timeline; a deterministic safety layer displays sourced educational context; the clinician stays in charge. This is a positioning hypothesis to validate, not a proven moat.

**What is built vs. planned?**  
Built: responsive UI, static sample flow, synthetic live-test image generator, server-side Gemini proxy, image resizing/signature checks, strict JSON output, conservative response filter, ten automated safety, HTTP-smoke, and stub-proxy tests, local visit-note builder, and privacy disclosures. Not live-tested with a replacement API key yet. Planned: clinician co-design, multilingual usability research, representative validation, privacy/regulatory review, and any real-world pilot.

## Submission checks

- Replace `[TEAM NAME — exact Unstop name]` and member placeholders on slide 1.
- Verify the newest organizer deadline and upload requirements; the supplied announcement and the linked guidelines PDF show different submission times.
- Keep the statement “not clinically validated” visible in the deck and demo.
- Use only a synthetic/non-identifying sample image. Never include an exposed API key in slides or source.
- Test live Gemini only after rotating the exposed key and adding the replacement to local `.env.local`.
