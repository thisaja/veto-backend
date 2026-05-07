import { RequestHandler } from "express";

const protect: RequestHandler = (req, res, next) => {
  console.log("protecting");
  next();
};

const admin: RequestHandler = (req, res, next) => {
  console.log("admin");
  next();
};

export { protect, admin };
