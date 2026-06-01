import express from "express";
import multer from "multer";
import { protect } from "../middleware/authMiddleware";
import {
  getProfile,
  updateProfile,
  changePassword,
  deleteAccount,
} from "../controllers/profileController";

const upload = multer({ dest: "uploads/" });
const router = express.Router();

router.get("/:userId",                    getProfile);
router.patch("/:userId", protect, upload.single("photo"), updateProfile);
router.patch("/:userId/password", protect, changePassword);
router.delete("/:userId", protect,        deleteAccount);

export default router;
