import db from "../config/db";
import { GoogleGenAI, Type } from "@google/genai";
import { Request, Response } from "express";
import * as fs from "fs";
import * as path from "path";

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

    const sessionId = req.query.sessionId ? (req.query.sessionId as string) : null;

    const responseFilePath = path.join(__dirname, "../response.json");
    const responseData = JSON.parse(fs.readFileSync(responseFilePath, "utf-8"));
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

    console.log(`Gemini API response length: ${response.text.length}`);
    console.log(`First 500 chars of response:`, response.text.substring(0, 500));
    
    const questionsList = JSON.parse(response.text);
    console.log(`Parsed ${questionsList.length} questions from Gemini API`);
    
    // Check first question for debugging
    if (questionsList.length > 0) {
      console.log(`First question:`, questionsList[0]);
    }
    
    const insertQuery = `INSERT INTO QuestionAnswer (Question, Answer, session_id) VALUES ($1, $2, $3)`;

    for (const item of questionsList) {
      // Ensure answer is formatted as PostgreSQL array
      const answerArray = Array.isArray(item.answer) ? item.answer : [item.answer];
      console.log(`Item ${item.id}: question="${item.question}", answer=${JSON.stringify(answerArray)}`);
      const values = [
        item.question as string,
        answerArray,
        sessionId,
      ];
      
      try {
        const result = await db.query(insertQuery, values);
        console.log(`Inserted question ${item.id}: ${item.question} - ${result.rowCount} rows affected`);
      } catch (err) {
        console.error(`Failed to insert question ${item.id}:`, err);
      }
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