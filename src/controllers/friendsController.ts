import { Request, Response } from "express";
import db from "../config/db";
import { notifyUser } from "../sockets/notificationSocket";

// ── Helper: safe dealbreaker parse ──────────────────────────────────────────
function parseDealbreakers(raw: any): number[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") { try { return JSON.parse(raw); } catch {} }
  return [];
}

// ── GET /api/friends/:userId ─────────────────────────────────────────────────
// Returns all accepted friends with their profile info
const getFriends = async (req: Request, res: Response) => {
  const { userId } = req.params;
  try {
    const result = await db.query(
      `SELECT
         f.id             AS "friendshipId",
         f.created_at     AS "friendsSince",
         u.UserID         AS "userId",
         u.FirstName      AS "firstName",
         u.LastName       AS "lastName",
         u.DiningAlias    AS "diningAlias",
         u.ProfilePicture AS "profilePicture",
         u.Dealbreakers   AS dealbreakers
       FROM Friendships f
       JOIN Users u ON (
         CASE WHEN f.requester_id = $1 THEN f.addressee_id ELSE f.requester_id END = u.UserID
       )
       WHERE (f.requester_id = $1 OR f.addressee_id = $1)
         AND f.status = 'accepted'
       ORDER BY u.FirstName`,
      [userId]
    );
    const friends = result.rows.map(r => ({
      ...r,
      dealbreakers: parseDealbreakers(r.dealbreakers),
    }));
    return res.json({ success: true, data: friends });
  } catch (err) {
    console.error("getFriends error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// ── GET /api/friends/:userId/requests ────────────────────────────────────────
// Returns pending incoming requests (others requesting THIS user)
const getFriendRequests = async (req: Request, res: Response) => {
  const { userId } = req.params;
  try {
    const result = await db.query(
      `SELECT
         f.id          AS "friendshipId",
         f.created_at  AS "requestedAt",
         u.UserID      AS "userId",
         u.FirstName   AS "firstName",
         u.LastName    AS "lastName",
         u.DiningAlias AS "diningAlias",
         u.ProfilePicture AS "profilePicture",
         u.Dealbreakers   AS dealbreakers
       FROM Friendships f
       JOIN Users u ON f.requester_id = u.UserID
       WHERE f.addressee_id = $1 AND f.status = 'pending'
       ORDER BY f.created_at DESC`,
      [userId]
    );
    const requests = result.rows.map(r => ({
      ...r,
      dealbreakers: parseDealbreakers(r.dealbreakers),
    }));
    return res.json({ success: true, data: requests });
  } catch (err) {
    console.error("getFriendRequests error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// ── GET /api/friends/search?q=&userId= ───────────────────────────────────────
// Search users by name or alias; excludes self and existing friends/requests
const searchUsers = async (req: Request, res: Response) => {
  const { q, userId } = req.query as { q: string; userId: string };
  // Strip leading @ so searching "@spicytaco" matches "spicytaco"
  const rawQ = (q ?? "").trim().replace(/^@/, "");
  if (!rawQ || rawQ.length < 2) {
    return res.json({ success: true, data: [] });
  }
  try {
    const result = await db.query(
      `SELECT
         u.UserID         AS "userId",
         u.FirstName      AS "firstName",
         u.LastName       AS "lastName",
         u.DiningAlias    AS "diningAlias",
         u.ProfilePicture AS "profilePicture",
         u.Dealbreakers   AS dealbreakers,
         f.status         AS "friendshipStatus",
         f.id             AS "friendshipId",
         f.requester_id   AS "requesterId"
       FROM Users u
       LEFT JOIN Friendships f
         ON (f.requester_id = u.UserID AND f.addressee_id = $2)
         OR (f.addressee_id = u.UserID AND f.requester_id = $2)
       WHERE u.UserID <> $2
         AND LOWER(u.DiningAlias) LIKE LOWER($1)
       LIMIT 20`,
      [`%${rawQ}%`, userId]
    );
    const users = result.rows.map(r => ({
      ...r,
      dealbreakers: parseDealbreakers(r.dealbreakers),
    }));
    return res.json({ success: true, data: users });
  } catch (err) {
    console.error("searchUsers error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// ── POST /api/friends/request ────────────────────────────────────────────────
// Body: { addresseeId }   (requesterId comes from JWT via req.userId)
const sendFriendRequest = async (req: Request, res: Response) => {
  const requesterId = req.userId!;
  const { addresseeId } = req.body;

  if (!addresseeId) {
    return res.status(400).json({ success: false, message: "addresseeId required" });
  }
  if (requesterId === addresseeId) {
    return res.status(400).json({ success: false, message: "Cannot friend yourself" });
  }

  try {
    // Check existing relationship in either direction
    const existing = await db.query(
      `SELECT id, status FROM Friendships
       WHERE (requester_id = $1 AND addressee_id = $2)
          OR (requester_id = $2 AND addressee_id = $1)`,
      [requesterId, addresseeId]
    );

    if (existing.rows.length > 0) {
      const { status } = existing.rows[0];
      if (status === "accepted") {
        return res.status(409).json({ success: false, message: "Already friends" });
      }
      if (status === "pending") {
        return res.status(409).json({ success: false, message: "Request already pending" });
      }
      // If declined, allow re-sending by updating the row
      await db.query(
        `UPDATE Friendships
         SET requester_id = $1, addressee_id = $2, status = 'pending', updated_at = NOW()
         WHERE id = $3`,
        [requesterId, addresseeId, existing.rows[0].id]
      );
      notifyUser(addresseeId, "friend_request");
      return res.status(201).json({ success: true, message: "Friend request sent", friendshipId: existing.rows[0].id });
    }

    const inserted = await db.query(
      `INSERT INTO Friendships (requester_id, addressee_id, status)
       VALUES ($1, $2, 'pending')
       RETURNING id`,
      [requesterId, addresseeId]
    );
    notifyUser(addresseeId, "friend_request");
    return res.status(201).json({ success: true, message: "Friend request sent", friendshipId: inserted.rows[0].id });
  } catch (err) {
    console.error("sendFriendRequest error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// ── POST /api/friends/request/:friendshipId/accept ──────────────────────────
const acceptFriendRequest = async (req: Request, res: Response) => {
  const { friendshipId } = req.params;
  const userId = req.userId!;

  try {
    const result = await db.query(
      `UPDATE Friendships
       SET status = 'accepted', updated_at = NOW()
       WHERE id = $1 AND addressee_id = $2 AND status = 'pending'
       RETURNING id`,
      [friendshipId, userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Request not found or already handled" });
    }
    return res.json({ success: true, message: "Friend request accepted" });
  } catch (err) {
    console.error("acceptFriendRequest error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// ── POST /api/friends/request/:friendshipId/decline ─────────────────────────
const declineFriendRequest = async (req: Request, res: Response) => {
  const { friendshipId } = req.params;
  const userId = req.userId!;

  try {
    const result = await db.query(
      `UPDATE Friendships
       SET status = 'declined', updated_at = NOW()
       WHERE id = $1 AND addressee_id = $2 AND status = 'pending'
       RETURNING id`,
      [friendshipId, userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Request not found or already handled" });
    }
    return res.json({ success: true, message: "Friend request declined" });
  } catch (err) {
    console.error("declineFriendRequest error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// ── DELETE /api/friends/:friendshipId ────────────────────────────────────────
const removeFriend = async (req: Request, res: Response) => {
  const { friendshipId } = req.params;
  const userId = req.userId!;

  try {
    const result = await db.query(
      `DELETE FROM Friendships
       WHERE id = $1
         AND (requester_id = $2 OR addressee_id = $2)
         AND status = 'accepted'
       RETURNING id`,
      [friendshipId, userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Friendship not found" });
    }
    return res.json({ success: true, message: "Friend removed" });
  } catch (err) {
    console.error("removeFriend error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// ── GET /api/friends/:userId/sent ────────────────────────────────────────────
// Returns pending outgoing requests (sent BY this user, not yet accepted)
const getSentRequests = async (req: Request, res: Response) => {
  const { userId } = req.params;
  try {
    const result = await db.query(
      `SELECT
         f.id          AS "friendshipId",
         f.created_at  AS "sentAt",
         u.UserID      AS "userId",
         u.FirstName   AS "firstName",
         u.LastName    AS "lastName",
         u.DiningAlias AS "diningAlias",
         u.ProfilePicture AS "profilePicture"
       FROM Friendships f
       JOIN Users u ON f.addressee_id = u.UserID
       WHERE f.requester_id = $1 AND f.status = 'pending'
       ORDER BY f.created_at DESC`,
      [userId]
    );
    return res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error("getSentRequests error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// ── DELETE /api/friends/request/:friendshipId ────────────────────────────────
// Cancel an outgoing pending request (requester only)
const cancelFriendRequest = async (req: Request, res: Response) => {
  const { friendshipId } = req.params;
  const userId = req.userId!;
  try {
    const result = await db.query(
      `DELETE FROM Friendships
       WHERE id = $1 AND requester_id = $2 AND status = 'pending'
       RETURNING id`,
      [friendshipId, userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Request not found" });
    }
    return res.json({ success: true, message: "Request cancelled" });
  } catch (err) {
    console.error("cancelFriendRequest error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

export {
  getFriends,
  getFriendRequests,
  getSentRequests,
  searchUsers,
  sendFriendRequest,
  acceptFriendRequest,
  declineFriendRequest,
  cancelFriendRequest,
  removeFriend,
};
