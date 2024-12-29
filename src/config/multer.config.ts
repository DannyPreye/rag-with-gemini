import multer from "multer";
import multerS3 from "multer-s3";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import path from "path";
import fs from "fs/promises";
import os from "os";
import { NextFunction, Request, Response } from "express";
import { config } from "../config/index.js";

// Initialize S3 client
const s3Client = new S3Client({
    region: config.aws.region as string,
    credentials: {
        accessKeyId: config.aws.accessKeyId as string,
        secretAccessKey: config.aws.secretAccessKey as string
    }
});

// Configure temporary storage
const tempStorage = multer.diskStorage({
    destination: async (req, file, cb) =>
    {
        const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'doc-processor-'));
        cb(null, tempDir);
    },
    filename: (req, file, cb) =>
    {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const fileFilter = (
    req: Request,
    file: Express.Multer.File,
    callback: multer.FileFilterCallback
) =>
{
    if (!config.upload.allowedMimeTypes.includes(file.mimetype)) {
        return callback(new Error(`Invalid file type. Allowed types: ${config.upload.allowedMimeTypes.join(', ')}`));
    }
    callback(null, true);
};

// Configure multer to use temporary storage
export const upload = multer({
    storage: tempStorage,
    fileFilter: fileFilter,
    limits: {
        fileSize: config.upload.maxFileSize,
        files: config.upload.maxFiles
    }
});

// Function to upload file to S3
export async function uploadToS3(filePath: string, originalname: string, namespace: string): Promise<string>
{
    const fileContent = await fs.readFile(filePath);
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const key = `documents/${namespace}/${uniqueSuffix}-${path.basename(originalname.replace(/ /g, '-'))}`;

    await s3Client.send(new PutObjectCommand({
        Bucket: config.aws.bucketName,
        Key: key,
        Body: fileContent,
        ContentType: path.extname(originalname)
    }));

    return `https://${config.aws.bucketName}.s3.${config.aws.region}.amazonaws.com/${key}`;
}

// Function to clean up temporary files
export async function cleanupTemp(filePath: string): Promise<void>
{
    try {
        await fs.unlink(filePath);
        const dirPath = path.dirname(filePath);
        console.log("This is the temp-dir from cleanup", dirPath);
        await fs.rmdir(dirPath);
    } catch (error) {
        console.error('Error cleaning up temporary files:', error);
    }
}


export const handleUploadError = (error: any, req: Request, res: Response, next: NextFunction) =>
{
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                error: `File size too large. Maximum size is ${config.upload.maxFileSize / 1024 / 1024}MB`
            });
        }
        if (error.code === 'LIMIT_FILE_COUNT') {
            return res.status(400).json({
                error: `Too many files. Maximum is ${config.upload.maxFiles} files`
            });
        }
        return res.status(400).json({ error: error.message });
    }

    if (error) {
        return res.status(400).json({ error: error.message });
    }

    next();
};
