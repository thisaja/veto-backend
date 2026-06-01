import { Request, Response } from "express";
import db from "../config/db";
import User from "../models/userModel";
import * as argon2 from "argon2";
import jwt from "jsonwebtoken"

// ── Auto-generate a username if the user skips the step ─────────────────────
const ALIAS_ADJECTIVES = ["crispy","golden","spicy","savory","smoky","tangy","silky","zesty","bold","midnight","salty","sweet","crunchy","melty","fluffy","smoky","fiery","creamy"];
const ALIAS_FOODS      = ["noodle","truffle","dumpling","ramen","taco","sushi","brisket","croissant","gyoza","kimchi","fondue","pretzel","waffle","burrito","tempura","risotto","pierogi","nacho"];

function generateAlias(): string {
  const adj  = ALIAS_ADJECTIVES[Math.floor(Math.random() * ALIAS_ADJECTIVES.length)];
  const food = ALIAS_FOODS[Math.floor(Math.random() * ALIAS_FOODS.length)];
  const num  = Math.floor(1000 + Math.random() * 9000);
  return `${adj}-${food}-${num}`;
}

const registerUser = async (req: Request, res: Response) => {
  try {
    // Parsing payload
    const user = JSON.parse(req.body.user) as User;

    // Use provided alias or auto-generate one
    const diningAlias = (user.DiningAlias ?? "").trim() || generateAlias();

    // Hashing password
    const hashedPassword = await argon2.hash(user.Password)

    // Resolve profile picture: uploaded file takes precedence over a preset key
    const profilePicture = req.file?.filename ?? (user as any).PresetAvatar ?? null;

    // Creating new user
    const query = "INSERT INTO Users (FirstName, LastName, Email, Password, DiningAlias, ProfilePicture, Dealbreakers) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING UserID";
    const values = [user.FirstName, user.LastName, user.Email.toLowerCase(), hashedPassword, diningAlias, profilePicture, JSON.stringify(user.Dealbreakers)]
    const result = await db.query(query, values);

    // Creating JWT
    const UserID = result.rows[0].userid
    const payload = {UserID: UserID}
    const secret = String(process.env.JWT_SECRET)
    const token = jwt.sign(payload, secret, {
        expiresIn: "15m"
    })
    res.send({ message: "registered successfully", userId: UserID, access_token: token, diningAlias })
    console.log(`inserted user ${UserID}`)
  }
  catch (error: any) {
    // Unique-constraint violation (PostgreSQL code 23505)
    if (error?.code === "23505") {
      if (error.detail?.toLowerCase().includes("diningalias")) {
        return res.status(409).send({ message: "That username is already taken. Please choose another." });
      }
      if (error.detail?.toLowerCase().includes("email")) {
        return res.status(409).send({ message: "An account with that email already exists." });
      }
    }
    res.status(500).send({ message: "error inserting user" });
    console.error("error inserting user", error);
  }
}

export { registerUser };
