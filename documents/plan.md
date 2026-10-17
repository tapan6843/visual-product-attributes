# Visual Product Attributes — Hackathon Plan

## Objective

Given one or more images for a clothing SKU, return normalized visual attributes, a confidence score for each attribute, image-level evidence, and a concise description grounded only in visible details.

## Input

- Product ID
- SKU ID
- Optional clothing category hint
- One to five image URLs
- Optional view label for each image: front, back, side, detail, or unknown

## Output

- Clothing category and category confidence
- Visual attributes with value, status, confidence, and evidence image IDs
- Distinctive visible features
- Grounded visual description

Confidence is a number from 0 to 1 representing the estimated likelihood that an attribute value is visually correct.

Attribute status is one of:

- `present`: the image supports the attribute
- `absent`: the relevant area is visible and the feature is not present
- `unknown`: the images cannot establish the answer

## Initial attribute taxonomy

- Primary and secondary colors
- Pattern
- Visible texture
- Apparent fit
- Silhouette
- Garment length
- Sleeve length and style
- Neckline
- Collar
- Closure
- Pockets
- Decorative details
- Logo visibility

## Success criteria

- Every successful response validates against the output schema.
- Multiple views are analyzed as one SKU.
- Clearly visible category, color, pattern, sleeve, and neckline attributes are accurate on the demo set.
- Unsupported claims are returned as unknown rather than invented.
- The description uses only extracted visible attributes.
- The UI displays images, attributes, confidence, evidence, description, and raw JSON.

## Explicitly out of scope

- Million-item batch infrastructure
- Human review queues
- Confidence calibration
- Similarity search and embeddings
- Shopping-agent ranking
- Fine-tuning
- Vendor authentication
- Inventory, price, and sizing extraction

## Demo

1. Load a prepared clothing SKU.
2. Submit its front, back, and detail images.
3. Show the generated visual description.
4. Show attribute confidence and evidence image IDs.
5. Open and copy the structured JSON result.
6. Repeat with a visually different SKU.

