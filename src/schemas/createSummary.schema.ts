import { z } from "zod";

export const SummaryResponseSchema = z.object({
    summary: z.string(),
    keywords: z.array(z.string()).optional(),
    mainPoints: z.array(z.string()).optional(),
    metadata: z.object({
        generatedAt: z.string(),
        wordCount: z.number(),
        sourceCount: z.number().optional()
    })
});
