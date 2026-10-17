# Implementation Guide

## Architecture

```text
Next.js page
    ↓ POST /api/extract
Request validation with Zod
    ↓
Visual extraction adapter
    ↓
Schema-validated result
    ↓
Attribute table + description + JSON
```

## Main modules

- `src/lib/product-schema.ts`: request and response contracts
- `src/lib/mock-extraction.ts`: deterministic demo response
- `src/lib/extract-attributes.ts`: model-adapter boundary
- `src/app/api/extract/route.ts`: HTTP validation and error mapping
- `src/app/page.tsx`: hackathon showcase UI

## Real model adapter

Implement `extractVisualAttributes` with the OpenAI Responses API:

1. Add one instruction block describing the visual-only extraction rules.
2. Add one `input_image` entry for each submitted image URL.
3. Include the image ID and declared view before its corresponding image.
4. Request strict JSON-schema output matching `ExtractionResultSchema`.
5. Parse and validate the returned JSON before returning it to the route.

The model must not claim exact fabric composition, size, care instructions, authenticity, sustainability, or performance properties from appearance alone.

## Error behavior

- Invalid request: HTTP 400
- Unsupported or inaccessible image: HTTP 422
- Incomplete model response: HTTP 502
- Extraction service failure: HTTP 502

Do not return stack traces or API keys to the client.

## Test strategy

Follow red-green-refactor:

1. Schema tests for valid and invalid requests and results.
2. Mocked adapter tests confirming every image is passed to the model.
3. Route tests for validation and service errors.
4. Production build verification.

Use a ten-item manual evaluation set covering common clothing categories. Record expected category, color, pattern, sleeves, and neckline or collar.

## Environment

```text
OPENAI_API_KEY=
OPENAI_MODEL=gpt-6-astra
USE_MOCK_EXTRACTION=true
```

Mock mode keeps the UI demonstrable before the live adapter is completed.

