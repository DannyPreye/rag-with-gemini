import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { DocxLoader } from "@langchain/community/document_loaders/fs/docx";
import { TextLoader } from "langchain/document_loaders/fs/text";
import { Document } from "langchain/document";
import { GoogleGenerativeAI, } from "@google/generative-ai";
import { Pinecone as PineconeClient } from "@pinecone-database/pinecone";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

import { config } from "../config/index.js";
import { StructuredOutputParser } from "@langchain/core/output_parsers";

import { S3Client, ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { Readable } from "stream";
import { finished } from "stream/promises";
import { createWriteStream } from "fs";
import { pipeline } from "stream/promises";


import { createHash } from 'crypto';
import { z } from "zod";
import { s3Loader } from "../config/s3Loader.js";
import { cleanupTemp, uploadToS3 } from "../config/multer.config.js";
import { TokenTracker } from "./tokenTracker.js";








interface ProcessingResult
{
    documentId: string;
    chunks: any[];
    metadata: {
        totalChunks: number;
        totalTokens: number;
        processingTime: number;
    };
    usage: UsageMetrics;
}


export interface UsageMetrics
{
    embeddingTokens: number;
    generationTokens: number;
    vectorDBOperations: number;
    approximateCost: number;
}

export class DocumentProcessor
{
    private textSplitter: RecursiveCharacterTextSplitter;
    private genAI: GoogleGenerativeAI;
    private pineconeClient: PineconeClient;
    private INDEX_DIMENSIONS = 1024;
    private MAX_CONTEXT_LENGTH = 30000; // Change this if you like

    private usageMetrics: UsageMetrics = {
        embeddingTokens: 0,
        generationTokens: 0,
        vectorDBOperations: 0,
        approximateCost: 0
    };


    constructor ()
    {
        this.textSplitter = new RecursiveCharacterTextSplitter({
            chunkSize: config.chunkSize,
            chunkOverlap: config.chunkOverlap
        });

        this.genAI = new GoogleGenerativeAI(config.gemini.apiKey as string);
        this.pineconeClient = new PineconeClient();
    }


    private async extractTextFromFile(file: Express.Multer.File): Promise<Document[]>
    {
        const fileType = file.mimetype;

        let loader;


        switch (fileType) {

            case 'application/pdf':

                loader = new PDFLoader(file.path);
                break;
            case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
                loader = new DocxLoader(file.path);
                break;
            case 'text/plain':
                loader = new TextLoader(file.path);
                break;
            default:
                throw new Error('Unsupported file type');
        }

        return await loader.load();
    }

    private async generateEmbedding(text: string): Promise<number[]>
    {
        const tokenCount = TokenTracker.estimateTokenCount(text);
        this.usageMetrics.embeddingTokens += tokenCount;

        const model = this.genAI.getGenerativeModel({ model: "embedding-001" });
        const embeddings = await model.embedContent(text);
        const embedding = embeddings.embedding.values;
        // Pad or truncate the embedding to match the index dimensions
        if (embedding.length < this.INDEX_DIMENSIONS) {
            // Pad with zeros if embedding is too short
            return [ ...embedding, ...new Array(this.INDEX_DIMENSIONS - embedding.length).fill(0) ];
        } else if (embedding.length > this.INDEX_DIMENSIONS) {
            // Truncate if embedding is too long
            return embedding.slice(0, this.INDEX_DIMENSIONS);
        }
        return embedding;
    }

    private generateChunkId(content: string, documentId: string,): string
    {
        const hash = createHash("sha256");
        hash.update(`${documentId}-${content}`);
        return hash.digest("hex").substring(0, 32);
    }

    async processDocument(file: Express.Multer.File, namespace: string, isReady?: boolean): Promise<ProcessingResult>
    {
        const startTime = Date.now();
        let totalTokens = 0;

        try {
            // Extract the file
            const text = await this.extractTextFromFile(file);

            // create a unique document ID
            const documentId = crypto.randomUUID();

            // Upload the file to S3 once, before processing chunks
            const s3Url = await uploadToS3(file.path, file.originalname, namespace);

            // Split the text into chunks
            const chunks = await this.textSplitter.splitDocuments(text);

            const documentChunks: any[] = [];
            const vectors: any[] = [];

            isReady = true;

            const BATCH_SIZE = 5;
            for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
                const batchChunks = chunks.slice(i, i + BATCH_SIZE);
                const batchPromises = batchChunks.map(async (chunk, index) =>
                {
                    const chunkNumber = i + index + 1;

                    // Generate embedding
                    const embedding = await this.generateEmbedding(chunk.pageContent);

                    // Calculate approximate tokens (rough estimation)
                    const chunkTokens = Math.ceil(chunk.pageContent.split(/\s+/).length * 1.3);
                    totalTokens += chunkTokens;

                    const documentChunk = {
                        id: this.generateChunkId(chunk.pageContent, documentId),
                        documentId,
                        fileUrl: s3Url, // Use the previously uploaded file URL
                        content: chunk.pageContent,
                        embedding,
                        metadata: {
                            source: file.originalname,
                            namespace,
                            chunkNumber,
                            pageNumber: chunk.metadata.pageNumber,
                            totalChunks: chunks.length,
                        },
                    };

                    vectors.push({
                        id: documentChunk.id,
                        values: documentChunk.embedding,
                        metadata: {
                            content: documentChunk.content,
                            ...documentChunk.metadata,
                        },
                    });

                    return documentChunk;
                });

                const processedChunks = await Promise.all(batchPromises);
                documentChunks.push(...processedChunks);

                // Add small delay between batches to avoid rate limiting
                if (i + BATCH_SIZE < chunks.length) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }

            // Store vectors in Pinecone
            const pineconeIndex = this.pineconeClient.Index(config.pinecone.indexName!);
            await pineconeIndex.namespace(namespace).upsert(vectors);

            // do the clean-up
            await cleanupTemp(file.path);

            // Track vector operations
            this.usageMetrics.vectorDBOperations += vectors.length;

            // Calculate approximate cost
            this.usageMetrics.approximateCost = (
                (this.usageMetrics.embeddingTokens / 1000) * TokenTracker.EMBEDDING_COST_PER_1K_TOKENS +
                (this.usageMetrics.generationTokens / 1000) * TokenTracker.GENERATION_COST_PER_1K_TOKENS +
                TokenTracker.calculateVectorDBCost(this.usageMetrics.vectorDBOperations)
            );

            return {
                documentId,
                chunks: documentChunks,
                metadata: {
                    totalChunks: documentChunks.length,
                    totalTokens,
                    processingTime: Date.now() - startTime,
                },
                usage: { ...this.usageMetrics }
            };

        } catch (error: any) {
            if (file.path) {
                await cleanupTemp(file.path);
            }
            console.error('Error processing document:', error);
            throw new Error(`Failed to process document: ${error.message}`);
        }
    }

    private async retrieveRelevantContext(namespace: string, queryEmbedding: number[], topK: number = 510)
    {
        const pineconeIndex = this.pineconeClient.Index(config.pinecone.indexName!);
        const queryResponse = await pineconeIndex.namespace(namespace).query({
            topK,
            vector: queryEmbedding,
            includeMetadata: true
        });

        // Sort matches by score to get most relevant first
        const sortedMatches = queryResponse.matches.sort((a, b) => (b.score || 0) - (a.score || 0));

        let contextLength = 0;
        const contextParts: string[] = [];
        const seenDocuments = new Set<string>();

        for (const match of sortedMatches) {
            if (!match.metadata?.content) continue;

            const content = match.metadata.content as string;
            const documentId = match.metadata.documentId as string;

            // Ensure we get context from different documents
            if (!seenDocuments.has(documentId)) {
                seenDocuments.add(documentId);
            }

            // Add content if within length limits
            const newLength = contextLength + content.length;
            if (newLength <= this.MAX_CONTEXT_LENGTH) {
                contextParts.push(content);
                contextLength = newLength;
            }
        }

        return {
            context: contextParts.join('\n\n'),
            documentCount: seenDocuments.size
        };
    }
    async generateResult(namespace: string, prompt: string, zodSchema?: z.ZodType<any>)
    {
        try {

            // Track prompt tokens
            const promptTokens = TokenTracker.estimateTokenCount(prompt);
            this.usageMetrics.generationTokens += promptTokens;


            const model = this.genAI.getGenerativeModel({ model: "embedding-001" });
            const queryEmbedding = await model.embedContent(prompt);
            const paddedEmbedding = [ ...queryEmbedding.embedding.values ];




            // Pad the query embedding to match index dimensions
            if (paddedEmbedding.length < this.INDEX_DIMENSIONS) {
                paddedEmbedding.push(...new Array(this.INDEX_DIMENSIONS - paddedEmbedding.length).fill(0));
            } else if (paddedEmbedding.length > this.INDEX_DIMENSIONS) {
                paddedEmbedding.length = this.INDEX_DIMENSIONS;
            }

            // Retrieve relevant context from all documents
            const { context, documentCount } = await this.retrieveRelevantContext(namespace, paddedEmbedding);





            // Create the base prompt
            const formattedPrompt = `
             Analyze and synthesize information from different documents to answer this question:
            ${prompt}

            Using this context:
            ${context}

             Please provide a comprehensive answer that synthesizes information from all relevant documents.
        `;

            // If we have a schema, handle structured output
            if (zodSchema) {
                const parser = StructuredOutputParser.fromZodSchema(zodSchema);
                const formattedPromptWithSchema = `
                ${formattedPrompt}

                ${parser.getFormatInstructions()}
                You must always return valid JSON fenced by a markdown code block. Do not return any additional text.
            `;

                const generativeModel = this.genAI.getGenerativeModel({
                    model: "gemini-1.5-pro",
                });

                const result = await generativeModel.generateContent(formattedPromptWithSchema);
                const responseText = result.response.text();

                if (typeof result.response.text === 'function') {

                    // track the output tokens from the llm
                    this.usageMetrics.generationTokens += TokenTracker.estimateTokenCount(responseText);
                }



                try {
                    return {
                        result: await parser.parse(responseText),
                        usage: { ...this.usageMetrics }

                    };
                } catch (parseError) {
                    console.error("Failed to parse response according to schema:", parseError);
                    throw new Error("Failed to generate properly structured response");
                }
            }

            // Handle regular unstructured output
            const generativeModel = this.genAI.getGenerativeModel({
                model: "gemini-1.5-pro",
            });
            const result = await generativeModel.generateContent(formattedPrompt);

            if (typeof result.response.text === 'function') {
                const responseText = result.response.text();
                this.usageMetrics.generationTokens += TokenTracker.estimateTokenCount(responseText);
            }

            console.log("This is is the result", result.response.text());
            return {
                result: result.response.text(),
                usage: { ...this.usageMetrics }
            };

        } catch (error) {
            console.error(`Error generating response:`, error);
            throw new Error("Failed to generate response");
        }
    }
    async refresh(namespace: string, newFiles: Express.Multer.File[] = []): Promise<any>
    {
        const startTime = Date.now();
        const errors: Array<{ file: string; error: string; }> = [];
        let totalChunks = 0;
        let totalTokens = 0;
        let processedFiles = 0;

        try {
            // Reset usage metrics
            this.resetUsage();

            // Delete existing namespace
            const pineconeIndex = this.pineconeClient.Index(config.pinecone.indexName!);
            await pineconeIndex.namespace(namespace).deleteAll();

            // Create temp directory with proper error handling
            const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'doc-processor-refresh-'));

            try {
                // Set up S3 client
                const s3Client = new S3Client({
                    region: config.aws.region as string,
                    credentials: {
                        accessKeyId: config.aws.accessKeyId as string,
                        secretAccessKey: config.aws.secretAccessKey as string
                    }
                });

                // Get existing files
                const listCommand = new ListObjectsV2Command({
                    Bucket: config.aws.bucketName,
                    Prefix: `documents/${namespace}`
                });

                const s3Objects = await s3Client.send(listCommand);
                const existingFiles = s3Objects.Contents || [];

                // Process existing files with proper stream handling
                for (const file of existingFiles) {
                    if (!file.Key) continue;

                    try {
                        const getObjectCommand = new GetObjectCommand({
                            Bucket: config.aws.bucketName,
                            Key: file.Key
                        });

                        const response = await s3Client.send(getObjectCommand);
                        if (!response.Body) continue;

                        console.log("response body", response.Body);

                        const tempFilePath = path.join(tempDir, path.basename(file.Key));


                        await pipeline(
                            response.Body as Readable,
                            createWriteStream(tempFilePath)
                        );

                        const multerFile: Express.Multer.File = {
                            fieldname: 'file',
                            originalname: path.basename(file.Key),
                            encoding: '7bit',
                            mimetype: response.ContentType || 'application/pdf',
                            size: response.ContentLength || 0,
                            destination: tempDir,
                            filename: path.basename(file.Key),
                            path: tempFilePath,
                            buffer: Buffer.from([]),
                            stream: new Readable()
                        };

                        const result = await this.processDocument(multerFile, namespace);
                        totalChunks += result.metadata.totalChunks;
                        totalTokens += result.metadata.totalTokens;
                        processedFiles++;

                    } catch (error: any) {
                        errors.push({
                            file: file.Key,
                            error: error.message
                        });
                        console.error(`Error processing existing file ${file.Key}:`, error);
                    }
                }

                // Process new files
                for (const file of newFiles) {
                    try {
                        const result = await this.processDocument(file, namespace);
                        totalChunks += result.metadata.totalChunks;
                        totalTokens += result.metadata.totalTokens;
                        processedFiles++;
                    } catch (error: any) {
                        errors.push({
                            file: file.originalname,
                            error: error.message
                        });
                        console.error(`Error processing new file ${file.originalname}:`, error);
                    }
                }

            } finally {
                // Clean up temp directory
                await fs.rm(tempDir, { recursive: true, force: true }).catch(console.error);
            }

            // Return results even if there were some errors
            return {
                success: true,
                processedFiles,
                errors: errors.length > 0 ? errors : undefined,
                metadata: {
                    totalChunks,
                    totalTokens,
                    processingTime: Date.now() - startTime
                },
                usage: this.getCurrentUsage()
            };

        } catch (error: any) {
            console.error("Fatal error in refresh operation:", error);
            throw new Error(`Failed to refresh documents: ${error.message}`);
        }
    }

    getCurrentUsage(): UsageMetrics
    {
        return { ...this.usageMetrics };
    }
    resetUsage(): void
    {
        this.usageMetrics = {
            embeddingTokens: 0,
            generationTokens: 0,
            vectorDBOperations: 0,
            approximateCost: 0
        };
    }
}
