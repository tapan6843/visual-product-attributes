// Sends a captured demo product's images to the app's /api/extract endpoint (the
// OpenAI vision adapter) and saves the response to data/demo/koranm/vision/.
//
// The dev server must be running (npm run dev). With USE_MOCK_EXTRACTION=true the
// endpoint returns canned mock data; set it to false and add OPENAI_API_KEY for a real run.
//
// Usage: node scripts/demo/extract-product.mjs <demo_id> [--images 1,3] [--base http://localhost:3000]
//   e.g. node scripts/demo/extract-product.mjs koranm-01 --images 1

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve("data/demo/koranm");
const MAX_IMAGES = 5; // ExtractionRequestSchema accepts one to five images.

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function main() {
  const demoId = process.argv[2];
  if (!demoId || demoId.startsWith("--")) {
    throw new Error("Usage: node scripts/demo/extract-product.mjs <demo_id> [--images 1,3]");
  }
  const base = argument("--base") ?? "http://localhost:3000";
  const positions = argument("--images")?.split(",").map(Number);

  const fileName = (await readdir(path.join(ROOT, "before"))).find((name) => name.startsWith(`${demoId}-`));
  if (!fileName) throw new Error(`No before file for ${demoId}`);
  const before = JSON.parse(await readFile(path.join(ROOT, "before", fileName), "utf8"));

  const images = before.images
    .filter((image) => !positions || positions.includes(image.position))
    .slice(0, MAX_IMAGES)
    .map((image) => ({ id: image.id, url: image.src, view: "unknown" }));

  const request = {
    productId: String(before.product.shopify_id),
    skuId: before.page_features["Design No"] ?? before.product.handle,
    categoryHint: before.product.product_type.toLowerCase(),
    images
  };

  const response = await fetch(`${base}/api/extract`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request)
  });
  const body = await response.json();

  const outDir = path.join(ROOT, "vision");
  await mkdir(outDir, { recursive: true });
  const record = {
    demo_id: demoId,
    product_url: before.source.product_url,
    requested_at: new Date().toISOString(),
    mode: process.env.USE_MOCK_EXTRACTION === "false" ? "live" : "as configured on the server (check .env.local)",
    http_status: response.status,
    request,
    response: body
  };
  const outFile = path.join(outDir, `${demoId}${positions ? `-img${positions.join("_")}` : ""}.json`);
  await writeFile(outFile, `${JSON.stringify(record, null, 2)}\n`);

  console.log(`HTTP ${response.status} -> ${path.relative(process.cwd(), outFile)}`);
  if (!response.ok) {
    console.log(JSON.stringify(body, null, 2));
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
