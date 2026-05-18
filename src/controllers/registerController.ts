import { Request, Response } from "express";
import db from "../config/db";
import User from "../models/userModel";
import * as argon2 from "argon2";
import jwt from "jsonwebtoken"


const registerUser = async (req: Request, res: Response) => {
  try {
    // Parsing payload
    const user = JSON.parse(req.body.user) as User;

    // Hashing password
    const hashedPassword = await argon2.hash(user.Password)
    
    // Creating new user
    const query = "INSERT INTO Users (FirstName, LastName, Email, Password, DiningAlias, ProfilePicture, Dealbreakers) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING UserID";
    const values = [user.FirstName, user.LastName, user.Email.toLowerCase(), hashedPassword, user.DiningAlias, req.file?.filename, JSON.stringify(user.Dealbreakers)]
    const result = await db.query(query, values);

    // Creating JWT
    const UserID = result.rows[0].userid
    const payload = {UserID: UserID}
    const secret = String(process.env.JWT_SECRET)
    const token = jwt.sign(payload, secret, {
        expiresIn: "15m"
    })
    res.send({message: "registered successfully", access_token: token})
    console.log(`inserted user ${UserID}`)
  }
  catch (error) {
      res.status(500).send({message: "error inserting user"});
      console.error("error inserting user", error);
  }
}

export { registerUser };
