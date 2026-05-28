import express from "express";
import { createSession } from "../controllers/sessionController";

const router = express.Router();
router.route("/create").post(createSession);

export default router;
