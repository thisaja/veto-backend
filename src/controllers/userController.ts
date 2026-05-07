import { Request, Response } from "express";

// @desc    Get all users
// @route   GET /api/users
// @access  Private/Admin
const getUsers = (req: Request, res: Response) => {
  console.log("getting users");
  res.send({ message: "This is the message" });
};

export { getUsers };
