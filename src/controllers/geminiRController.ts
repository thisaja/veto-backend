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
            required: ["id", "header", "imageURL", "imageURLs", "label", "caption", "popularItems"],
            properties: {
              id: { type: Type.INTEGER },
              header: { type: Type.STRING },
              imageURL: { type: Type.STRING },
              imageURLs: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              label: { type: Type.STRING },
              priceRange: { type: Type.STRING },
              rating: { type: Type.STRING },
              caption: { type: Type.STRING },
              popularItems: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
            },
          },
        },
      };
      const qa = JSON.stringify(req.body);
      const responseFilePath = path.join(__dirname, "../response.json");
      const responseData = JSON.parse(fs.readFileSync(responseFilePath, "utf-8"));

      // Build all real photo URLs from stored references at query time.
      // API key is injected here so it never ends up in response.json.
      const apiKey = process.env.GOOGLE_MAPS_API_KEY;
      const placesWithPhotos = (responseData.places || []).map((place: any) => {
        const photoUrls = (place.photoRefs || []).map(
          (ref: string) =>
            `https://places.googleapis.com/v1/${ref}/media?maxWidthPx=800&key=${apiKey}`
        );
        return { ...place, photoUrls };
      });
      const enrichedData = { ...responseData, places: placesWithPhotos };
      const data = JSON.stringify(enrichedData);

      const question = `You are an expert group-dining recommendation engine. Analyze the user preferences and curate the top 5 best restaurant compromises from RESTAURANT_DATA.

      ### Critical instructions
      1. imageURL: copy photoUrls[0] from RESTAURANT_DATA exactly as-is. Do NOT invent or modify URLs.
      2. imageURLs: copy the entire photoUrls array from RESTAURANT_DATA exactly as-is for that restaurant.
      3. popularItems: generate 3–5 signature or well-known menu items for the restaurant. Base them on the restaurant name, cuisine type, and any review content available. Use concise dish names only (e.g. "Truffle Tagliatelle", "Spicy Tuna Roll").
      4. priceRange: output "$", "$$", "$$$", or "$$$$" using the priceRange field from RESTAURANT_DATA if present, otherwise estimate from cuisine type and restaurant name.
      5. rating: copy the numeric rating from RESTAURANT_DATA as a string (e.g., "4.5"). Use an empty string if unavailable.

      ### Input Data
      1. GROUP_PREFERENCES:
      ${qa}

      2. RESTAURANT_DATA:
      ${data}

      ### Conflict Resolution Strategy
      1. Tier 1 (Non-Negotiable): Dietary certifications (Halal, Vegan, Vegetarian) are strict filters.
      2. Tier 2 (Compromise Scoring): Rank by highest cumulative preference match across all users.
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