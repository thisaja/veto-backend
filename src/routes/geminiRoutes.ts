import express from "express";
const router = express.Router();
const { getGemini } = require("../controllers/geminiController");

router.route("/").get(getGemini);

export default router;
