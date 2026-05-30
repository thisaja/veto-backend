import dotenv from "dotenv";
dotenv.config();

import express from "express";
import path from "path";
import sessionRoutes  from "./routes/sessionRoutes";
import geminiRoutes   from "./routes/geminiRoutes";
import placesRoutes   from "./routes/placesRoutes";
import loginRoutes    from "./routes/loginRoutes";
import registerRoutes from "./routes/registerRoutes";
import profileRoutes  from "./routes/profileRoutes";
import friendsRoutes  from "./routes/friendsRoutes";
import authRoutes     from "./routes/authRoutes";
import { notFound, errorHandler } from "./utils/errorHandler";

const app = express();
app.use(express.json());

// Serve uploaded profile photos statically
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

app.use("/api/gemini",  geminiRoutes);
app.use("/api/places",  placesRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/friends", friendsRoutes);
app.use("/register",    registerRoutes);
app.use("/login",       loginRoutes);
app.use("/auth",        authRoutes);
app.use("/session",     sessionRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;