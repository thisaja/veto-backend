import express from "express";
import { forgotPassword, verifyOtp, resetPassword } from "../controllers/authController";

const router = express.Router();

router.post("/forgot-password", forgotPassword);
router.post("/verify-otp",      verifyOtp);
router.post("/reset-password",  resetPassword);

export default router;
