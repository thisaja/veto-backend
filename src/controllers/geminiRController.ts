import db from "../config/db";
import { GoogleGenAI, Type } from "@google/genai";
import { Request, Response } from "express";
import * as fs from "fs";
import * as path from "path";

const gaKey = process.env.GEMINI_API_KEY;
const ai = new GoogleGenAI({ apiKey: gaKey});

async function getRestaurant(req: Request, res: Response) {
  try {
      const config = {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            required: ["id", "header", "imageURL", "label", "caption"],
            properties: {
              id: {
                type: Type.INTEGER,
              },
              header: {
                type: Type.STRING,
              },
              imageURL: {
                type: Type.STRING,
              },
              label: {
                type: Type.STRING,
              },
              caption: {
                type: Type.STRING,
              },
            },
          },
        },
      };
      const qa = JSON.stringify(req.body);
      const responseFilePath = path.join(__dirname, "../response.json");
      const responseData = JSON.parse(fs.readFileSync(responseFilePath, "utf-8"));

      // Build the real photo URL for each place from the stored reference name.
      // This is done here at query time so the API key never ends up in response.json.
      const apiKey = process.env.GOOGLE_MAPS_API_KEY;
      const placesWithPhotos = (responseData.places || []).map((place: any) => ({
        ...place,
        photoUrl: place.firstPhotoRef
          ? `https://places.googleapis.com/v1/${place.firstPhotoRef}/media?maxWidthPx=800&key=${apiKey}`
          : "",
      }));
      const enrichedData = { ...responseData, places: placesWithPhotos };
      const data = JSON.stringify(enrichedData);

      const question = `You are an expert group-dining recommendation engine. Your task is to analyze multiple sets of user questionnaire answers and curate the top 5 best restaurant compromises from the provided RESTAURANT_DATA.

      ### Critical instruction for imageURL
      Each restaurant in RESTAURANT_DATA has a "photoUrl" field containing a real Google Places photo URL.
      You MUST copy this "photoUrl" value exactly as-is into the "imageURL" field of your response for that restaurant.
      Do NOT invent, hallucinate, or modify photo URLs.

      ### Input Data
      1. GROUP_PREFERENCES:
      ${qa}

      2. RESTAURANT_DATA:
      ${data}

      ### Conflict Resolution Strategy
      Since not everyone can be perfectly accommodated, apply these strict priority rules to resolve conflicts:
      1. Tier 1 (Non-Negotiable): Dietary certifications (Halal, Vegan, Vegetarian) must act as a strict filter. If one user requires Halal, eliminate all restaurants that cannot accommodate Halal.
      2. Tier 2 (Compromise Scoring): For subjective preferences (Atmosphere, Service Style, Parking), use a majority-rules approach. Rank restaurants based on the highest total cumulative match score across all users.
      `;

      
      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-lite",
        config,
        contents: question,
      });

      if (!response.text) {
        throw new Error("No data returned from Gemini API");
      }

      const restaurantList = JSON.parse(response.text);
      const insertQuery = `
        INSERT INTO Restaurants (id, header, imageURL, label, caption)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (id) DO UPDATE SET
          header   = EXCLUDED.header,
          imageURL = EXCLUDED.imageURL,
          label    = EXCLUDED.label,
          caption  = EXCLUDED.caption
      `;

      for (const item of restaurantList) {
        const values = [
          item.id,
          item.header,
          item.imageURL,
          item.label,
          item.caption,
        ];

        await db.query(insertQuery, values);
      }

      return res.status(201).json({ 
        success: true,
        message: "All restaurants successfully generated and saved to database.",
        data: restaurantList 
      });
  }
  catch (error: any) {
    console.error("Database operation failed:", error);
    return res.status(500).json({
      success: false,
      error: error.message,
    })
  }
}

export { getRestaurant }