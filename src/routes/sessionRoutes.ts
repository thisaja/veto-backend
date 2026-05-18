import express from "express"
import {protect, admin} from "../middleware/authMiddleware"
import { createSession } from "../controllers/sessionController"

const router = express.Router()
router.route("/create").post(protect, admin, createSession)

export default router