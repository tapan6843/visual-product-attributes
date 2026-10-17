// Captures the "before" state of 10 public KORA by NM (koranm.com) product listings
// into static JSON files under data/demo/koranm/before/.
//
// Sources per product: the Shopify product feed (/products.json) and the rendered
// product page (features table, size chart, featured model, schema.org JSON-LD, price).
//
// Usage: node scripts/demo/capture-koranm.mjs

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const STORE = "https://koranm.com";
const MARKET = "/en-us";
const OUT_DIR = path.resolve("data/demo/koranm/before");
const USER_AGENT = "Mozilla/5.0 (hackathon demo capture)";

// Fixed demo set: one product per garment type, plus a second bandi shirt.
export const DEMO_HANDLES = [
  "natural-fawn-linen-hand-embroidered-bandi-shirt-with-chinese-collar-1",
  "dark-fawn-rose-embroidery-bandi-shirt-for-men",
  "ak-2870-fkemb-3416-black",
  "ak-2869-fkemb-3417-b-green",
  "ark-11536-faemb-909-cream",
  "cream-matka-silk-jodhpuri-set-aditya-roy-kapur-collection",
  "purple-rayon-silk-sherwani-with-dupatta-aligarhi-pant",
  "pink-satin-linen-printed-embroidered-kurta-set-with-off-white-plazo-pants",
  "yellow-silk-kurta-multi-tone-chevron-embroidered-bandi-jacket-cream-aligarhi-set",
  "cobalt-blue-embroidered-tuxedo-set"
];

async function fetchText(url) {
  const response = await fetch(url, { headers: { "user-agent": USER_AGENT } });
  if (!response.ok) {
    throw new Error(`GET ${url} failed with ${response.status}`);
  }
  return response.text();
}

function decodeEntities(text) {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

function stripTags(html) {
  return decodeEntities(html.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, ""))
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*/g, "\n")
    .trim();
}

// Descriptions mix <p>, <div class="ewa-rteLine"> and <li> markup, so split on any block boundary.
function htmlToParagraphs(html) {
  return decodeEntities(
    html
      .replace(/<br\s*[^>]*>/gi, "\n")
      .replace(/<\/?(p|div|li|ul|ol|h[1-6])[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, "")
  )
    .split("\n")
    .map((line) => line.replace(/[\s\u00a0]+/g, " ").trim())
    .filter(Boolean);
}

// "Label: value" lines from the description (Key Features / Styling Tips blocks).
function parseLabelledLines(paragraphs) {
  const sections = {};
  let current = "intro";
  for (const line of paragraphs) {
    const labelled = line.match(/^([A-Za-z &/]{2,30}):\s*(.+)$/);
    if (!labelled) {
      if (line.length < 40) {
        current = line.toLowerCase().replace(/[^a-z]+/g, "_").replace(/^_|_$/g, "");
        sections[current] ??= {};
      } else {
        sections.intro ??= { text: [] };
        sections.intro.text = [...(sections.intro.text ?? []), line];
      }
      continue;
    }
    sections[current] ??= {};
    sections[current][labelled[1].trim()] = labelled[2].trim();
  }
  return sections;
}

function parseFeatures(html) {
  return Object.fromEntries(
    [...html.matchAll(
      /feature-item__label">([\s\S]*?)<\/span>\s*<span class="feature-item__value">([\s\S]*?)<\/span>/g
    )].map((match) => [stripTags(match[1]), stripTags(match[2])])
  );
}

function parseSizeChart(html) {
  const guideStart = html.indexOf("Size Guide");
  if (guideStart === -1) return null;
  const tableMatch = html.slice(guideStart).match(/<table>([\s\S]*?)<\/table>/);
  if (!tableMatch) return null;

  const headers = [...tableMatch[1].matchAll(/<th>([\s\S]*?)<\/th>/g)].map((m) => stripTags(m[1]));
  const rows = [...tableMatch[1].matchAll(/<tr>([\s\S]*?)<\/tr>/g)]
    .map((row) => [...row[1].matchAll(/<td>([\s\S]*?)<\/td>/g)].map((m) => stripTags(m[1])))
    .filter((cells) => cells.length);

  const unitsShown = /data-unit="cm"|>\s*cm\s*</.test(html.slice(guideStart, guideStart + 6000));
  const footerMatch = html.slice(guideStart).match(/custom-size-guide-modal__footer-content">([\s\S]*?)<\/div>\s*<\/div>/);

  return {
    headers,
    rows,
    unit_as_published: "inches (unlabelled in table; page offers an in/cm toggle)",
    cm_toggle_present: unitsShown,
    notes: footerMatch ? stripTags(footerMatch[1]) : null,
    source: "product page size guide modal (HTML table)"
  };
}

function parseFeaturedModel(html) {
  const match = html.match(/class="kora-featured-model"[\s\S]*?<\/strong>([\s\S]*?)<\/div>/);
  return match ? stripTags(match[1]) : null;
}

function parsePagePrice(html) {
  const match = html.match(/data-price="(\d+)"[^>]*>\s*<span class=money>([^<]+)<\/span>/);
  if (!match) return null;
  return { amount: Number(match[1]) / 100, display: decodeEntities(match[2]).trim(), label: "MRP (Inclusive of all taxes)" };
}

function parseProductJsonLd(html) {
  const blocks = [...html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g)];
  const found = [];
  for (const block of blocks) {
    let data;
    let validJson = true;
    try {
      data = JSON.parse(block[1]);
    } catch {
      // Raw line breaks inside string values make the block invalid JSON; strict parsers reject it.
      validJson = false;
      try {
        data = JSON.parse(block[1].replace(/\r?\n/g, " "));
      } catch {
        continue;
      }
    }
    if (data["@type"] === "Product" || data["@type"] === "ProductGroup") found.push({ data, validJson });
  }
  return found.map(({ data, validJson }) => ({
    type: data["@type"],
    valid_json: validJson,
    fields_present: Object.keys(data).sort(),
    has_offers: Boolean(data.offers || data.hasVariant),
    has_material: "material" in data,
    has_size: "size" in data,
    has_color: "color" in data,
    has_aggregate_rating: "aggregateRating" in data,
    raw: data
  }));
}

function parseReviews(html) {
  if (/Be the first to write a review/.test(html)) return { count: 0, source: "product page review widget" };
  const match = html.match(/"reviewCount"\s*:\s*"?(\d+)/);
  return { count: match ? Number(match[1]) : null, source: "product page" };
}

function buildBefore(product, html, availabilityById, capturedAt, index) {
  const productUrl = `${STORE}${MARKET}/products/${product.handle}`;
  const paragraphs = htmlToParagraphs(product.body_html);
  const variantSizes = product.variants.map((variant) => variant.option2);

  return {
    demo_id: `koranm-${String(index + 1).padStart(2, "0")}`,
    captured_at: capturedAt,
    source: {
      brand_site: `${STORE}${MARKET}`,
      product_url: productUrl,
      feed_url: `${STORE}${MARKET}/products/${product.handle}.json`,
      availability_url: `${STORE}${MARKET}/products/${product.handle}.js`,
      capture_method: "Shopify product feed + raw product page HTML (no JavaScript rendering)"
    },
    product: {
      shopify_id: product.id,
      handle: product.handle,
      title: product.title,
      vendor: product.vendor,
      product_type: product.product_type,
      tags: product.tags,
      published_at: product.published_at,
      options: product.options.map((option) => ({ name: option.name, values: option.values }))
    },
    description: {
      html: product.body_html,
      text: paragraphs.join("\n"),
      parsed: parseLabelledLines(paragraphs)
    },
    page_features: parseFeatures(html),
    featured_model: parseFeaturedModel(html),
    size_chart: parseSizeChart(html),
    variants: product.variants.map((variant) => ({
      id: variant.id,
      sku: variant.sku,
      title: variant.title,
      color: variant.option1,
      size: variant.option2,
      material: variant.option3,
      available: availabilityById.get(variant.id) ?? null,
      price: Number(variant.price),
      compare_at_price: variant.compare_at_price ? Number(variant.compare_at_price) : null,
      currency: "INR",
      image_id: variant.featured_image?.id ?? null
    })),
    variant_sizes: [...new Set(variantSizes)],
    page_price: parsePagePrice(html),
    images: product.images.map((image) => ({
      id: `img-${image.position}`,
      shopify_image_id: image.id,
      position: image.position,
      src: image.src,
      alt: image.alt ?? null,
      width: image.width,
      height: image.height,
      variant_ids: image.variant_ids,
      local_path: `data/demo/koranm/images/${product.handle}/${String(image.position).padStart(2, "0")}.jpg`
    })),
    structured_data: parseProductJsonLd(html),
    reviews: parseReviews(html),
    policies: {
      return_policy_url: `${STORE}${MARKET}/policies/refund-policy`,
      shipping_policy_url: `${STORE}${MARKET}/policies/shipping-policy`,
      page_claims: ["World Wide Free Shipping"].filter((claim) => html.includes(claim)),
      disclaimer: /Slight colour variations are possible/.test(html)
        ? "Slight colour variations are possible due to photographic lighting or your monitor settings."
        : null
    }
  };
}

async function main() {
  const capturedAt = new Date().toISOString();
  await mkdir(OUT_DIR, { recursive: true });

  const index = [];
  for (const [position, handle] of DEMO_HANDLES.entries()) {
    const feed = JSON.parse(await fetchText(`${STORE}${MARKET}/products/${handle}.json`));
    const html = await fetchText(`${STORE}${MARKET}/products/${handle}`);
    // The .json feed omits stock status; the storefront .js endpoint carries it per variant.
    const storefront = JSON.parse(await fetchText(`${STORE}${MARKET}/products/${handle}.js`));
    const availabilityById = new Map(storefront.variants.map((variant) => [variant.id, variant.available]));
    const before = buildBefore(feed.product, html, availabilityById, capturedAt, position);
    const fileName = `${before.demo_id}-${handle}.json`;
    await writeFile(path.join(OUT_DIR, fileName), `${JSON.stringify(before, null, 2)}\n`);
    index.push({
      demo_id: before.demo_id,
      title: before.product.title,
      product_type: before.product.product_type,
      product_url: before.source.product_url,
      image_count: before.images.length,
      file: `before/${fileName}`
    });
    console.log(`captured ${before.demo_id} ${handle} (${before.images.length} images)`);
  }

  await writeFile(
    path.resolve("data/demo/koranm/before-index.json"),
    `${JSON.stringify({ captured_at: capturedAt, products: index }, null, 2)}\n`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
