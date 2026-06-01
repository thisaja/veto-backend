import express from "express";
const router = express.Router();
const { getQuestion } = require("../controllers/geminiQController");
const { getRestaurant } = require("../controllers/geminiRController");
const { getQuestionsAndAnswers } = require("../controllers/getQAController");
const { submitAnswer } = require("../controllers/getQAController");
 
router.route("/question").get(getQuestion);
router.route("/restaurant").post(getRestaurant);
router.route("/getQA").get(getQuestionsAndAnswers);
router.route("/submitAnswer").post(submitAnswer);

export default router;
