# KORA by NM demo set

Ten public product listings from [koranm.com](https://koranm.com/en-us), captured as static files for the before/after demo. No database.

| File | What it holds |
| --- | --- |
| `before/<id>-<handle>.json` | The listing as published: product link, title, description (HTML, text, parsed), page features table, size chart, featured model, variants with SKU/price/stock, every image (URL, alt, size, local path), schema.org blocks, reviews, policy links |
| `after/<id>-<handle>.json` | Score before/after, findings with both sources side by side, attributes with confidence tier and source, merchant questions, generated fixes (description, size chart in in + cm, JSON-LD, alt text), pending image checks, and a field-by-field comparison |
| `before-index.json` | The 10 products and their before files |
| `comparison.json` | One row per product: scores, contradictions, question count, both file paths |
| `images/<handle>/NN.jpg` | Downloaded product photos for the vision step (git-ignored; brand assets) |

## Regenerate

```bash
npm run demo:capture   # re-fetch the 10 listings into before/
npm run demo:after     # rebuild after/ and comparison.json from before/
npm run demo:images    # download images to images/ (skips files already present)
```

## Tiers

- `stated`: on the page as text or a structured field
- `inferred`: on the page but likely a template (for example the featured model line); merchant to confirm
- `contradicted`: two page sources disagree; held out of generated copy
- `pending_vision`: to be read from the photos by the image step
- `not_determinable`: never generated; becomes a merchant question

The after files use text and structured data only. Photo checks (colour vs name, fit, length, care-label OCR) are listed under `image_processing.checks` and run once the vision step exists.
