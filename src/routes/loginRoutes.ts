import express from "express";
import { protect, admin } from "../middleware/authMiddleware";
import { loginUser } from "../controllers/loginController";

const router = express.Router();
router.route("/").post(protect, admin, loginUser);


export default router;
