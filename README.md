# Visual Product Attributes

Hackathon prototype that converts clothing SKU images into structured visual attributes, confidence scores, evidence references, and a grounded product description.

## Quick start

```bash
cp .env.example .env.local
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Mock extraction is enabled by default. To use the live extraction adapter, add an OpenAI API key to `.env.local` and set `USE_MOCK_EXTRACTION=false`.

## Commands

```bash
npm test
npm run build
npm run dev
```

## Documentation

- `documents/plan.md` — MVP scope and decisions
- `documents/implementation.md` — implementation design
- `documents/taskTacker.md` — hackathon task tracker
