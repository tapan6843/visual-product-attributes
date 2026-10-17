import { z } from "zod";

export const ImageViewSchema = z.enum([
  "front",
  "back",
  "side",
  "detail",
  "unknown"
]);

export const ProductImageSchema = z.object({
  id: z.string().trim().min(1),
  url: z.string().url().refine((value) => value.startsWith("https://"), {
    message: "Image URLs must use HTTPS"
  }),
  view: ImageViewSchema.optional()
});

export const ExtractionRequestSchema = z
  .object({
    productId: z.string().trim().min(1),
    skuId: z.string().trim().min(1),
    categoryHint: z.string().trim().min(1).optional(),
    images: z.array(ProductImageSchema).min(1).max(5)
  })
  .superRefine((request, context) => {
    const ids = request.images.map((image) => image.id);
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: "custom",
        message: "Image IDs must be unique",
        path: ["images"]
      });
    }
  });

export const AttributeStatusSchema = z.enum(["present", "absent", "unknown"]);

export const VisualAttributeSchema = z
  .object({
    name: z.string().trim().min(1),
    value: z.string().trim().min(1).nullable(),
    status: AttributeStatusSchema,
    confidence: z.number().min(0).max(1),
    evidenceImageIds: z.array(z.string().trim().min(1))
  })
  .superRefine((attribute, context) => {
    if (attribute.status === "present" && attribute.evidenceImageIds.length === 0) {
      context.addIssue({
        code: "custom",
        message: "Present attributes require image evidence",
        path: ["evidenceImageIds"]
      });
    }

    if (attribute.status === "unknown" && attribute.value !== null) {
      context.addIssue({
        code: "custom",
        message: "Unknown attributes must have a null value",
        path: ["value"]
      });
    }
  });

export const ExtractionResultSchema = z.object({
  productId: z.string().trim().min(1),
  skuId: z.string().trim().min(1),
  category: z.string().trim().min(1),
  categoryConfidence: z.number().min(0).max(1),
  attributes: z.array(VisualAttributeSchema),
  distinctiveFeatures: z.array(
    z.object({
      description: z.string().trim().min(1),
      confidence: z.number().min(0).max(1),
      evidenceImageIds: z.array(z.string().trim().min(1)).min(1)
    })
  ),
  visualDescription: z.string().trim().min(1)
});

export type ExtractionRequest = z.infer<typeof ExtractionRequestSchema>;
export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;

