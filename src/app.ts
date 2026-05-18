import dotenv from "dotenv";
dotenv.config();

import express from "express";
import sessionRoutes from "./routes/sessionRoutes";
import userRoutes from "./routes/userRoutes";
import geminiRoutes from "./routes/geminiRoutes";
import { notFound, errorHandler } from "./utils/errorHandler";

const app = express();
app.use(express.json());

app.use("/api/gemini", geminiRoutes);
app.use("/user", userRoutes);
app.use("/session", sessionRoutes)
app.use(notFound);
app.use(errorHandler);

export default app;