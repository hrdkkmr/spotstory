# Submission deck

`SpotStory_Hackdays2O.pptx` is a 7-slide, editable PowerPoint deck built over the supplied Hackdays 2.O PDF template pages 1–7. The template's final “To Be Kept In Mind” page was excluded as requested by the template itself. Team name and participant names remain fill-in placeholders because they were not provided.

The deck matches the original 11 × 8.5 inch page size and retains HackBase / MLH template branding. Replace the cover placeholders with the exact Unstop team name and real member names before submission. The prototype is honestly marked not clinically validated.

To regenerate the deck, install `python-pptx` and `PyMuPDF` and run:

```bash
python scripts/build_deck.py
```

`template_source.pdf` is the source template retrieved from the shared folder; `template_pages/` are its background renders used in the deck.
