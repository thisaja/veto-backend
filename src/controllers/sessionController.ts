import { Request, Response } from "express";
import db from "../config/db";
import { notifyUser } from "../sockets/notificationSocket";

// ── POST /session/create ─────────────────────────────────────────────────────
const createSession = async (req: Request, res: Response) => {
  try {
    const { userId, guestId, alias } = req.body;

    if (!userId && !guestId) {
      return res.status(400).json({ success: false, message: "Either userId or guestId is required" });
    }

    const result = await db.query(
      `INSERT INTO Sessions (UserID, GuestID, CreatedAt, Status)
       VALUES ($1, $2, NOW(), 'active')
       RETURNING session_id`,
      [userId ?? null, guestId ?? null]
    );
    const sessionId = result.rows[0].session_id;

    // Register the creator as the host in SessionMembers
    const memberAlias = alias ?? (userId ? "Host" : "Guest");
    await db.query(
      `INSERT INTO SessionMembers (session_id, user_id, guest_id, alias, is_host)
       VALUES ($1, $2, $3, $4, true)`,
      [sessionId, userId ?? null, guestId ?? null, memberAlias]
    );

    console.log(`Created session ${sessionId} — host: ${userId ?? guestId}`);
    return res.status(201).json({ success: true, sessionId });
  } catch (error) {
    console.error("Error creating session:", error);
    return res.status(500).json({ success: false, message: "Error creating session", error: String(error) });
  }
};

// ── POST /session/join ───────────────────────────────────────────────────────
// Body: { sessionId, userId?, guestId?, alias }
const joinSession = async (req: Request, res: Response) => {
  try {
    const { sessionId, userId, guestId, alias } = req.body;

    if (!sessionId) {
      return res.status(400).json({ success: false, message: "sessionId is required" });
    }
    if (!userId && !guestId) {
      return res.status(400).json({ success: false, message: "userId or guestId is required" });
    }

    // Verify session exists and is active
    const sessionResult = await db.query(
      `SELECT session_id, status FROM Sessions WHERE session_id = $1`,
      [sessionId]
    );
    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Session not found" });
    }
    if (sessionResult.rows[0].status !== "active") {
      return res.status(410).json({ success: false, message: "This session is no longer active" });
    }

    // Upsert member (allow re-joining without error)
    await db.query(
      `INSERT INTO SessionMembers (session_id, user_id, guest_id, alias, is_host)
       VALUES ($1, $2, $3, $4, false)
       ON CONFLICT DO NOTHING`,
      [sessionId, userId ?? null, guestId ?? null, alias ?? "Guest"]
    );

    console.log(`${alias ?? "Guest"} joined session ${sessionId}`);
    return res.status(200).json({ success: true, sessionId });
  } catch (error) {
    console.error("Error joining session:", error);
    return res.status(500).json({ success: false, message: "Error joining session", error: String(error) });
  }
};

// ── GET /session/:sessionId/members ─────────────────────────────────────────
const getSessionMembers = async (req: Request, res: Response) => {
  const { sessionId } = req.params;
  try {
    const result = await db.query(
      `SELECT id, alias, is_host AS "isHost", has_answered AS "hasAnswered", joined_at AS "joinedAt"
       FROM SessionMembers
       WHERE session_id = $1
       ORDER BY is_host DESC, joined_at ASC`,
      [sessionId]
    );
    return res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error("getSessionMembers error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// ── GET /session/validate/:code ─────────────────────────────────────────────
// Accepts either the 8-char short code (first UUID segment) or a full UUID.
const validateSession = async (req: Request, res: Response) => {
  const { code } = req.params;
  try {
    const result = await db.query(
      `SELECT session_id FROM Sessions
       WHERE (LEFT(session_id::text, 8) = $1 OR session_id::text = $1)
         AND status = 'active'
       LIMIT 1`,
      [code.toLowerCase()]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Session not found or no longer active" });
    }
    return res.json({ success: true, sessionId: result.rows[0].session_id });
  } catch (error) {
    console.error("validateSession error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// ── GET /session/history/:userId ─────────────────────────────────────────────
// Returns the 10 most recent sessions a user participated in, with matched restaurant.
const getSessionHistory = async (req: Request, res: Response) => {
  const { userId } = req.params;
  try {
    // Query Sessions directly by UserID — no SessionMembers join needed
    const result = await db.query(
      `SELECT
         s.session_id      AS "sessionId",
         s.createdat       AS "createdAt",
         r.id              AS "restaurantId",
         r.header          AS "matchedRestaurant",
         r."imageURL"      AS "imageURL",
         r.label           AS "label",
         r.caption         AS "caption",
         (SELECT COUNT(*)::int FROM SessionMembers sm WHERE sm.session_id = s.session_id) AS "memberCount"
       FROM Sessions s
       LEFT JOIN Rooms ro      ON ro.session_id = s.session_id
       LEFT JOIN Restaurants r ON r.id = ro.winner_restaurant_id
       WHERE s.userid = $1
       ORDER BY s.createdat DESC
       LIMIT 10`,
      [userId]
    );
    return res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error("getSessionHistory error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// ── POST /session/invite ─────────────────────────────────────────────────────
// Sends an in-app socket notification to a friend inviting them to join a session.
const inviteFriend = async (req: Request, res: Response) => {
  const { sessionId, hostAlias, friendUserId } = req.body;
  if (!sessionId || !friendUserId) {
    return res.status(400).json({ success: false, message: "sessionId and friendUserId required" });
  }
  try {
    notifyUser(friendUserId, "session_invite", {
      sessionId,
      hostAlias: hostAlias ?? "Someone",
      deepLink:  `veto://join/${sessionId}`,
    });
    return res.json({ success: true });
  } catch (err) {
    console.error("inviteFriend error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

export { createSession, joinSession, getSessionMembers, validateSession, getSessionHistory, inviteFriend };
