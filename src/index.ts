
import { config as DotEnvConfig } from "dotenv";
DotEnvConfig();
import express from "express";
import ModuleRouter from "./endpoints/modules/routes.js";


const app = express();


app.use(express.json());

app.use("/company", ModuleRouter);

const PORT = process.env.PORT || 1337;



app.listen(PORT, () => console.log(`app is running on http://localhost:${PORT}`));
