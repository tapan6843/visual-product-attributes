import { beforeEach, describe, expect, it, vi } from "vitest";

const { extractMock } = vi.hoisted(() => ({
  extractMock: vi.fn()
}));

vi.mock("@/lib/extract-attributes", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/lib/extract-attributes")
  >();

  return {
    ...actual,
    extractVisualAttributes: extractMock
  };
});

import { ExtractionError } from "@/lib/extract-attributes";
import { POST } from "./route";

const validBody = {
  productId: "DRESS-104",
  skuId: "DRESS-104-BLK",
  images: [
    {
      id: "front",
      url: "https://example.com/dress-front.jpg",
      view: "front"
    }
  ]
};

describe("POST /api/extract", () => {
  beforeEach(() => {
    extractMock.mockReset();
  });

  it("returns 422 when a product image cannot be accessed", async () => {
    extractMock.mockRejectedValue(
      new ExtractionError(
        "image_unavailable",
        "One or more product images could not be accessed"
      )
    );

    const response = await POST(
      new Request("http://localhost/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validBody)
      })
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      error: "One or more product images could not be accessed",
      code: "image_unavailable"
    });
  });
});

