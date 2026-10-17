import { createMockExtraction } from "./mock-extraction";
import type { ExtractionRequest, ExtractionResult } from "./product-schema";

export async function extractVisualAttributes(
  request: ExtractionRequest
): Promise<ExtractionResult> {
  if (process.env.USE_MOCK_EXTRACTION !== "false") {
    return createMockExtraction(request);
  }

  throw new Error(
    "Live extraction is not implemented. Enable mock extraction or add the OpenAI adapter."
  );
}

