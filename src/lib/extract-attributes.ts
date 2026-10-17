import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { EXTRACTION_PROMPT } from "./extraction-prompt";
import { createMockExtraction } from "./mock-extraction";
import {
  ExtractionResultSchema,
  type ExtractionRequest,
  type ExtractionResult
} from "./product-schema";

export type ExtractionErrorCode =
  | "image_unavailable"
  | "incomplete_response"
  | "invalid_response"
  | "service_error";

export class ExtractionError extends Error {
  constructor(
    public readonly code: ExtractionErrorCode,
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "ExtractionError";
  }
}

function buildUserContent(request: ExtractionRequest) {
  return [
    {
      type: "input_text" as const,
      text: [
        `Product ID: ${request.productId}`,
        `SKU ID: ${request.skuId}`,
        `Category hint: ${request.categoryHint ?? "not supplied"}`
      ].join("\n")
    },
    ...request.images.flatMap((image) => [
      {
        type: "input_text" as const,
        text: [
          `Image ID: ${image.id}`,
          `Declared view: ${image.view ?? "unknown"}`
        ].join("\n")
      },
      {
        type: "input_image" as const,
        image_url: image.url,
        detail: "original" as const
      }
    ])
  ];
}

function isImageUnavailableError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as { status?: unknown; message?: unknown };
  return (
    candidate.status === 400 &&
    typeof candidate.message === "string" &&
    /(image|image_url).*(download|fetch|access|invalid)|download.*image/i.test(
      candidate.message
    )
  );
}

function validateRequestReferences(
  request: ExtractionRequest,
  result: ExtractionResult
): ExtractionResult {
  if (result.productId !== request.productId || result.skuId !== request.skuId) {
    throw new ExtractionError(
      "invalid_response",
      "The model returned identifiers that do not match the request"
    );
  }

  const submittedImageIds = new Set(request.images.map((image) => image.id));
  const evidenceImageIds = [
    ...result.attributes.flatMap((attribute) => attribute.evidenceImageIds),
    ...result.distinctiveFeatures.flatMap((feature) => feature.evidenceImageIds)
  ];

  if (evidenceImageIds.some((imageId) => !submittedImageIds.has(imageId))) {
    throw new ExtractionError(
      "invalid_response",
      "The model cited an image ID that was not supplied in the request"
    );
  }

  return result;
}

export async function extractVisualAttributes(
  request: ExtractionRequest
): Promise<ExtractionResult> {
  if (process.env.USE_MOCK_EXTRACTION !== "false") {
    return createMockExtraction(request);
  }

  try {
    const client = new OpenAI();
    const response = await client.responses.parse({
      model: process.env.OPENAI_MODEL ?? "gpt-6-astra",
      store: false,
      input: [
        {
          role: "developer",
          content: EXTRACTION_PROMPT
        },
        {
          role: "user",
          content: buildUserContent(request)
        }
      ],
      text: {
        format: zodTextFormat(
          ExtractionResultSchema,
          "visual_product_attributes"
        )
      }
    });

    if (!response.output_parsed) {
      throw new ExtractionError(
        "incomplete_response",
        "The model did not return structured product attributes"
      );
    }

    const result = ExtractionResultSchema.safeParse(response.output_parsed);
    if (!result.success) {
      throw new ExtractionError(
        "invalid_response",
        "The model returned invalid product attributes",
        { cause: result.error }
      );
    }

    return validateRequestReferences(request, result.data);
  } catch (error) {
    if (error instanceof ExtractionError) {
      throw error;
    }

    if (isImageUnavailableError(error)) {
      throw new ExtractionError(
        "image_unavailable",
        "One or more product images could not be accessed",
        { cause: error }
      );
    }

    throw new ExtractionError(
      "service_error",
      "The visual extraction service is temporarily unavailable",
      { cause: error }
    );
  }
}
