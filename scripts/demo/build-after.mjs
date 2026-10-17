// Builds the "after" file for every captured "before" listing under data/demo/koranm/.
//
// The after file holds: findings (contradictions, gaps, data-quality issues) with both
// sources side by side, extracted attributes with a confidence tier and source, generated
// fixes (rewritten description, labelled size chart, valid JSON-LD, alt text), merchant
// questions, a rubric score before/after, and a field-by-field comparison.
//
// Text and structured data only: image-derived checks are listed as pending until the
// vision step runs over the downloaded images.
//
// Usage: node scripts/demo/build-after.mjs

import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve("data/demo/koranm");
const BEFORE_DIR = path.join(ROOT, "before");
const AFTER_DIR = path.join(ROOT, "after");

const FABRIC_FAMILIES = ["silk", "linen", "cotton", "rayon", "nylon", "polyester", "matka", "satin", "velvet", "viscose", "tr"];
const COLOR_WORDS = ["fawn", "beige", "black", "green", "cream", "purple", "pink", "yellow", "blue", "white", "off white", "navy", "maroon", "red", "grey", "gold", "ivory", "brown"];
const FIT_WORDS = ["slim", "regular", "tailored", "relaxed", "straight", "loose", "oversized"];
const COLLAR_WORDS = ["chinese collar", "mandarin collar", "mandarin-collar", "bandhgala", "bandgala", "lapel", "nehru collar"];
const LENGTH_WORDS = ["above-knee", "above knee", "knee-length", "medium-length", "above-length", "long", "short kurta"];
const NUMBER_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };

const lower = (value) => (value ?? "").toLowerCase();
const wordsIn = (text, vocabulary) =>
  vocabulary.filter((word) => new RegExp(`(^|[^a-z])${word.replace(/[-/]/g, "[-/ ]?")}([^a-z]|$)`).test(lower(text)));

function fabricFamilies(text) {
  return wordsIn(text, FABRIC_FAMILIES).filter((family) => family !== "tr" || /\btr fabric\b/i.test(text));
}

function countIncludes(includes) {
  if (!includes) return null;
  return includes.split(/,|\band\b/i).map((part) => part.trim()).filter(Boolean).length;
}

function pieceCountClaims(text) {
  return [...lower(text).matchAll(/\b(one|two|three|four|five|six|\d)[- ]piece\b/g)].map((match) => ({
    phrase: match[0],
    count: NUMBER_WORDS[match[1]] ?? Number(match[1])
  }));
}

function chartColumn(chart, name) {
  if (!chart) return null;
  const index = chart.headers.findIndex((header) => header.toUpperCase() === name);
  if (index === -1) return null;
  return chart.rows.map((row) => ({ size: row[0], value: Number(row[index]) }));
}

function sizeRange(sizes) {
  const numeric = sizes.map(Number).filter((size) => !Number.isNaN(size)).sort((a, b) => a - b);
  return numeric.length ? `${numeric[0]}–${numeric[numeric.length - 1]}` : sizes.join(", ");
}

// ---------- findings ----------

function detectFindings(before, context) {
  const findings = [];
  const add = (finding) => findings.push({ id: `F${String(findings.length + 1).padStart(2, "0")}`, ...finding });
  const features = before.page_features;
  const description = before.description.text;
  const materialField = features.Material ?? before.product.options.find((option) => /material|fabric/i.test(option.name))?.values[0];

  // Fabric: structured field vs description vs image alt text.
  const fieldFamilies = fabricFamilies(materialField);
  const descriptionFamilies = fabricFamilies(description);
  const extraInDescription = descriptionFamilies.filter((family) => !fieldFamilies.includes(family));
  if (extraInDescription.length) {
    const noOverlap = !descriptionFamilies.some((family) => fieldFamilies.includes(family));
    add({
      kind: "contradiction",
      severity: noOverlap ? "high" : "low",
      field: "fabric",
      summary: noOverlap
        ? `Material field says "${materialField}" but the description names a different fabric (${extraInDescription.map((f) => (f === "tr" ? "TR fabric" : f)).join(", ")}).`
        : `Material field says "${materialField}" but the description adds "${extraInDescription.join(", ")}".`,
      evidence: [
        { source: "page_features.Material", value: materialField },
        { source: "description.text", value: description.split("\n").find((line) => fabricFamilies(line).some((f) => extraInDescription.includes(f))) }
      ],
      merchant_question: `What is the exact fiber composition (with %) of this ${before.product.product_type.toLowerCase()}: ${[materialField, ...extraInDescription].join(" or ")}?`
    });
  }
  const altFabrics = [...new Set(before.images.flatMap((image) => fabricFamilies(image.alt)))];
  // Alt text that repeats the product title is not a separate claim.
  const titleFamilies = fabricFamilies(before.product.title);
  const altExtra = altFabrics.filter((family) => !fieldFamilies.includes(family) && !titleFamilies.includes(family));
  if (altExtra.length) {
    const image = before.images.find((candidate) => fabricFamilies(candidate.alt).some((f) => altExtra.includes(f)));
    add({
      kind: "contradiction",
      severity: "medium",
      field: "fabric",
      summary: `Image alt text says "${altExtra.join(", ")}" but the material field says "${materialField}".`,
      evidence: [
        { source: `images[${image.id}].alt`, value: image.alt },
        { source: "page_features.Material", value: materialField }
      ],
      fix: { type: "alt_text", image_id: image.id }
    });
  }

  // Colour: title vs image alt text.
  const titleColors = wordsIn(before.product.title, COLOR_WORDS);
  for (const image of before.images) {
    const altColors = wordsIn(image.alt, COLOR_WORDS).filter((color) => !titleColors.includes(color));
    if (altColors.length && titleColors.length) {
      add({
        kind: "contradiction",
        severity: "medium",
        field: "color",
        summary: `Title calls the colour "${titleColors.join(" ")}" but image alt text calls it "${altColors.join(" ")}".`,
        evidence: [
          { source: "product.title", value: before.product.title },
          { source: `images[${image.id}].alt`, value: image.alt }
        ],
        fix: { type: "alt_text", image_id: image.id },
        pending_image_check: "Compare the photographed colour against both names."
      });
      break;
    }
  }

  // Piece count: "Set" field vs "Includes" list vs "N-piece" in the description.
  const setCount = Number(features.Set);
  const includesCount = countIncludes(features.Includes);
  if (setCount && includesCount && setCount !== includesCount) {
    add({
      kind: "contradiction",
      severity: "high",
      field: "pieces_included",
      summary: `"Set" says ${setCount} pieces but "Includes" lists ${includesCount} (${features.Includes}).`,
      evidence: [
        { source: "page_features.Set", value: features.Set },
        { source: "page_features.Includes", value: features.Includes }
      ],
      merchant_question: `How many pieces ship with this set, and what are they? The page lists ${setCount} pieces but names ${includesCount}.`
    });
  }
  for (const claim of pieceCountClaims(description)) {
    if (setCount && claim.count !== setCount) {
      add({
        kind: "contradiction",
        severity: "high",
        field: "pieces_included",
        summary: `Description says "${claim.phrase}" but "Set" says ${setCount} pieces (${features.Includes}).`,
        evidence: [
          { source: "description.text", value: description.split("\n").find((line) => lower(line).includes(claim.phrase)) },
          { source: "page_features.Set", value: features.Set },
          { source: "page_features.Includes", value: features.Includes }
        ],
        merchant_question: `Is this a ${claim.count}-piece or ${setCount}-piece set?`
      });
    }
  }
  if (/jacket/i.test(features.Includes ?? "") && !/jacket|bandi|nehru/i.test(description)) {
    add({
      kind: "contradiction",
      severity: "medium",
      field: "pieces_included",
      summary: `"Includes" lists a jacket but the description never mentions one.`,
      evidence: [
        { source: "page_features.Includes", value: features.Includes },
        { source: "description.text", value: description.split("\n")[0] }
      ],
      merchant_question: "Does this set include a jacket? The includes list says yes; the description does not mention it."
    });
  }
  if (/shirt$/i.test(before.product.product_type) && /jacket/i.test(features.Includes ?? "")) {
    add({
      kind: "contradiction",
      severity: "medium",
      field: "pieces_included",
      summary: `Sold as a single "${before.product.product_type}" but "Includes" lists "${features.Includes}" (Set: ${features.Set}).`,
      evidence: [
        { source: "product.product_type", value: before.product.product_type },
        { source: "page_features.Includes", value: features.Includes }
      ],
      merchant_question: "Is this one bandi shirt, or a Nehru jacket plus a shirt?"
    });
  }

  // Occasions: features list vs description wording.
  if (features.Occasions) {
    const listed = features.Occasions.split(/,|\band\b/i).map((part) => part.trim().toLowerCase()).filter(Boolean);
    const missingFromDescription = listed.filter((occasion) => !lower(description).includes(occasion.replace(/ wear$/, "")));
    if (missingFromDescription.length) {
      add({
        kind: "contradiction",
        severity: "low",
        field: "occasions",
        summary: `Occasions field lists "${missingFromDescription.join(", ")}" which the description never mentions.`,
        evidence: [
          { source: "page_features.Occasions", value: features.Occasions },
          { source: "description.text", value: description.split("\n").find((line) => /ideal|perfect|choice|attending/i.test(line)) ?? null }
        ],
        merchant_question: `Which occasions should AI recommend this for? The page lists both "${features.Occasions}" and the description's wording.`
      });
    }
  } else {
    add({ kind: "gap", severity: "low", field: "occasions", summary: "No structured occasions field.", evidence: [{ source: "page_features", value: Object.keys(features) }] });
  }

  // Size chart.
  if (!before.size_chart) {
    add({
      kind: "gap",
      severity: "high",
      field: "size_chart",
      summary: "No size chart on the page, so AI cannot answer measurement or fit questions.",
      evidence: [{ source: "size_chart", value: null }],
      merchant_question: "Please provide garment measurements (shoulder, chest, sleeve, kurta length, waist, hip) per size."
    });
  } else {
    const chartSizes = before.size_chart.rows.map((row) => row[0]);
    const notSold = chartSizes.filter((size) => !before.variant_sizes.includes(size));
    if (notSold.length) {
      add({
        kind: "contradiction",
        severity: "low",
        field: "size_range",
        summary: `Size chart lists sizes ${notSold.join(", ")} that are not sold for this product (sold: ${sizeRange(before.variant_sizes)}).`,
        evidence: [
          { source: "size_chart.rows", value: chartSizes },
          { source: "variants[].size", value: before.variant_sizes }
        ],
        fix: { type: "size_chart", note: "Generated size chart keeps only sold sizes." }
      });
    }
    add({
      kind: "data_quality",
      severity: "medium",
      field: "size_chart_units",
      summary: "Size chart values have no unit in the table; the page toggle defaults to inches.",
      evidence: [{ source: "size_chart.unit_as_published", value: before.size_chart.unit_as_published }],
      fix: { type: "size_chart", note: "Generated chart labels inches and adds centimetres (×2.54)." }
    });
    if (!chartColumn(before.size_chart, "LENGTH") && !chartColumn(before.size_chart, "KURTA LENGTH")) {
      add({
        kind: "gap",
        severity: "medium",
        field: "garment_length",
        summary: "Size chart has no garment length, so AI cannot say where the garment falls on the body.",
        evidence: [{ source: "size_chart.headers", value: before.size_chart.headers }],
        merchant_question: "What is the garment length per size?",
        pending_image_check: "Estimate where the hem falls on the model (inferred tier, merchant to confirm)."
      });
    }
  }

  // Fit type.
  if (!wordsIn(description, FIT_WORDS).length) {
    add({
      kind: "gap",
      severity: "medium",
      field: "fit_type",
      summary: "No fit type stated (slim, regular, relaxed).",
      evidence: [{ source: "description.text", value: null }],
      merchant_question: "Is the fit slim, regular or relaxed?",
      pending_image_check: "Infer fit from model photos (inferred tier, merchant to confirm)."
    });
  }

  // Composition percentages (skipped when the fabric contradiction already asks for them).
  if (!/\d+\s?%/.test(description) && !findings.some((f) => f.field === "fabric" && f.merchant_question)) {
    add({
      kind: "gap",
      severity: "medium",
      field: "fiber_composition_pct",
      summary: "No fiber composition percentages, so AI cannot answer stretch or blend questions.",
      evidence: [{ source: "page_features.Material", value: materialField }],
      merchant_question: "What is the fiber composition with percentages (including any lining)?"
    });
  }

  // Care.
  if (!features["Wash Care"]) {
    add({
      kind: "gap",
      severity: "high",
      field: "care",
      summary: "No care instructions on the page.",
      evidence: [{ source: "page_features", value: Object.keys(features) }],
      merchant_question: "What are the care instructions (dry clean only, hand wash, machine wash)?",
      pending_image_check: "OCR the care label if one is photographed."
    });
  }

  // Featured model.
  if (before.featured_model && context.modelTextCount > 1) {
    add({
      kind: "data_quality",
      severity: "medium",
      field: "model_size_worn",
      summary: `"Featured Model: ${before.featured_model}" appears on ${context.modelTextCount} of ${context.total} demo products, so it may be a site-wide template rather than this shoot.`,
      evidence: [{ source: "featured_model", value: before.featured_model }],
      merchant_question: "Is the model in these photos 6 ft and wearing size 40?"
    });
  }

  // Images.
  const missingAlt = before.images.filter((image) => !image.alt);
  if (missingAlt.length) {
    add({
      kind: "gap",
      severity: "medium",
      field: "image_alt_text",
      summary: `${missingAlt.length} of ${before.images.length} images have no alt text, so text-only agents get nothing from them.`,
      evidence: missingAlt.map((image) => ({ source: `images[${image.id}].alt`, value: null })),
      fix: { type: "alt_text", image_ids: missingAlt.map((image) => image.id) }
    });
  }

  // Structured data.
  const product = before.structured_data.find((block) => block.type === "Product");
  if (product && !product.valid_json) {
    add({
      kind: "data_quality",
      severity: "high",
      field: "structured_data",
      summary: "The schema.org Product block is invalid JSON (raw line breaks inside the description), so strict parsers drop it.",
      evidence: [{ source: "structured_data[Product].valid_json", value: false }],
      fix: { type: "json_ld" }
    });
  }
  const group = before.structured_data.find((block) => block.type === "ProductGroup");
  if (group && !group.has_material && !group.has_color) {
    add({
      kind: "gap",
      severity: "medium",
      field: "structured_data_attributes",
      summary: "Structured data has no material, colour or size fields, so agents must parse prose to find them.",
      evidence: [{ source: "structured_data[ProductGroup].fields_present", value: group.fields_present }],
      fix: { type: "json_ld" }
    });
  }

  // Returns.
  add({
    kind: "gap",
    severity: "medium",
    field: "returns",
    summary: "No return window or return shipping cost on the product page; only a generic policy link.",
    evidence: [{ source: "policies.return_policy_url", value: before.policies.return_policy_url }],
    merchant_question: "For US orders: how many days to return, and who pays return shipping?"
  });

  // Reviews.
  if (before.reviews.count === 0) {
    add({
      kind: "gap",
      severity: "low",
      field: "reviews",
      summary: "No customer reviews, so comfort and occasion claims have no shopper evidence.",
      evidence: [{ source: "reviews.count", value: 0 }]
    });
  }

  return findings;
}

// ---------- attributes ----------

function extractAttributes(before, findings) {
  const features = before.page_features;
  const description = before.description.text;
  const contradicted = new Set(findings.filter((f) => f.kind === "contradiction" && f.severity !== "low").map((f) => f.field));
  const attributes = [];
  const add = (name, value, tier, sources, note) =>
    attributes.push({ name, value, tier: contradicted.has(name) ? "contradicted" : tier, sources, ...(note ? { note } : {}) });

  add("garment_type", before.product.product_type, "stated", ["product.product_type"]);
  add("color", features.Colour ?? before.product.options[0]?.values[0], "stated", ["page_features.Colour", "product.options.Color"]);
  if (features["Bottom Color"]) add("bottom_color", features["Bottom Color"], "stated", ["page_features.Bottom Color"]);
  add("fabric", features.Material ?? null, "stated", ["page_features.Material"]);
  add("fiber_composition_pct", null, "not_determinable", [], "Never generated; merchant question.");
  add("care", features["Wash Care"] ?? null, features["Wash Care"] ? "stated" : "not_determinable", features["Wash Care"] ? ["page_features.Wash Care"] : []);
  add("closure", features["Closure Type"] ?? null, "stated", ["page_features.Closure Type"]);
  add("pattern", features.Pattern ?? null, "stated", ["page_features.Pattern"]);
  if (features["Work Type"]) add("work_type", features["Work Type"], "stated", ["page_features.Work Type"]);
  add("pieces_included", features.Includes ? `${features.Includes} (Set: ${features.Set})` : null, "stated", ["page_features.Includes", "page_features.Set"]);
  if (features["Bottom Type"]) add("bottom_type", features["Bottom Type"], "stated", ["page_features.Bottom Type"]);
  const collar = wordsIn(description, COLLAR_WORDS);
  add("collar", collar[0] ?? null, collar.length ? "stated" : "pending_vision", collar.length ? ["description.text"] : ["images"]);
  const fit = wordsIn(description, FIT_WORDS);
  add("fit_type", fit[0] ?? null, fit.length ? "stated" : "pending_vision", fit.length ? ["description.text"] : ["images"]);
  const length = wordsIn(description, LENGTH_WORDS);
  add("garment_length", length[0] ?? null, length.length ? "stated" : "pending_vision", length.length ? ["description.text"] : ["images"]);
  add("sleeve_length", /full sleeve/i.test(description) ? "full" : null, /full sleeve/i.test(description) ? "stated" : "pending_vision", /full sleeve/i.test(description) ? ["description.text"] : ["images"]);
  add("model_height_and_size_worn", before.featured_model, before.featured_model ? "inferred" : "not_determinable", ["featured_model"], "Same text on every demo product; merchant to confirm.");
  add("sizes_sold", before.variant_sizes, "stated", ["variants[].size"]);
  add("sizes_in_stock", before.variants.filter((v) => v.available).map((v) => v.size), "stated", ["variants[].available"]);
  add("occasions", features.Occasions ?? null, features.Occasions ? "stated" : "not_determinable", ["page_features.Occasions"]);
  add("price", { amount: before.page_price?.amount ?? before.variants[0].price, currency: "INR", label: before.page_price?.label }, "stated", ["page_price", "variants[].price"]);
  return attributes;
}

// ---------- fixes ----------

function buildSizeChart(before) {
  if (!before.size_chart) return null;
  const rows = before.size_chart.rows.filter((row) => before.variant_sizes.includes(row[0]));
  const measureHeaders = before.size_chart.headers.slice(1).map((header) => header.toLowerCase());
  return {
    unit: "in",
    unit_tier: "inferred",
    unit_note: "Table is unlabelled; page toggle defaults to inches. Merchant to confirm.",
    basis: "Garment measurements; fitting ease already included (per page note).",
    headers: ["size", ...measureHeaders.map((h) => `${h}_in`), ...measureHeaders.map((h) => `${h}_cm`)],
    rows: rows.map((row) => [
      row[0],
      ...row.slice(1).map(Number),
      ...row.slice(1).map((value) => Math.round(Number(value) * 2.54 * 10) / 10)
    ]),
    sources: ["size_chart.rows", "size_chart.notes"]
  };
}

function buildDescription(before, findings) {
  const f = before.page_features;
  const has = (field, severities = ["high", "medium"]) =>
    findings.some((finding) => finding.field === field && finding.kind === "contradiction" && severities.includes(finding.severity));
  const sentences = [];
  const say = (text, sources) => text && sentences.push({ text, sources });

  say(`${before.product.title}.`, ["product.title"]);
  if (has("pieces_included")) {
    say(`Pieces included: to be confirmed by the merchant (the page lists "${f.Includes}" and Set: ${f.Set}).`, ["page_features.Includes", "page_features.Set"]);
  } else if (f.Includes) {
    say(`This ${f.Set}-piece set includes: ${f.Includes.replace(/\s+,/g, ",")}.`, ["page_features.Includes", "page_features.Set"]);
  }
  if (has("fabric")) {
    say(`Fabric: to be confirmed by the merchant (the page names more than one fabric). Composition percentages are not stated.`, ["page_features.Material", "description.text"]);
  } else if (f.Material) {
    say(`Fabric: ${f.Material}. Composition percentages are not stated.`, ["page_features.Material"]);
  }
  const colourBits = [`Colour: ${f.Colour ?? before.product.options[0].values[0]}`];
  if (f["Bottom Color"] && f["Bottom Color"] !== f.Colour) colourBits.push(`bottoms in ${f["Bottom Color"]}`);
  say(`${colourBits.join(", ")}.`, ["page_features.Colour", "page_features.Bottom Color"]);

  const design = [];
  const collar = wordsIn(before.description.text, COLLAR_WORDS)[0];
  if (collar) design.push(collar.replace("-", " ").replace(/^\w/, (c) => c.toUpperCase()));
  if (/full sleeve/i.test(before.description.text)) design.push("full sleeves");
  if (f["Closure Type"]) design.push(`${f["Closure Type"].toLowerCase().replace(/^buttons$/, "button")} closure`);
  if (f.Pattern) design.push(`${f.Pattern.toLowerCase()}${f["Work Type"] ? ` (${f["Work Type"].toLowerCase()})` : ""}`);
  if (design.length) say(`Design: ${design.join(", ")}.`, ["description.text", "page_features.Closure Type", "page_features.Pattern", "page_features.Work Type"]);

  const fit = wordsIn(before.description.text, FIT_WORDS)[0];
  say(fit ? `Fit: ${fit}.` : "Fit type is not stated.", fit ? ["description.text"] : []);

  const chest = chartColumn(before.size_chart, "CHEST")?.filter((row) => before.variant_sizes.includes(row.size));
  const shoulder = chartColumn(before.size_chart, "SHOULDER")?.filter((row) => before.variant_sizes.includes(row.size));
  if (chest?.length) {
    say(
      `Sizes ${sizeRange(before.variant_sizes)} are chest sizes in inches: pick your chest measurement, as fitting ease is already included. ` +
        `Garment chest runs ${chest[0].value}–${chest[chest.length - 1].value} in${shoulder?.length ? `, shoulder ${shoulder[0].value}–${shoulder[shoulder.length - 1].value} in` : ""}.`,
      ["size_chart.rows", "size_chart.notes", "variants[].size"]
    );
  } else {
    say(`Sold in sizes ${sizeRange(before.variant_sizes)}. No measurements are published for this product.`, ["variants[].size"]);
  }
  if (before.featured_model) say(`The model is listed as ${before.featured_model} (merchant to confirm for this shoot).`, ["featured_model"]);
  const inStock = before.variants.filter((variant) => variant.available).map((variant) => variant.size);
  say(`In stock at capture: ${inStock.length ? inStock.join(", ") : "none"} (of ${before.variant_sizes.join(", ")}).`, ["variants[].available"]);
  if (f["Wash Care"]) say(`Care: ${f["Wash Care"].toLowerCase()}.`, ["page_features.Wash Care"]);
  if (f.Occasions) say(`Listed occasions: ${f.Occasions}.`, ["page_features.Occasions"]);
  if (before.page_price) say(`Price: ${before.page_price.display} MRP, inclusive of all taxes.`, ["page_price"]);

  return { text: sentences.map((sentence) => sentence.text).join(" "), sentences };
}

function buildJsonLd(before, attributes, sizeChart) {
  const attr = (name) => attributes.find((attribute) => attribute.name === name);
  const usable = (name) => {
    const attribute = attr(name);
    return attribute && attribute.value && attribute.tier === "stated" ? attribute.value : undefined;
  };
  const additionalProperty = [
    ["Care", usable("care")],
    ["Closure", usable("closure")],
    ["Pattern", usable("pattern")],
    ["Work type", usable("work_type")],
    ["Pieces included", usable("pieces_included")],
    ["Bottom type", usable("bottom_type")],
    ["Occasions", usable("occasions")],
    ["Fit", usable("fit_type")],
    ["Size chart basis", sizeChart ? `${sizeChart.basis} Units: ${sizeChart.unit}.` : undefined]
  ]
    .filter(([, value]) => value)
    .map(([name, value]) => ({ "@type": "PropertyValue", name, value: String(value) }));

  return {
    "@context": "https://schema.org",
    "@type": "ProductGroup",
    "@id": `${before.source.product_url}#product`,
    name: before.product.title,
    url: before.source.product_url,
    brand: { "@type": "Brand", name: "KORA by NM" },
    productGroupID: before.page_features["Design No"] ?? before.product.handle,
    category: before.product.product_type,
    color: usable("color"),
    material: usable("fabric"),
    audience: { "@type": "PeopleAudience", suggestedGender: "male" },
    variesBy: ["https://schema.org/size"],
    image: before.images.map((image) => image.src),
    additionalProperty,
    hasVariant: before.variants.map((variant) => ({
      "@type": "Product",
      sku: variant.sku,
      name: `${before.product.title} – size ${variant.size}`,
      size: variant.size,
      color: variant.color,
      offers: {
        "@type": "Offer",
        url: `${before.source.product_url}?variant=${variant.id}`,
        price: before.page_price?.amount ?? variant.price,
        priceCurrency: "INR",
        availability: variant.available ? "https://schema.org/InStock" : "https://schema.org/OutOfStock"
      }
    }))
  };
}

function buildAltText(before, findings) {
  const fixIds = new Set(
    findings.flatMap((finding) => (finding.fix?.type === "alt_text" ? finding.fix.image_ids ?? [finding.fix.image_id] : []))
  );
  return before.images.map((image) => ({
    image_id: image.id,
    before: image.alt,
    after: fixIds.has(image.id) || !image.alt ? `${before.product.title} – photo ${image.position} of ${before.images.length}` : image.alt,
    changed: fixIds.has(image.id) || !image.alt,
    tier: "stated",
    note: "Text-derived placeholder; replace with a description of the view once the vision step runs."
  }));
}

// ---------- score (PRD FR2 weights) ----------

function score(before, findings, attributes, fixes) {
  const finding = (field, kinds = ["contradiction", "gap", "data_quality"]) =>
    findings.find((candidate) => candidate.field === field && kinds.includes(candidate.kind));
  const serious = (field) => findings.some((f) => f.field === field && f.kind === "contradiction" && f.severity !== "low");
  const attr = (name) => attributes.find((attribute) => attribute.name === name);
  const stated = (name) => ["stated"].includes(attr(name)?.tier) && attr(name)?.value;

  // [part, weight, criterion, points, before, afterGenerated, afterMerchant]
  const criteria = [
    ["fit_and_sizing", 30, "Size chart published as text", 10, Boolean(before.size_chart), Boolean(before.size_chart), true],
    ["fit_and_sizing", 30, "Measurement units labelled (in and cm)", 5, false, Boolean(fixes.size_chart), true],
    ["fit_and_sizing", 30, "Model height and size worn", 5, Boolean(before.featured_model), Boolean(before.featured_model), true],
    ["fit_and_sizing", 30, "Fit type stated", 5, Boolean(stated("fit_type")), Boolean(stated("fit_type")), true],
    ["fit_and_sizing", 30, "Size chart matches sizes sold", 5, !finding("size_range"), Boolean(fixes.size_chart) || !finding("size_range"), true],
    ["fabric_and_care", 20, "Material stated without contradiction", 8, Boolean(stated("fabric")) && !serious("fabric"), Boolean(stated("fabric")) && !serious("fabric"), true],
    ["fabric_and_care", 20, "Fiber composition with %", 6, false, false, true],
    ["fabric_and_care", 20, "Care instructions", 6, Boolean(stated("care")), Boolean(stated("care")), true],
    ["design_details", 15, "Collar or neckline", 4, Boolean(stated("collar")), Boolean(stated("collar")), true],
    ["design_details", 15, "Closure", 3, Boolean(stated("closure")), Boolean(stated("closure")), true],
    ["design_details", 15, "Sleeve length", 3, Boolean(stated("sleeve_length")), Boolean(stated("sleeve_length")), true],
    ["design_details", 15, "Pieces included, consistent", 3, !serious("pieces_included"), !serious("pieces_included"), true],
    ["design_details", 15, "Garment length", 2, Boolean(stated("garment_length")), Boolean(stated("garment_length")), true],
    ["variants_and_availability", 15, "Every size as a record with availability", 5, true, true, true],
    ["variants_and_availability", 15, "Colour named consistently", 4, !serious("color"), !serious("color"), true],
    ["variants_and_availability", 15, "Valid structured data with material, colour, size", 6, false, true, true],
    ["policies_and_price", 10, "Price with currency", 4, Boolean(before.page_price), Boolean(before.page_price), true],
    ["policies_and_price", 10, "Return policy linked", 2, true, true, true],
    ["policies_and_price", 10, "Return window and return shipping cost on page", 4, false, false, true],
    ["occasion_and_style", 10, "Occasions listed", 4, Boolean(stated("occasions")), Boolean(stated("occasions")), true],
    ["occasion_and_style", 10, "Occasions consistent across the page", 3, !finding("occasions", ["contradiction"]), Boolean(fixes.description) && Boolean(stated("occasions")), true],
    ["occasion_and_style", 10, "Occasion claims backed by reviews", 3, before.reviews.count > 0, before.reviews.count > 0, false]
  ];

  const total = (column) => criteria.reduce((sum, row) => sum + (row[column] ? row[3] : 0), 0);
  const parts = {};
  for (const [part, weight, criterion, points, b, a, m] of criteria) {
    parts[part] ??= { weight, before: 0, after_generated: 0, after_merchant_answers: 0, criteria: [] };
    parts[part].before += b ? points : 0;
    parts[part].after_generated += a ? points : 0;
    parts[part].after_merchant_answers += m ? points : 0;
    parts[part].criteria.push({ criterion, points, before: b, after_generated: a, after_merchant_answers: m });
  }
  return {
    rubric: "PRD FR2 weights (fit 30, fabric 20, design 15, variants 15, policies 10, occasion 10); hackathon criteria, untuned.",
    before: total(4),
    after_generated: total(5),
    after_merchant_answers: total(6),
    parts
  };
}

// ---------- comparison ----------

function compare(before, attributes, fixes, findings) {
  const productLd = before.structured_data.find((block) => block.type === "Product");
  return [
    { field: "description", before: before.description.text, after: fixes.description.text, change: "rewritten from cited page facts; contradicted facts held for merchant" },
    { field: "size_chart", before: before.size_chart ? `${before.size_chart.rows.length} rows, unitless` : null, after: fixes.size_chart ? `${fixes.size_chart.rows.length} rows, in + cm` : null, change: fixes.size_chart ? "labelled units, kept sold sizes only" : "missing; merchant question" },
    { field: "structured_data", before: productLd ? `Product block valid JSON: ${productLd.valid_json}; material/colour/size fields: none` : "none", after: "valid ProductGroup with per-size offers, colour, material and properties", change: "replaced" },
    { field: "image_alt_text", before: `${before.images.filter((i) => i.alt).length}/${before.images.length} images have alt text`, after: `${fixes.alt_text.filter((i) => i.after).length}/${before.images.length}`, change: `${fixes.alt_text.filter((i) => i.changed).length} changed` },
    { field: "contradictions", before: findings.filter((f) => f.kind === "contradiction").length, after: "surfaced with both sources; held out of generated copy", change: "flagged" },
    { field: "merchant_questions", before: 0, after: findings.filter((f) => f.merchant_question).length, change: "added" },
    ...attributes.map((attribute) => ({ field: `attribute.${attribute.name}`, before: attribute.tier === "pending_vision" ? null : attribute.value, after: attribute.value, tier: attribute.tier }))
  ];
}

// ---------- main ----------

async function main() {
  const files = (await readdir(BEFORE_DIR)).filter((name) => name.endsWith(".json")).sort();
  const befores = await Promise.all(files.map(async (name) => ({ name, data: JSON.parse(await readFile(path.join(BEFORE_DIR, name), "utf8")) })));
  const modelTexts = befores.map(({ data }) => data.featured_model).filter(Boolean);
  await mkdir(AFTER_DIR, { recursive: true });

  const summary = [];
  for (const { name, data: before } of befores) {
    const context = { total: befores.length, modelTextCount: modelTexts.filter((text) => text === before.featured_model).length };
    const findings = detectFindings(before, context);
    const attributes = extractAttributes(before, findings);
    const sizeChart = buildSizeChart(before);
    const fixes = { size_chart: sizeChart };
    fixes.description = buildDescription(before, findings);
    fixes.json_ld = buildJsonLd(before, attributes, sizeChart);
    fixes.alt_text = buildAltText(before, findings);
    const scores = score(before, findings, attributes, fixes);

    const after = {
      demo_id: before.demo_id,
      title: before.product.title,
      product_url: before.source.product_url,
      before_file: `before/${name}`,
      generated_at: new Date().toISOString(),
      generator: "scripts/demo/build-after.mjs (text and structured data rules; no vision yet)",
      score: scores,
      findings,
      merchant_questions: [...new Set(findings.map((finding) => finding.merchant_question).filter(Boolean))],
      attributes,
      fixes,
      image_processing: {
        status: "pending",
        download_command: "node scripts/demo/download-images.mjs",
        checks: [...new Set(findings.map((finding) => finding.pending_image_check).filter(Boolean)), "Read visible design attributes per image (neckline, sleeve, length, pattern)", "OCR any size chart, care label or fabric tag"],
        images: before.images.map((image) => ({ id: image.id, src: image.src, local_path: image.local_path, width: image.width, height: image.height }))
      },
      comparison: compare(before, attributes, fixes, findings)
    };
    await writeFile(path.join(AFTER_DIR, name), `${JSON.stringify(after, null, 2)}\n`);
    summary.push({
      demo_id: before.demo_id,
      title: before.product.title,
      product_type: before.product.product_type,
      product_url: before.source.product_url,
      images: before.images.length,
      score_before: scores.before,
      score_after_generated: scores.after_generated,
      score_after_merchant_answers: scores.after_merchant_answers,
      contradictions: findings.filter((f) => f.kind === "contradiction").map((f) => `${f.severity}: ${f.summary}`),
      merchant_questions: after.merchant_questions.length,
      before_file: `before/${name}`,
      after_file: `after/${name}`
    });
    console.log(`${before.demo_id} score ${scores.before} -> ${scores.after_generated} (${scores.after_merchant_answers} with merchant answers), ${findings.length} findings`);
  }
  await writeFile(path.join(ROOT, "comparison.json"), `${JSON.stringify({ generated_at: new Date().toISOString(), products: summary }, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
