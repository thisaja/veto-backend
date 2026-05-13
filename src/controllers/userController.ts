import { Request, Response } from "express";
import db from "../config/db";
import User from "../models/userModel";

const getUser = async (req: Request, res: Response) => {
  console.log("getting users");
  const result = await db.query<User>('SELECT * from Users')
  res.send({ users: result.rows });
};

const createUser = async (req: Request, res: Response) => {
  const user = JSON.parse(req.body.user) as User;
  const query = "INSERT INTO Users (FirstName, LastName, PhoneNumber, Email, Password, DiningAlias, ProfilePicture, Dealbreakers) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING UserID";
  const values = [user.FirstName, user.LastName, user.PhoneNumber, user.Email, user.Password, user.DiningAlias, req.file?.filename, JSON.stringify(user.Dealbreakers)]
  const result = await db.query(query, values);

  const user_id = result.rows[0].userid
  console.log(`inserted user ${user_id}`)
  res.send({user_id: user_id})
}

export { getUser, createUser };
