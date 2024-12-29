import { S3Loader } from "@langchain/community/document_loaders/web/s3";
import { config } from "./index.js";

export function s3Loader(key: string)
{
    console.log("aws", config.aws);
    const loader = new S3Loader({
        bucket: config.aws.bucketName as string,
        key,
        s3Config: {
            region: config.aws.region as string,
            credentials: {
                accessKeyId: config.aws.accessKeyId as string,
                secretAccessKey: config.aws.secretAccessKey as string
            }
        },
        unstructuredAPIURL: "https://api.unstructuredapp.io/general/v0/general",
        unstructuredAPIKey: "ob9MVwjCXubXkwIvQPi0N9vDx4juI2",

    });

    console.log("This is the loader", loader);

    return loader;
}
