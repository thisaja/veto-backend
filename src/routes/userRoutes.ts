import express from "express";
const router = express.Router();
const { getUsers } = require("../controllers/userController");
const { protect, admin } = require("../middleware/authMiddleware");

router.route("/").get(protect, admin, getUsers);

export default router;
