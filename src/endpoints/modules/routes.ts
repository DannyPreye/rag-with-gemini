import { Router } from "express";
import { handleUploadError, upload } from "../../config/multer.config.js";
import { config } from "../../config/index.js";
import { CompanyModule } from "./controller";

const ModuleRouter = Router();


// @ts-ignore
ModuleRouter.post(`/process-document`, upload.array("documents", config.upload.maxFiles), handleUploadError, CompanyModule.processDocuments);

// @ts-ignore
ModuleRouter.post("/generate-response", CompanyModule.generateResult);

// @ts-ignore
ModuleRouter.post(`/generate-curriculum`, CompanyModule.generateCurriculum);

// @ts-ignore
ModuleRouter.post(`/generate-summary`, CompanyModule.generateSummary);

// @ts-ignore
ModuleRouter.put(`/refresh/:namespace`, CompanyModule.refresh);

export default ModuleRouter;
