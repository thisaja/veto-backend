import express from "express";
import {
  createSession,
  joinSession,
  getSessionMembers,
  validateSession,
  getSessionHistory,
  inviteFriend,
} from "../controllers/sessionController";

const router = express.Router();

router.post("/create",              createSession);
router.post("/join",                joinSession);
router.post("/invite",              inviteFriend);
router.get("/validate/:code",       validateSession);
router.get("/history/:userId",      getSessionHistory);
router.get("/:sessionId/members",   getSessionMembers);

export default router;
