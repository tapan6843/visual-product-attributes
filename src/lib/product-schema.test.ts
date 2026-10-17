import { describe, expect, it } from "vitest";
import {
  ExtractionRequestSchema,
  ExtractionResultSchema,
  VisualAttributeSchema
} from "./product-schema";

describe("ExtractionRequestSchema", () => {
  it("accepts a valid product request", () => {
    const result = ExtractionRequestSchema.safeParse({
      productId: "DRESS-104",
      skuId: "DRESS-104-BLK",
      images: [{ id: "front", url: "https://example.com/front.jpg", view: "front" }]
    });

    expect(result.success).toBe(true);
  });

  it("rejects duplicate image IDs", () => {
    const result = ExtractionRequestSchema.safeParse({
      productId: "DRESS-104",
      skuId: "DRESS-104-BLK",
      images: [
        { id: "front", url: "https://example.com/front.jpg" },
        { id: "front", url: "https://example.com/back.jpg" }
      ]
    });

    expect(result.success).toBe(false);
  });
});

describe("VisualAttributeSchema", () => {
  it("requires evidence for a present attribute", () => {
    const result = VisualAttributeSchema.safeParse({
      name: "neckline",
      value: "square",
      status: "present",
      confidence: 0.96,
      evidenceImageIds: []
    });

    expect(result.success).toBe(false);
  });

  it("rejects confidence outside the zero-to-one range", () => {
    const result = VisualAttributeSchema.safeParse({
      name: "neckline",
      value: "square",
      status: "present",
      confidence: 1.2,
      evidenceImageIds: ["front"]
    });

    expect(result.success).toBe(false);
  });
});

describe("ExtractionResultSchema", () => {
  it("accepts an unknown attribute with a null value", () => {
    const result = ExtractionResultSchema.safeParse({
      productId: "DRESS-104",
      skuId: "DRESS-104-BLK",
      category: "dress",
      categoryConfidence: 0.98,
      attributes: [
        {
          name: "material_composition",
          value: null,
          status: "unknown",
          confidence: 0,
          evidenceImageIds: []
        }
      ],
      distinctiveFeatures: [],
      visualDescription: "A black dress."
    });

    expect(result.success).toBe(true);
  });
});

