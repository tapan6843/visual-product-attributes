import { NextResponse } from "next/server";
import { extractVisualAttributes } from "@/lib/extract-attributes";
import {
  ExtractionRequestSchema,
  ExtractionResultSchema
} from "@/lib/product-schema";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsedRequest = ExtractionRequestSchema.safeParse(body);

  if (!parsedRequest.success) {
    return NextResponse.json(
      {
        error: "Invalid extraction request",
        details: parsedRequest.error.flatten()
      },
      { status: 400 }
    );
  }

  try {
    const result = await extractVisualAttributes(parsedRequest.data);
    return NextResponse.json(ExtractionResultSchema.parse(result));
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "The extraction service is temporarily unavailable"
      },
      { status: 502 }
    );
  }
}

