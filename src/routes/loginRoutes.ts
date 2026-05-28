import express from "express";
import { loginUser } from "../controllers/loginController";

const router = express.Router();
router.route("/").post(loginUser);

export default router;
