import dotenv from "dotenv";
dotenv.config();

import express from "express";
import sessionRoutes from "./routes/sessionRoutes";
import geminiRoutes from "./routes/geminiRoutes";
import placesRoutes from "./routes/placesRoutes";
import { notFound, errorHandler } from "./utils/errorHandler";
import loginRoutes from "./routes/loginRoutes";
import registerRoutes from "./routes/registerRoutes";

const app = express();
app.use(express.json());

app.use("/api/gemini", geminiRoutes);
app.use("/api/places", placesRoutes);
app.use("/register", registerRoutes);
app.use("/login", loginRoutes);
app.use("/session", sessionRoutes)
app.use(notFound);
app.use(errorHandler);

export default app;