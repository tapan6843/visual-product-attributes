# FitCheck video

A 2:51 draft, built around the end goal: **agents filter on what a listing says, so wrong or missing data means the right product is skipped or the wrong one is picked.** Every number in the script comes from the 10-product KORA demo set (`data/demo/koranm/`). No market statistics are used because none are sourced.

| File | What it is |
| --- | --- |
| `lines.json` | The script: voices, sections with on-screen notes, and every spoken line with its pause. Edit this, then rebuild. |
| `out/narration.m4a` | Draft two-voice narration (macOS `say`: Daniel narrator, Samantha agent). For pacing, not final audio. |
| `out/captions.srt` | Captions timed to the draft audio. |
| `out/timeline.json` | Start and end of every section and line, for the video editor. |

Rebuild the audio and captions after editing `lines.json`:

```bash
node scripts/video/build-narration.mjs
```

## Voice

- **Narrator:** low, unhurried, documentary. Falling endings, no hype words, pauses do the work. Draft voice: Daniel (en_GB) at 150 wpm.
- **Agent:** polite, flat, quick. It hedges before the fix and is precise after it. Draft voice: Samantha (en_US) at 180 wpm.
- For the final cut, record a human narrator, or download an Enhanced/Premium Apple voice (System Settings → Accessibility → Spoken Content → System voice → Manage Voices) and set `say_voice` in `lines.json`.

## Shot list (times from the draft audio)

| Time | Section | On screen | Source in the repo |
| --- | --- | --- | --- |
| 0:00–0:20 | Cold open | Chat window. Shopper types *"Wine sherwani with matching trousers, under ₹50,000."* The agent's reply types out as it speaks. | Product 07: listing says Purple, cream Aligarhi pant; photos show wine with matching trousers |
| 0:21–0:58 | Problem | One real conflict per line, both sources highlighted: 01 title "Fawn" / alt "Beige" / photo; 02 "Bandi Shirt" vs Includes "Nehru Jacket and Shirt"; 04 Material "Silk" vs description "Storm Nylon" | `before/koranm-01`, `-02`, `-04`; `images/natural-fawn-…/01.jpg` |
| 0:59–1:34 | Solution | FitCheck report: findings panel (two sources side by side), then `filter_facets` filling in, then merchant questions | `after/koranm-07` |
| 1:35–1:52 | Proof | Same chat as the cold open, answered from the improved data. Add the answer-check before/after table once step 5 has run. | `after/koranm-07` `filter_facets`, `fixes.description` |
| 1:54–2:15 | Scale | Grid of 10 product cards; counters 8/10, 5/10, 8/10; score bar 57 → 78 | `comparison.json` |
| 2:16–2:29 | Need | Plain text on black, line by line | — |
| 2:30–2:49 | Vision and close | FitCheck wordmark, then `scan_product(url)`. Music out before the last word. | — |

## Facts the script relies on

| Line | Fact | Where it comes from |
| --- | --- | --- |
| Cold open | Listing: Purple, cream trousers; photos: wine, matching trousers | `after/koranm-07` finding [photo] high, images 1, 2, 4, 6 |
| "fawn / beige / grey" | Title, image alt and photo disagree | `after/koranm-01` colour finding with photo evidence |
| "single shirt … jacket and a shirt" | Product type vs Includes; photo shows two garments | `after/koranm-01`, `-02` (resolved by photo) |
| "silk … nylon" | Material field vs description | `after/koranm-04` |
| "Eight disagreed…" | 8 of 10 have at least one medium or high contradiction | `comparison.json` |
| "Five couldn't agree on pieces" | Products 01, 02, 03, 08, 10 | `comparison.json` |
| "Eight had structured data a strict parser rejects" | Product JSON-LD invalid on 8 of 10 | `before/*.json` `structured_data[].valid_json` |
| "57 to 78" | Average rubric score before → after generated fixes | `comparison.json` (56.8 → 77.5) |

## Before final

- **Proof numbers:** the proof section has no answer-check numbers yet. Add a line like "Correct answers went from X of 5 to Y of 5" once step 5 runs. Don't make numbers up.
- **Brand logo:** the script says "a premium menswear brand", not the brand name. Blur the logo in screen captures.
- **Length:** the draft is 2:51. To hit about 2:30, trim the Need section or the second Problem example.
- **Proof answer:** the agent's improved answer withholds the trouser colour, because the brand hasn't confirmed it. That's deliberate: it shows FitCheck doesn't invent values.
