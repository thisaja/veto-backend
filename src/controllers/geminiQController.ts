import { GoogleGenAI, Type } from "@google/genai";
import { Request, Response } from "express";
import responseData from "../response.json";

const gaKey = process.env.GEMINI_API_KEY;
const ai = new GoogleGenAI({ apiKey: gaKey});
const express = require('express');
const app = express()

app.use(express.json());

async function getQuestion(req: Request, res: Response) {
  const config = {
    responseMimeType: 'application/json',
    responseSchema: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        required: ["id", "question", "answer"],
        properties: {
          id: {
            type: Type.INTEGER,
          },
          question: {
            type: Type.STRING,
          },
          answer: {
            type: Type.STRING,
          },
        },
      },
    },
  };
  const data = JSON.stringify(responseData);
  const question = `You are a professional culinary matchmaking algorithm. Dynamically analyze the provided JSON restaurant dataset and generate a 10-question multiple-choice questionnaire specifically tailored to the unique distinguishing attributes of these restaurants. Your goal is to identify high-impact filters within the specific metadata and reviews provided, focusing on service style, atmosphere, wait times, dietary requirements, and price points. Each question must be under 15 words and each option must be under 7 words. Use direct, professional language that prioritizes clear intentions. Analyze this data: ${data}`;
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    config,
    contents: question,
  });
  console.log(response.text);
  res.send({ message: response });
}

export { getQuestion }