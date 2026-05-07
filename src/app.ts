import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import userRoutes from "./routes/userRoutes";
import { notFound, errorHandler } from "./utils/errorHandler";

dotenv.config();


const app = express();
app.use(cors());
app.use(express.json());


app.use("/api/users", userRoutes);
app.use(notFound);
app.use(errorHandler);

export default app;
