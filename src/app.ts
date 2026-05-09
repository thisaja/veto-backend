import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import userRoutes from "./routes/userRoutes";
import geminiAPI from "./routes/geminiRoutes";
import { notFound, errorHandler } from "./utils/errorHandler";


const app = express();
app.use(cors());
app.use(express.json());


app.use("/api/users", userRoutes);
app.use("/api/gemini", geminiAPI);
app.use(notFound);
app.use(errorHandler);

export default app;
