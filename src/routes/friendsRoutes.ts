import express from "express";
import { protect } from "../middleware/authMiddleware";
import {
  getFriends,
  getFriendRequests,
  getSentRequests,
  searchUsers,
  sendFriendRequest,
  acceptFriendRequest,
  declineFriendRequest,
  cancelFriendRequest,
  removeFriend,
} from "../controllers/friendsController";

const router = express.Router();

// Search must come before /:userId to avoid route collision
router.get("/search",                          searchUsers);

router.get("/:userId",                         getFriends);
router.get("/:userId/requests",                getFriendRequests);
router.get("/:userId/sent",                    getSentRequests);

router.post("/request",          protect,      sendFriendRequest);
router.post("/request/:friendshipId/accept",  protect, acceptFriendRequest);
router.post("/request/:friendshipId/decline", protect, declineFriendRequest);
// Cancel must be before /:friendshipId so "request" isn't matched as an id
router.delete("/request/:friendshipId", protect, cancelFriendRequest);
router.delete("/:friendshipId",  protect,      removeFriend);

export default router;
