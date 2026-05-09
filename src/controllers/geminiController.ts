import { GoogleGenAI } from "@google/genai";
import { Request, Response } from "express";

const gaKey = process.env.GEMINI_API_KEY;
const ai = new GoogleGenAI({ apiKey: gaKey});
const express = require('express');
const app = express()

app.use(express.json());


async function getGemini(req: Request, res: Response) {
  const prompt = "Explain the concept of Occam's Razor and provide a simple, everyday example.";
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
  });
  console.log(response.text);
  res.send({ message: response });
}


export { getGemini }