import { Request, Response } from "express";
import db from "../config/db";
import * as argon2 from "argon2";

const loginUser = async (req: Request, res: Response) => {
  try {
    // Parse body
    const user = req.body

    // Get corresponding user password
    let query = "SELECT Password FROM Users WHERE Email=$1"
    let values = [user.Email.toLowerCase()]
    const result = await db.query(query, values);
    const hashedPassword = result.rows[0].password

    // Verify password
    if (await argon2.verify(hashedPassword, user.Password)) {
        res.send({user: "ok"})
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
