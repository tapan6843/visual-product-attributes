// Downloads every image listed in data/demo/koranm/before/*.json to its `local_path`,
// so the vision/OCR step can run on local copies. Images are brand assets: the
// target folder is git-ignored and must not be committed.
//
// Usage: node scripts/demo/download-images.mjs [--force]

import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const BEFORE_DIR = path.resolve("data/demo/koranm/before");
const force = process.argv.includes("--force");

async function exists(filePath) {
  try {
    return (await stat(filePath)).size > 0;
  } catch {
    return false;
  }
}

async function main() {
  const files = (await readdir(BEFORE_DIR)).filter((name) => name.endsWith(".json")).sort();
  let downloaded = 0;
  let skipped = 0;

  for (const name of files) {
    const before = JSON.parse(await readFile(path.join(BEFORE_DIR, name), "utf8"));
    for (const image of before.images) {
      const target = path.resolve(image.local_path);
      if (!force && (await exists(target))) {
        skipped += 1;
        continue;
      }
      // Shopify's CDN serves a resized JPEG when asked; 1200px wide is enough for vision and OCR.
      const url = new URL(image.src);
      url.searchParams.set("width", "1200");
      url.searchParams.set("format", "pjpg");
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`GET ${url} failed with ${response.status} (${before.demo_id} ${image.id})`);
      }
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, Buffer.from(await response.arrayBuffer()));
      downloaded += 1;
    }
    console.log(`${before.demo_id}: ${before.images.length} images`);
  }
  console.log(`downloaded ${downloaded}, already present ${skipped}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
