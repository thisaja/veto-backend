import { RequestHandler } from "express";
import jwt from "jsonwebtoken";

// Extend Express Request so downstream handlers can read req.userId
declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

const protect: RequestHandler = (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({ success: false, message: "No token provided" });
    return;
  }
  try {
    const token = auth.split(" ")[1];
    const secret = String(process.env.JWT_SECRET);
    const decoded = jwt.verify(token, secret) as { UserID: string };
    req.userId = decoded.UserID;
    next();
  } catch {
    res.status(401).json({ success: false, message: "Invalid or expired token" });
  }
};

const admin: RequestHandler = (req, res, next) => {
  // Placeholder — add role check here when roles are added
  next();
};

export { protect, admin };
