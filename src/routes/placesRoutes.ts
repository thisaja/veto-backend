import express from "express";
import { searchRestaurants } from "../controllers/placesController";

const router = express.Router();
router.route("/search").post(searchRestaurants);

export default router;
