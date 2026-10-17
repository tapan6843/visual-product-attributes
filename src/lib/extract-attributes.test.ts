import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { extractVisualAttributes } from "./extract-attributes";
import type { ExtractionRequest, ExtractionResult } from "./product-schema";

const { parseMock } = vi.hoisted(() => ({
  parseMock: vi.fn()
}));

vi.mock("openai", () => ({
  default: class MockOpenAI {
    responses = {
      parse: parseMock
    };
  }
}));

const request: ExtractionRequest = {
  productId: "DRESS-104",
  skuId: "DRESS-104-BLK",
  categoryHint: "dress",
  images: [
    {
      id: "front",
      url: "https://example.com/dress-front.jpg",
      view: "front"
    },
    {
      id: "back",
      url: "https://example.com/dress-back.jpg",
      view: "back"
    }
  ]
};

const parsedResult: ExtractionResult = {
  productId: "DRESS-104",
  skuId: "DRESS-104-BLK",
  category: "dress",
  categoryConfidence: 0.98,
  attributes: [
    {
      name: "neckline",
      value: "square",
      status: "present",
      confidence: 0.96,
      evidenceImageIds: ["front"]
    }
  ],
  distinctiveFeatures: [
    {
      description: "Square neckline",
      confidence: 0.96,
      evidenceImageIds: ["front"]
    }
  ],
  visualDescription: "A black dress with a square neckline."
};

describe("extractVisualAttributes", () => {
  const previousMockSetting = process.env.USE_MOCK_EXTRACTION;
  const previousModel = process.env.OPENAI_MODEL;

  beforeEach(() => {
    process.env.USE_MOCK_EXTRACTION = "false";
    process.env.OPENAI_MODEL = "test-vision-model";
    parseMock.mockReset();
  });

  afterEach(() => {
    process.env.USE_MOCK_EXTRACTION = previousMockSetting;
    process.env.OPENAI_MODEL = previousModel;
  });

  it("sends every image and its declared view to the Responses API", async () => {
    parseMock.mockResolvedValue({ output_parsed: parsedResult });

    await expect(extractVisualAttributes(request)).resolves.toEqual(parsedResult);

    expect(parseMock).toHaveBeenCalledOnce();
    const call = parseMock.mock.calls[0][0];
    expect(call.model).toBe("test-vision-model");
    expect(call.text.format.type).toBe("json_schema");

    const userMessage = call.input.find(
      (item: { role?: string }) => item.role === "user"
    );
    const imageInputs = userMessage.content.filter(
      (item: { type: string }) => item.type === "input_image"
    );
    const textInputs = userMessage.content
      .filter((item: { type: string }) => item.type === "input_text")
      .map((item: { text: string }) => item.text)
      .join("\n");

    expect(imageInputs).toEqual([
      {
        type: "input_image",
        image_url: "https://example.com/dress-front.jpg",
        detail: "original"
      },
      {
        type: "input_image",
        image_url: "https://example.com/dress-back.jpg",
        detail: "original"
      }
    ]);
    expect(textInputs).toContain("Image ID: front");
    expect(textInputs).toContain("Declared view: front");
    expect(textInputs).toContain("Image ID: back");
    expect(textInputs).toContain("Declared view: back");
  });

  it("rejects a completed response without parsed output", async () => {
    parseMock.mockResolvedValue({ output_parsed: null });

    await expect(extractVisualAttributes(request)).rejects.toThrow(
      "The model did not return structured product attributes"
    );
  });

  it("validates parsed output before returning it", async () => {
    parseMock.mockResolvedValue({
      output_parsed: {
        ...parsedResult,
        categoryConfidence: 2
      }
    });

    await expect(extractVisualAttributes(request)).rejects.toThrow();
  });

  it("rejects evidence that references an image not supplied in the request", async () => {
    parseMock.mockResolvedValue({
      output_parsed: {
        ...parsedResult,
        attributes: [
          {
            ...parsedResult.attributes[0],
            evidenceImageIds: ["invented-image"]
          }
        ]
      }
    });

    await expect(extractVisualAttributes(request)).rejects.toMatchObject({
      code: "invalid_response"
    });
  });

  it("classifies image download failures", async () => {
    parseMock.mockRejectedValue({
      status: 400,
      message: "Error while downloading an image from the supplied URL"
    });

    await expect(extractVisualAttributes(request)).rejects.toMatchObject({
      code: "image_unavailable"
    });
  });
});
