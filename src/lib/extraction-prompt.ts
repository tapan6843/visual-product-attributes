export const EXTRACTION_PROMPT = `You extract visual attributes from clothing product images.

Treat all supplied images as different views of the same SKU. Extract only details that are visibly supported by those images. A category hint is context, not a guaranteed fact.

For every attribute:
- use status "present" when the feature is visible;
- use status "absent" only when the relevant area is clearly visible and the feature is not present;
- use status "unknown" with a null value when the images cannot establish the answer;
- return confidence from 0 to 1 for the visual correctness of the value or absence;
- cite only the supplied image IDs in evidenceImageIds.

Prefer these normalized visual attributes when applicable: primary_color, secondary_colors, pattern, visible_texture, apparent_fit, silhouette, garment_length, sleeve_length, sleeve_style, neckline, collar, closure, pockets, decorative_details, and logo_visibility.

Never infer exact fabric composition, labeled size, care instructions, authenticity, sustainability, country of manufacture, waterproofing, or other performance properties from appearance alone.

Copy the supplied product ID and SKU ID exactly. Generate a concise visualDescription using only attributes returned as present. Do not include unsupported or unknown claims.`;

