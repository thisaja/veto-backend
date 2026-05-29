import * as argon2 from "argon2";
import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import db from "../config/db";

const loginUser = async (req: Request, res: Response) => {
  try {
    const { Email, Password } = req.body;

    if (!Email || !Password) {
      return res.status(400).send({ message: "Email and password required" });
    }

    const result = await db.query(
      "SELECT UserID, Password, DiningAlias FROM Users WHERE Email = $1",
      [Email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      return res.status(401).send({ message: "User not found" });
    }

    const { userid: userId, password: hashedPassword, diningalias: diningAlias } = result.rows[0];

    if (!(await argon2.verify(hashedPassword, Password))) {
      return res.status(401).send({ message: "Incorrect password" });
    }

    const secret = String(process.env.JWT_SECRET);
    const token = jwt.sign({ UserID: userId }, secret, { expiresIn: "7d" });

    return res.send({ message: "Logged in successfully", userId, access_token: token, diningAlias });
  } catch (error) {
    console.error("Error logging in:", error);
    return res.status(500).send({ message: "Error logging in" });
  }
};

export { loginUser };
