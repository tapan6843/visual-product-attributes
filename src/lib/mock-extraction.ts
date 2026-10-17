import type { ExtractionRequest, ExtractionResult } from "./product-schema";

export function createMockExtraction(request: ExtractionRequest): ExtractionResult {
  const allImageIds = request.images.map((image) => image.id);
  const frontImageId =
    request.images.find((image) => image.view === "front")?.id ?? allImageIds[0];

  return {
    productId: request.productId,
    skuId: request.skuId,
    category: request.categoryHint ?? "dress",
    categoryConfidence: 0.98,
    attributes: [
      {
        name: "primary_color",
        value: "black",
        status: "present",
        confidence: 0.99,
        evidenceImageIds: allImageIds
      },
      {
        name: "neckline",
        value: "square",
        status: "present",
        confidence: 0.96,
        evidenceImageIds: [frontImageId]
      },
      {
        name: "sleeve_length",
        value: "sleeveless",
        status: "present",
        confidence: 0.97,
        evidenceImageIds: [frontImageId]
      },
      {
        name: "material_composition",
        value: null,
        status: "unknown",
        confidence: 0,
        evidenceImageIds: []
      }
    ],
    distinctiveFeatures: [
      {
        description: "Square neckline with wide shoulder straps",
        confidence: 0.94,
        evidenceImageIds: [frontImageId]
      }
    ],
    visualDescription:
      "A fitted black dress with a square neckline, wide shoulder straps, and a sleeveless silhouette."
  };
}

