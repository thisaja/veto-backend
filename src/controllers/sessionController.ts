import { Request, Response } from "express";
import db from "../config/db";

const createSession = async (req: Request, res: Response) => {
  try {
    const { userId, guestId } = req.body;

    if (!userId && !guestId) {
      return res.status(400).json({
        success: false,
        message: "Either userId or guestId is required",
      });
    }

    const result = await db.query(
      `INSERT INTO Sessions (UserID, GuestID, CreatedAt, Status)
       VALUES ($1, $2, NOW(), 'active')
       RETURNING session_id`,
      [userId ?? null, guestId ?? null]
    );

    const sessionId = result.rows[0].session_id;
    console.log(`Created session ${sessionId} for ${userId ? `user ${userId}` : `guest ${guestId}`}`);

    return res.status(201).json({ success: true, sessionId });
  } catch (error) {
    console.error("Error creating session:", error);
    return res.status(500).json({
      success: false,
      message: "Error creating session",
      error: String(error),
    });
  }
};

export { createSession };
