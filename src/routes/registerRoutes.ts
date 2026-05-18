import express from "express";
import { registerUser } from "../controllers/registerController";
import { protect, admin } from "../middleware/authMiddleware";
import multer from "multer"

const upload = multer({dest: "uploads/"})

const router = express.Router();
router.route("/").post(upload.single("photo"), protect, admin, registerUser);


export default router;
