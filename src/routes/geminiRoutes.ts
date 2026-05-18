import express from "express";
const router = express.Router();
const { getQuestion } = require("../controllers/geminiQController");
const { getRestaurant } = require("../controllers/geminiRController");
 
router.route("/question").post(getQuestion);
router.route("/restaurant").post(getRestaurant);
 
/**
router.route.post("/", (req, res) => {
  res.send("i love coding");
});
 */

export default router;
