import db from "../config/db";
import { GoogleGenAI, Type } from "@google/genai";
import { Request, Response } from "express";
import responseData from "../response.json";

const gaKey = process.env.GEMINI_API_KEY;
const ai = new GoogleGenAI({ apiKey: gaKey });

async function getQuestion(req: Request, res: Response) {
  try {
    const config = {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          required: ["id", "question", "answer"],
          properties: {
            id: { type: Type.INTEGER }, 
            question: { type: Type.STRING },
            answer: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
          },
        },
      },
    };

    const data = JSON.stringify(responseData);
    const prompt = `You are a professional culinary matchmaking algorithm. Dynamically analyze the provided JSON restaurant dataset and generate a 10-question multiple-choice questionnaire specifically tailored to the unique distinguishing attributes of these restaurants. Your goal is to identify high-impact filters within the specific metadata and reviews provided, focusing on service style, atmosphere, wait times, dietary requirements, and price points. Each question must be under 15 words and each option must be under 7 words. Use direct, professional language that prioritizes clear intentions. Analyze this data: ${data}`;

    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-lite",
      config,
      contents: prompt,
    });
    

    if (!response.text) {
      throw new Error("No data returned from Gemini API");
    }

    const questionsList = JSON.parse(response.text);
    
    const insertQuery = `INSERT INTO QuestionAnswer (id, question, answer) VALUES (DEFAULT, $1, $2)`;
    
    for (const item of questionsList) {
      const values = [
        item.question, 
        item.answer,
      ];
      
      await db.query(insertQuery, values);
    }

    return res.status(201).json({ 
      success: true,
      message: "All questions successfully generated and saved to database.",
      data: questionsList 
    });

  }
   catch (error: any) {
    console.error("Database or AI operation failed:", error);
    return res.status(500).json({ 
      success: false,
      error: error.message,
    });
  }
}

export { getQuestion };