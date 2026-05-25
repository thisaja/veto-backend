import { Request, Response } from "express";
import db from "../config/db";
import * as argon2 from "argon2";
import { generateJWT } from "../utils/auth";

const loginUser = async (req: Request, res: Response) => {
  try {
    // Parse body
    const user = req.body

    // Get corresponding user password
    let query = "SELECT * FROM Users WHERE Email=$1"
    let values = [user.Email.toLowerCase()]
    const result = await db.query(query, values);
    const hashedPassword = result.rows[0].password

    // Verify password
    if (await argon2.verify(hashedPassword, user.Password)) {
      const UserID = result.rows[0].userid
      const jwt = generateJWT(UserID)
      res.send({message: "login successful",  access_token: jwt})
    }
    else {
        res.status(401).send({message: "incorrect password"})
    }
  }
  catch (error) {
    res.status(500).send({message: "error logging in"});
    console.error("error logging in", error);
  }
};

export { loginUser };
