import db from "../config/db";
import { GoogleGenAI, Type } from "@google/genai";
import { Request, Response } from "express";
import * as fs from "fs";
import * as path from "path";

const gaKey = process.env.GEMINI_API_KEY;
const ai = new GoogleGenAI({ apiKey: gaKey });

async function getQuestion(req: Request, res: Response) {
  try {
    const sessionId = req.query.sessionId ? (req.query.sessionId as string) : null;

    // ── 1. DB-first cache: return existing questions for this session ─────────
    if (sessionId) {
      const existing = await db.query(
        `SELECT question, answer
         FROM questionanswer WHERE session_id = $1 ORDER BY id LIMIT 15`,
        [sessionId]
      );
      if (existing.rows.length > 0) {
        const cached = existing.rows.map((r: any, i: number) => ({
          id: i + 1,
          question: r.question,
          answer: Array.isArray(r.answer) ? r.answer : [r.answer],
        }));
        console.log(`[getQuestion] returning ${cached.length} cached questions for session ${sessionId}`);
        return res.json({ success: true, data: cached });
      }
    }

    // ── 2. Guard: response.json must exist before calling Gemini ─────────────
    const responseFilePath = path.join(__dirname, "../response.json");
    if (!fs.existsSync(responseFilePath)) {
      return res.status(503).json({ success: false, error: "Restaurant data not yet available. Run the Places search first." });
    }

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

    const responseData = JSON.parse(fs.readFileSync(responseFilePath, "utf-8"));

    // Trim the payload — only send the fields Gemini needs to generate questions.
    // Sending the full raw Places API response (images, URLs, etc.) bloats the
    // prompt and is the main reason for timeouts.
    const restaurants = Array.isArray(responseData) ? responseData : (responseData.results ?? responseData.data ?? [responseData]);
    const trimmed = restaurants.slice(0, 20).map((r: any) => ({
      name:        r.name        ?? r.header,
      cuisine:     r.cuisine     ?? r.label     ?? r.types?.[0],
      priceLevel:  r.priceLevel  ?? r.priceRange ?? r.price_level,
      rating:      r.rating,
      reviewCount: r.reviewCount ?? r.user_ratings_total,
      openNow:     r.openNow     ?? r.opening_hours?.open_now,
      address:     r.vicinity    ?? r.address,
      popularItems: r.popularItems,
    }));
    const data = JSON.stringify(trimmed);

    const prompt = `You are a culinary matchmaking algorithm. Based on the restaurant options below, generate a 8-question multiple-choice questionnaire to help narrow down which restaurant best suits someone's preferences. Focus on price, cuisine type, atmosphere, dietary needs, and distance. Each question must be under 15 words. Each answer option must be under 7 words. Restaurant data: ${data}`;

    // ── 3. Gemini call — 90s timeout (2.5-flash needs time for structured output) ──
    const geminiPromise = ai.models.generateContent({
      model: "gemini-2.5-flash",
      config,
      contents: prompt,
    });
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Gemini request timed out after 90s")), 90000)
    );
    const response = await Promise.race([geminiPromise, timeoutPromise]);
    

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
    
    const insertQuery = `INSERT INTO questionanswer (question, answer, session_id) VALUES ($1, $2, $3)`;

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