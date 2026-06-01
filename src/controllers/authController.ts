import * as argon2 from "argon2";
import jwt from "jsonwebtoken";
import { Resend } from "resend";
import { Request, Response } from "express";
import db from "../config/db";

const resend = new Resend(process.env.RESEND_API_KEY);

// Ensure the PasswordResets table exists on first use
async function ensureTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS PasswordResets (
      id         SERIAL PRIMARY KEY,
      user_id    UUID        NOT NULL,
      otp        CHAR(6)     NOT NULL,
      expires_at TIMESTAMP   NOT NULL,
      used       BOOLEAN     DEFAULT false,
      created_at TIMESTAMP   DEFAULT NOW()
    )
  `);
}
ensureTable().catch(err => console.error("PasswordResets table init error:", err));

// ── POST /auth/forgot-password ────────────────────────────────────────────────
// Body: { email }
// Generates a 6-digit OTP, stores it, and emails it via Resend.
export const forgotPassword = async (req: Request, res: Response) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ success: false, message: "Email is required" });
  }

  try {
    const userResult = await db.query(
      "SELECT UserID, FirstName FROM Users WHERE LOWER(Email) = LOWER($1)",
      [email.trim()]
    );

    // Always return success — never reveal whether the email exists
    if (userResult.rows.length === 0) {
      return res.json({ success: true });
    }

    const { userid: userId, firstname: firstName } = userResult.rows[0];

    // Invalidate any existing unused OTPs for this user
    await db.query(
      "UPDATE PasswordResets SET used = true WHERE user_id = $1 AND used = false",
      [userId]
    );

    // Generate a new 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    await db.query(
      "INSERT INTO PasswordResets (user_id, otp, expires_at) VALUES ($1, $2, $3)",
      [userId, otp, expiresAt]
    );

    await resend.emails.send({
      from: process.env.EMAIL_FROM ?? "Veto <onboarding@resend.dev>",
      to: email.trim(),
      subject: "Your Veto password reset code",
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px">
          <h2 style="margin-bottom:8px">Reset your Veto password</h2>
          <p style="color:#555">Hi ${firstName ?? "there"},</p>
          <p style="color:#555">Use the code below to reset your password. It expires in <strong>15 minutes</strong>.</p>
          <div style="font-size:40px;font-weight:700;letter-spacing:12px;text-align:center;
                      padding:24px;background:#f0eeea;border-radius:12px;margin:24px 0">
            ${otp}
          </div>
          <p style="color:#999;font-size:13px">If you didn't request this, you can safely ignore this email.</p>
        </div>
      `,
    });
    console.log(`[DEV] Password reset OTP for ${email}: ${otp}`);

    return res.json({ success: true });
  } catch (err) {
    console.error("forgotPassword error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// ── POST /auth/verify-otp ─────────────────────────────────────────────────────
// Body: { email, otp }
// Validates the OTP, marks it used, and returns a short-lived reset token.
export const verifyOtp = async (req: Request, res: Response) => {
  const { email, otp } = req.body;
  if (!email || !otp) {
    return res.status(400).json({ success: false, message: "Email and code are required" });
  }

  try {
    const userResult = await db.query(
      "SELECT UserID FROM Users WHERE LOWER(Email) = LOWER($1)",
      [email.trim()]
    );
    if (userResult.rows.length === 0) {
      return res.status(400).json({ success: false, message: "Invalid code" });
    }

    const userId = userResult.rows[0].userid;

    const otpResult = await db.query(
      `SELECT id FROM PasswordResets
       WHERE user_id = $1 AND otp = $2 AND used = false AND expires_at > NOW()
       LIMIT 1`,
      [userId, otp.trim()]
    );

    if (otpResult.rows.length === 0) {
      return res.status(400).json({ success: false, message: "Incorrect or expired code. Please try again." });
    }

    // Mark OTP as used so it can't be reused
    await db.query("UPDATE PasswordResets SET used = true WHERE id = $1", [otpResult.rows[0].id]);

    // Issue a short-lived password-reset JWT (10 minutes)
    const secret = String(process.env.JWT_SECRET);
    const resetToken = jwt.sign({ userId, type: "password_reset" }, secret, { expiresIn: "10m" });

    return res.json({ success: true, resetToken });
  } catch (err) {
    console.error("verifyOtp error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// ── POST /auth/reset-password ─────────────────────────────────────────────────
// Body: { resetToken, newPassword }
// Verifies the reset token and updates the user's password.
export const resetPassword = async (req: Request, res: Response) => {
  const { resetToken, newPassword } = req.body;
  if (!resetToken || !newPassword) {
    return res.status(400).json({ success: false, message: "Token and new password are required" });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ success: false, message: "Password must be at least 6 characters" });
  }

  try {
    const secret = String(process.env.JWT_SECRET);
    const payload = jwt.verify(resetToken, secret) as { userId: string; type: string };

    if (payload.type !== "password_reset") {
      return res.status(400).json({ success: false, message: "Invalid token" });
    }

    const hashed = await argon2.hash(newPassword);
    await db.query("UPDATE Users SET Password = $1 WHERE UserID = $2", [hashed, payload.userId]);

    return res.json({ success: true, message: "Password updated successfully" });
  } catch (err: any) {
    if (err.name === "TokenExpiredError") {
      return res.status(400).json({ success: false, message: "Reset session expired. Please start again." });
    }
    console.error("resetPassword error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};
