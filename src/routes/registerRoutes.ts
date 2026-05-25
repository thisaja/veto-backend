import express from "express";
import { registerUser } from "../controllers/registerController";
import { protect, admin } from "../middleware/authMiddleware";
import multer from "multer"
import crypto from "crypto"
import mime from "mime";

const storage = multer.diskStorage({
    destination: "uploads/",
    filename: (req, file, callback) => {
        const filename = `${crypto.randomUUID()}.${mime.extension(file.mimetype)}`;
        callback(null, filename)    
    }
})
const upload = multer({storage: storage})

const router = express.Router();
router.route("/").post(upload.single("photo"), protect, admin, registerUser);


export default router;
