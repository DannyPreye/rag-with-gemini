import { config as DotenvConfig } from "dotenv";


DotenvConfig();

export const config = {
    pinecone: {
        apiKey: process.env.PINECONE_API_KEY,
        environment: process.env.PINECONE_ENVIRONMENT,
        indexName: process.env.PINECONE_INDEX,
    },
    gemini: {
        apiKey: process.env.GOOGLE_API_KEY,
    },
    upload: {
        maxFileSize: 5 * 1024 * 1024, // 5MB
        maxFiles: 5,
        allowedMimeTypes: [
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'text/plain',
            'text/markdown'
        ],
        uploadDir: 'uploads/'
    },
    chunkSize: 1000,
    chunkOverlap: 200,
    aws: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        region: process.env.AWS_REGION,
        bucketName: process.env.S3_BUCKET_NAME
    }
};
