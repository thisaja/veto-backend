import { Request, Response } from "express";
import db from "../config/db";
import * as argon2 from "argon2";

// ── GET /api/profile/:userId ─────────────────────────────────────────────────
const getProfile = async (req: Request, res: Response) => {
  const { userId } = req.params;
  try {
    const result = await db.query(
      `SELECT
         UserID       AS "userId",
         FirstName    AS "firstName",
         LastName     AS "lastName",
         Email        AS email,
         DiningAlias  AS "diningAlias",
         ProfilePicture AS "profilePicture",
         Dealbreakers AS dealbreakers
       FROM Users
       WHERE UserID = $1`,
      [userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    const user = result.rows[0];
    // Parse dealbreakers if stored as JSON string
    if (typeof user.dealbreakers === "string") {
      try { user.dealbreakers = JSON.parse(user.dealbreakers); } catch { user.dealbreakers = []; }
    }
    return res.json({ success: true, data: user });
  } catch (err) {
    console.error("getProfile error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// ── PATCH /api/profile/:userId ───────────────────────────────────────────────
// Body: { firstName?, lastName?, diningAlias?, dealbreakers?: number[] }
// Photo: multipart field "photo" handled by multer in the route
const updateProfile = async (req: Request, res: Response) => {
  const { userId } = req.params;

  // Only the authenticated user can edit their own profile
  if (req.userId !== userId) {
    return res.status(403).json({ success: false, message: "Forbidden" });
  }

  const { firstName, lastName, diningAlias, dealbreakers, presetAvatar } = req.body;
  // Uploaded file takes precedence; preset key is a fallback when no file is sent
  const photoFilename = (req as any).file?.filename ?? presetAvatar ?? undefined;

  // Build dynamic SET clause from provided fields
  const fields: string[] = [];
  const values: any[] = [];
  let idx = 1;

  if (firstName !== undefined)  { fields.push(`FirstName = $${idx++}`);    values.push(firstName); }
  if (lastName !== undefined)   { fields.push(`LastName = $${idx++}`);     values.push(lastName); }
  if (diningAlias !== undefined){ fields.push(`DiningAlias = $${idx++}`);  values.push(diningAlias); }
  if (dealbreakers !== undefined) {
    fields.push(`Dealbreakers = $${idx++}`);
    values.push(JSON.stringify(
      Array.isArray(dealbreakers) ? dealbreakers : JSON.parse(dealbreakers)
    ));
  }
  if (photoFilename)            { fields.push(`ProfilePicture = $${idx++}`); values.push(photoFilename); }

  if (fields.length === 0) {
    return res.status(400).json({ success: false, message: "No fields to update" });
  }

  values.push(userId);

  try {
    const result = await db.query(
      `UPDATE Users SET ${fields.join(", ")} WHERE UserID = $${idx}
       RETURNING
         UserID AS "userId", FirstName AS "firstName", LastName AS "lastName",
         Email AS email, DiningAlias AS "diningAlias",
         ProfilePicture AS "profilePicture", Dealbreakers AS dealbreakers`,
      values
    );
    const user = result.rows[0];
    if (typeof user.dealbreakers === "string") {
      try { user.dealbreakers = JSON.parse(user.dealbreakers); } catch { user.dealbreakers = []; }
    }
    return res.json({ success: true, data: user });
  } catch (err) {
    console.error("updateProfile error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// ── PATCH /api/profile/:userId/password ──────────────────────────────────────
// Body: { currentPassword, newPassword }
const changePassword = async (req: Request, res: Response) => {
  const { userId } = req.params;
  if (req.userId !== userId) {
    return res.status(403).json({ success: false, message: "Forbidden" });
  }
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ success: false, message: "Both passwords required" });
  }
  try {
    const result = await db.query(
      "SELECT Password FROM Users WHERE UserID = $1",
      [userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    const valid = await argon2.verify(result.rows[0].password, currentPassword);
    if (!valid) {
      return res.status(401).json({ success: false, message: "Current password is incorrect" });
    }
    const hashed = await argon2.hash(newPassword);
    await db.query("UPDATE Users SET Password = $1 WHERE UserID = $2", [hashed, userId]);
    return res.json({ success: true, message: "Password updated" });
  } catch (err) {
    console.error("changePassword error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// ── DELETE /api/profile/:userId ──────────────────────────────────────────────
const deleteAccount = async (req: Request, res: Response) => {
  const { userId } = req.params;
  if (req.userId !== userId) {
    return res.status(403).json({ success: false, message: "Forbidden" });
  }
  try {
    await db.query("DELETE FROM Users WHERE UserID = $1", [userId]);
    return res.json({ success: true, message: "Account deleted" });
  } catch (err) {
    console.error("deleteAccount error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

export { getProfile, updateProfile, changePassword, deleteAccount };
