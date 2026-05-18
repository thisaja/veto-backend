import dotenv from "dotenv";
dotenv.config();

import express from "express";
import userRoutes from "./routes/userRoutes";
import geminiRoutes from "./routes/geminiRoutes";
import { notFound, errorHandler } from "./utils/errorHandler";

const app = express();
// app.use(cors({
//     origin: "https://localhost:5000", 
//     credentials: true,
// }));
app.use(express.json());

app.use("/api/users", userRoutes);
app.use("/api/gemini", geminiRoutes);
app.use(notFound);
app.use(errorHandler);

export default app;