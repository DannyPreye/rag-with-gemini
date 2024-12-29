import { Request, Response, response } from "express";
import { DocumentProcessor } from '../../utils/documentProcessor.js';
import { z } from "zod";
import { CurriculumSchema } from "../../schemas/createCurriculum.schema.js";
import { CURRICULUM_PROMPT } from "../../prompts/createCurriculum.prompt.js";
import { SUMMARY_PROMPT } from "../../prompts/createSummary.prompt.js";
import { SummaryResponseSchema } from "../../schemas/createSummary.schema.js";

const documentProcessor = new DocumentProcessor();
export class CompanyModule
{

    static async processDocuments(req: Request, res: Response)
    {
        try {
            // @ts-ignore
            const { moduleName } = req.body;
            // @ts-ignore
            const files = req.files as Express.Multer.File[];

            let isReady = false;


            if (!files || files.length == 0) {
                return res.status(400).json({
                    message: "No documents provided"
                });
            }

            const processedDocuments = [];



            for (const file of files) {

                // Process document
                const result = await documentProcessor.processDocument(file, moduleName, isReady);
                if (isReady) {
                    res.status(200).json({
                        message: "documents is been processed"
                    });
                }

                processedDocuments.push(result);


            }

            res.json({
                message: 'Documents processed successfully',
                documents: processedDocuments
            });

        } catch (error) {
            console.error('Error processing documents:', error);
            res.status(500).json({ error: 'Failed to process documents' });

        }

    }

    static async generateResult(req: Request, res: Response)
    {
        try {
            // @ts-ignore
            const { moduleName } = req.body;

            const questionSchema = z.object({
                question: z.string(),
                answer: z.string(),
                topic: z.string(),
                difficulty: z.string()
            });

            const prompt = `summarize Typical AI problems`;

            const questionsSchema = z.array(questionSchema);
            const result = await documentProcessor.generateResult(moduleName, prompt);

            return res.status(200).json({
                data: result
            });
        } catch (error: any) {
            console.log("Error generating response", error.message);
            return res.status(500).json({
                error: "Failed to generate result"
            });

        }
    }

    static async generateCurriculum(req: Request, res: Response)
    {
        try {
            const { namespaceId } = req.body;
            const zodSchema = CurriculumSchema;
            const prompt = CURRICULUM_PROMPT;

            const result = await documentProcessor.generateResult(namespaceId, prompt, zodSchema);

            return res.status(200).json({
                data: result
            });
        } catch (error: any) {
            console.log("Error generating curriculum", error);
            return res.status(500).json({
                error: "Failed to generate curriculum"
            });
        }
    }

    static async generateSummary(req: Request, res: Response)
    {
        try {
            const { userPrompt, namespaceId } = req.body;

            const formattedPrompt = SUMMARY_PROMPT.replace(
                "{userPrompt}",
                userPrompt
            );

            const result = await documentProcessor.generateResult(
                namespaceId,
                formattedPrompt,
                SummaryResponseSchema
            );

            return res.status(200).json({
                success: true,
                data: result
            });

        } catch (error) {
            console.log("Error generating summary", error);
            return res.status(500).json({
                error: "Failed to generate summary"
            });
        }
    }

    static async refresh(req: Request, res: Response)
    {
        try {
            const { namespace } = req.params;
            console.log("namespace", namespace);

            // @ts-ignore
            const newFiles = req.files as Express.Multer.File[];

            const result = await documentProcessor.refresh(namespace, newFiles);

            console.log("this is the result");

            return res.status(200).json({
                data: result
            });

        } catch (error) {
            console.log("Error refreshing documents", error);
            return res.status(500).json({
                error: "Failed to refresh documents"
            });

        }
    }

}
