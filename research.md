# SpotStory — research & prototype rationale

**Hackdays 2.O theme:** Best Use of Google Gemini API  
**Concept:** a Gemini-assisted skin-change documentation and clinician-conversation prep tool — not cancer detection, diagnosis, screening, or triage.

## Why we changed the framing

The original idea, “real-time cancer detection from a phone photo using Gemini,” is a poor safety and credibility fit for a one-day hackathon. A general-purpose multimodal model has not been validated here for clinical image classification; camera photos vary in lighting, focus, scale, skin tone, device processing, and lesion type. A wrong reassuring answer could delay care, while a false alarm can cause avoidable anxiety. A diagnostic claim would also require a fit-for-purpose clinical evaluation and appropriate regulatory/privacy review. The prototype therefore uses Gemini for the task it can demonstrate credibly: **neutral visual description and structured language generation**, never a cancer label or score.

The product is **SpotStory**: people record what *they* have noticed (body location, duration, change/symptoms) and, if they choose, ask Gemini to produce a cautious note of visible photo characteristics. The browser then combines only user-reported details into an editable visit-prep note. A small, fixed education layer points to public guidance; it does not infer a diagnosis or decide urgency.

## Research findings that shape the product

1. The American Cancer Society identifies a new spot or a change in size, shape, or colour as important melanoma warning signs; its ABCDE guide is a recognition aid, not a diagnosis. It also lists itch, tenderness, bleeding, and non-healing among signs worth discussing with a doctor. The app repeats this as general education and does not convert it to a risk score.
2. The American Academy of Dermatology notes skin cancer can occur in people of all skin tones and can be found in less expected locations such as palms, soles, and around or under nails. The intake includes these locations rather than assuming a sun-exposed area or lighter skin.
3. Google's Gemini API documentation supports image inputs and structured JSON outputs. The prototype asks Gemini to describe only visible colour/shape/contrast and photo limitations. Patient history is **not sent** to Gemini; the visit note is assembled locally from the user's own selections.
4. Google's key guidance says API keys are secrets and production client-side keys can be extracted; the prototype keeps `GEMINI_API_KEY` only on its Node server and sends it in a request header.
5. FDA material on generative-AI-enabled devices highlights the need for purpose-specific evaluation, risk controls, transparency, and lifecycle monitoring. This is a prototype, not a clinically validated device; any future patient-facing or clinician-facing diagnostic claims would need a separate, expert-led pathway.

## Workflow (what is actually built)

1. User can generate an abstract synthetic test image locally or select a non-identifying example; the photo remains a local preview until the user explicitly opts into live analysis.
2. The browser re-encodes and downscales it to a JPEG. This also strips most image metadata.
3. The user confirms a consent checkbox. The browser sends **only the photo and requested output language** to the same-origin Node endpoint. The reported timeline stays in the browser.
4. The server checks file type/size, enforces a small demo rate limit, and sends the image to Gemini using a server-only environment variable.
5. Gemini returns constrained JSON: photo quality plus at most three neutral visual observations. A server-side safety filter drops fields containing diagnostic, disease, risk, reassurance, or treatment language.
6. The browser produces an editable visit-prep note from the user's selected facts. Static copy gives context and the same limitation every time; no model decides next steps.
7. There is no application database and no image file is written to disk. Live Gemini requests are still processed by Google under its applicable API terms; do not use real patient/personal health photos in this hackathon demo.

## Safety boundaries

- Never output a cancer/condition label, probability, “benign,” “normal,” or “all clear.”
- Never infer symptoms or history from pixels.
- No automated urgency level, treatment recommendation, or emergency triage.
- “No sign selected” is never presented as reassurance.
- A clear phone image is not sufficient to rule a condition in or out.
- The sample workflow is clearly labelled synthetic/static; it does not call Gemini and does not use a patient image.
- Before real-world testing: dermatologist and patient co-design; risk analysis; consent/privacy review; usability evaluation; image quality/fairness study across skin tones, sites, cameras, and conditions; prospective validation; regulatory assessment; monitored deployment; and an explicit clinical oversight plan.

## Evaluation plan for a future research build

Use a dermatologist-reviewed, consented, de-identified dataset with a pre-registered protocol. Evaluate **descriptive accuracy** (not diagnostic accuracy), omission and hallucination rates, inter-run consistency, photo-quality calibration, performance across skin tone/site/camera subsets, and whether people understand the output is not a diagnosis. Test worst-case prompts and low-quality images. Have clinicians grade whether generated visit notes faithfully reflect patient input. No clinical use until qualified experts and the appropriate review pathway approve it.

## References

- American Cancer Society, “Signs and Symptoms of Melanoma Skin Cancer”: https://www.cancer.org/cancer/types/melanoma-skin-cancer/detection-diagnosis-staging/signs-and-symptoms.html
- American Academy of Dermatology, “Finding skin cancer in darker skin tones”: https://www.aad.org/public/diseases/skin-cancer/darker-skin-tones
- Google AI for Developers, “Image understanding”: https://ai.google.dev/gemini-api/docs/image-understanding
- Google AI for Developers, “Using Gemini API keys”: https://ai.google.dev/gemini-api/docs/api-key
- U.S. FDA, “Total Product Lifecycle Considerations for Generative AI”: https://www.fda.gov/media/182871/download

*Prepared for a hackathon prototype; not medical advice or clinical validation. Research references were checked 5 October 2026.*
