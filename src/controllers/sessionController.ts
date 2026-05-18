import { Request, Response } from "express";

const createSession = async (req: Request, res: Response) => {
  console.log("creating session", req.body, req.params)
  res.send({user: "ok"})
}

export { createSession };
