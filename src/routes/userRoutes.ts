import express from "express";
import { getUser, createUser } from "../controllers/userController";
import { protect, admin } from "../middleware/authMiddleware";
import multer from "multer"

const upload = multer({dest: "uploads/"})

const router = express.Router();
router.route("/").get(protect, admin, getUser);
router.route("/").post(upload.single("photo"), protect, admin, createUser);


export default router;
