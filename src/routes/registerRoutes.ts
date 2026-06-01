import express from "express";
import multer from "multer";
import { registerUser } from "../controllers/registerController";

const upload = multer({ dest: "uploads/" });

const router = express.Router();
router.route("/").post(upload.single("photo"), registerUser);

export default router;
