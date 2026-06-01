import db from "../config/db";
import { GoogleGenAI, Type } from "@google/genai";
import { Request, Response } from "express";
import * as fs from "fs";
import * as path from "path";
import { getPlacesData } from "../services/placesStore";

const gaKey = process.env.GEMINI_API_KEY;
const ai = new GoogleGenAI({ apiKey: gaKey });

/**
 * Strip everything Gemini doesn't need before injecting into the prompt.
 * Reviews + opening-hours alone can add 30-80 KB per request — removing them
 * cuts prompt tokens by ~70% and shaves 2-4 s off response time.
 */
function trimPlaceForPrompt(place: any) {
  // Keep up to 3 reviews (truncated) — Gemini needs review text to write real
  // captions and identify actual popular dishes. Without reviews the output is
  // generic templated filler.
  const reviews = (place.reviews ?? [])
    .slice(0, 3)
    .map((r: any) => (r.text?.text ?? r.text ?? "").slice(0, 300));

  return {
    displayName: place.displayName?.text ?? place.name ?? "",
    rating: place.rating ?? null,
    userRatingCount: place.userRatingCount ?? 0,
    formattedAddress: place.formattedAddress ?? "",
    location: place.location ?? null,
    priceRange: place.priceRange ?? null,
    nationalPhoneNumber: place.nationalPhoneNumber ?? "",
    editorialSummary: place.editorialSummary?.text ?? "",
    primaryTypeDisplayName: place.primaryTypeDisplayName?.text ?? "",
    reviews,
    photoUrls: (place.photoUrls ?? []).slice(0, 3),
  };
}

const CUISINE_ITEMS: Record<string, string[]> = {
  italian:    ["Margherita Pizza", "Spaghetti Carbonara", "Tiramisu", "Bruschetta", "Risotto"],
  japanese:   ["Sushi Platter", "Ramen", "Tempura", "Edamame", "Mochi Ice Cream"],
  chinese:    ["Dim Sum", "Peking Duck", "Kung Pao Chicken", "Spring Rolls", "Fried Rice"],
  mexican:    ["Tacos al Pastor", "Guacamole & Chips", "Enchiladas", "Churros", "Elote"],
  indian:     ["Butter Chicken", "Garlic Naan", "Samosas", "Mango Lassi", "Biryani"],
  thai:       ["Pad Thai", "Green Curry", "Spring Rolls", "Tom Yum Soup", "Mango Sticky Rice"],
  french:     ["Croque Monsieur", "French Onion Soup", "Crème Brûlée", "Escargot", "Croissant"],
  american:   ["Cheeseburger", "BBQ Ribs", "Mac & Cheese", "Chicken Wings", "Apple Pie"],
  greek:      ["Souvlaki", "Spanakopita", "Tzatziki", "Moussaka", "Baklava"],
  mediterranean: ["Falafel", "Hummus", "Shawarma", "Tabbouleh", "Pita Bread"],
  korean:     ["Korean BBQ", "Bibimbap", "Kimchi Pancake", "Japchae", "Sundubu Jjigae"],
  vietnamese: ["Pho", "Banh Mi", "Fresh Spring Rolls", "Bun Bo Hue", "Ca Phe Sua Da"],
  spanish:    ["Patatas Bravas", "Paella", "Croquetas", "Churros con Chocolate", "Tortilla Española"],
  pizza:      ["Margherita", "Pepperoni", "BBQ Chicken", "Four Cheese", "Garlic Bread"],
  burger:     ["Classic Cheeseburger", "Smash Burger", "Chicken Burger", "Loaded Fries", "Onion Rings"],
  sushi:      ["Salmon Nigiri", "Dragon Roll", "Tuna Sashimi", "Edamame", "Miso Soup"],
};

function buildFallbackPopularItems(cuisineLabel: string): string[] {
  const key = cuisineLabel.toLowerCase();
  for (const [cuisine, items] of Object.entries(CUISINE_ITEMS)) {
    if (key.includes(cuisine)) return items.slice(0, 4);
  }
  return ["House Special", "Chef's Recommendation", "Seasonal Dish", "Customer Favourite"];
}

async function getRestaurant(req: Request, res: Response) {
  try {
    const config = {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          required: ["id", "header", "imageURL", "imageURLs", "label", "caption", "popularItems"],
          properties: {
            id:         { type: Type.INTEGER },
            header:     { type: Type.STRING },
            imageURL:   { type: Type.STRING },
            imageURLs:  { type: Type.ARRAY, items: { type: Type.STRING } },
            label:      { type: Type.STRING },
            priceRange: { type: Type.STRING },
            rating:     { type: Type.STRING },
            caption:    { type: Type.STRING },
            address:    { type: Type.STRING },
            latitude:   { type: Type.NUMBER },
            longitude:  { type: Type.NUMBER },
            phone:      { type: Type.STRING },
            popularItems: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
        },
      },
    };

    // ── Resolve session places data ──────────────────────────────────────────
    // Prefer per-session in-memory store; fall back to legacy response.json.
    const { sessionId, ...preferences } = req.body;
    const qa = JSON.stringify(preferences);

    let responseData = getPlacesData(sessionId);
    if (!responseData) {
      const responseFilePath = path.join(__dirname, "../response.json");
      if (!fs.existsSync(responseFilePath)) {
        return res.status(503).json({
          success: false,
          error: "No restaurant data available. Please run a location search first.",
        });
      }
      responseData = JSON.parse(fs.readFileSync(responseFilePath, "utf-8"));
    }

    // ── Build prompt-ready place data ────────────────────────────────────────
    // Reviews are the primary signal Gemini uses to write captions and identify
    // popular dishes. We pre-flatten them into a single string so Gemini doesn't
    // have to navigate deeply nested JSON — it reliably reads a flat field.
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    const promptPlaces = (responseData.places || []).map((place: any) => {
      const photoUrls = (place.photoRefs || []).map(
        (ref: string) =>
          `https://places.googleapis.com/v1/${ref}/media?maxWidthPx=800&key=${apiKey}`
      );
      const reviewSnippet = (place.reviews ?? [])
        .map((r: any) => r.text?.text ?? r.text ?? "")
        .filter(Boolean)
        .join(" | ")
        .slice(0, 800);
      return {
        displayName:      place.displayName?.text ?? place.name ?? "",
        rating:           place.rating ?? null,
        formattedAddress: place.formattedAddress ?? "",
        location:         place.location ?? null,
        priceRange:       place.priceRange ?? null,
        nationalPhoneNumber: place.nationalPhoneNumber ?? "",
        editorialSummary: place.editorialSummary?.text ?? "",
        primaryType:      place.primaryTypeDisplayName?.text ?? "",
        reviewSnippet,   // flat string — easy for Gemini to read
        photoUrls,
      };
    });
    // Keep enrichedData (with full place objects) for the JS fallback below.
    const enrichedPlaces = (responseData.places || []).map((place: any) => {
      const photoUrls = (place.photoRefs || []).map(
        (ref: string) =>
          `https://places.googleapis.com/v1/${ref}/media?maxWidthPx=800&key=${apiKey}`
      );
      return { ...place, photoUrls };
    });
    const enrichedData = { ...responseData, places: enrichedPlaces };
    const data = JSON.stringify({ places: promptPlaces });

    const question = `You are an expert group-dining recommendation engine. Analyze the user preferences and curate the top 5 best restaurant compromises from RESTAURANT_DATA.

    ### Critical instructions
    1. imageURL: copy photoUrls[0] from RESTAURANT_DATA exactly as-is. Do NOT invent or modify URLs.
    2. imageURLs: copy the entire photoUrls array from RESTAURANT_DATA exactly as-is for that restaurant.
    3. caption: use editorialSummary if present. Otherwise write 1–2 specific sentences based on reviewSnippet and the restaurant name/type. Do NOT use the same template for every restaurant.
    4. popularItems: read the reviewSnippet field for THIS restaurant and pull out 3–5 specific dish or drink names that customers mention. reviewSnippet is a plain-text concatenation of real customer reviews — dish names appear naturally in it (e.g. "the truffle pasta was amazing", "we loved the miso soup"). Use those names directly. If reviewSnippet mentions no specific dishes, generate 3–5 items that fit this restaurant's specific name, primaryType, and price point — make them distinct from every other restaurant in the list.
    5. priceRange: output "$", "$$", "$$$", or "$$$$" from RESTAURANT_DATA if present, otherwise estimate.
    6. rating: copy the numeric rating as a string (e.g., "4.5"). Empty string if unavailable.
    7. address: copy formattedAddress exactly. Empty string if unavailable.
    8. latitude/longitude: copy location values exactly. Use 0 if unavailable.
    9. phone: copy nationalPhoneNumber exactly. Empty string if unavailable.

    ### Hard dietary filters
    If ANY user has a dietary requirement (Halal, Vegan, Vegetarian, Gluten-Free, Nut Allergy, Kosher), exclude non-compliant restaurants. If fewer than 5 remain, relax least-critical filters progressively and prepend "⚠️ May not meet all dietary requirements. " to that restaurant's caption.

    ### Input Data
    1. GROUP_PREFERENCES:
    ${qa}

    2. RESTAURANT_DATA:
    ${data}

    ### Ranking
    Rank by highest cumulative preference match across all users. Favour variety of cuisine types.
    `;

    const MIN_RESULTS = 5;
    let restaurantList: any[] = [];

    // ── Gemini call with 35s timeout, JS fallback on failure ─────────────────
    try {
      const geminiPromise = ai.models.generateContent({
        model: "gemini-2.5-flash",
        config,
        contents: question,
      });
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Gemini timed out after 35s")), 35000)
      );
      const response = await Promise.race([geminiPromise, timeoutPromise]);

      if (!response.text) throw new Error("Empty Gemini response");
      restaurantList = JSON.parse(response.text);
      console.log(`[geminiR] Gemini returned ${restaurantList.length} restaurants`);
    } catch (geminiErr: any) {
      console.warn(`[geminiR] Gemini failed (${geminiErr.message}) — using JS fallback`);
    }

    // ── Guarantee MIN_RESULTS: top up from Places data sorted by rating ───────
    if (restaurantList.length < MIN_RESULTS) {
      console.warn(`[geminiR] Topping up from ${enrichedData.places?.length ?? 0} Places results`);
      const existingHeaders = new Set(
        restaurantList.map((r: any) => (r.header ?? "").toLowerCase())
      );
      const candidates: any[] = (enrichedData.places || [])
        .filter((p: any) => {
          const name = (p.displayName?.text ?? p.name ?? "").toLowerCase();
          return !existingHeaders.has(name);
        })
        .sort((a: any, b: any) => (b.rating ?? 0) - (a.rating ?? 0));

      let idx = restaurantList.length;
      for (const place of candidates) {
        if (restaurantList.length >= MIN_RESULTS) break;
        const name    = place.displayName?.text ?? place.name ?? `Restaurant ${idx + 1}`;
        const cuisine = place.primaryTypeDisplayName?.text ?? "Restaurant";
        const rating  = place.rating ? `${place.rating}-star` : "well-rated";
        const editorial = place.editorialSummary?.text;
        restaurantList.push({
          id: idx + 1,
          header:     name,
          imageURL:   place.photoUrls?.[0] ?? "",
          imageURLs:  place.photoUrls ?? [],
          label:      cuisine,
          priceRange: place.priceRange?.endPrice
            ? "$".repeat(Math.min(4, Math.round(place.priceRange.endPrice.units / 25) + 1))
            : "$$",
          rating:     place.rating ? String(place.rating) : "",
          caption:    editorial
            ? editorial
            : `A ${rating} ${cuisine.toLowerCase()} spot known for its quality food and welcoming atmosphere.`,
          address:    place.formattedAddress ?? "",
          latitude:   place.location?.latitude  ?? 0,
          longitude:  place.location?.longitude ?? 0,
          phone:      place.nationalPhoneNumber ?? "",
          popularItems: buildFallbackPopularItems(cuisine),
        });
        idx++;
      }
    }

    // Only persist to DB when we have a sessionId — same schema as lobbySocket.
    if (sessionId) {
      // Clear any stale rows for this session first so we don't accumulate duplicates
      await db.query(`DELETE FROM Restaurants WHERE session_id = $1`, [sessionId]).catch(() => {});

      const insertQuery = `
        INSERT INTO Restaurants
          (session_id, header, "imageURL", label, caption,
           "imageURLs", price_range, rating, popular_items,
           address, latitude, longitude, phone)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        RETURNING id
      `;
      for (const item of restaurantList) {
        try {
          const result = await db.query(insertQuery, [
            sessionId,
            item.header,
            item.imageURL,
            item.label,
            item.caption      ?? "",
            item.imageURLs    ?? [],
            item.priceRange   ?? null,
            item.rating       ?? null,
            item.popularItems ?? [],
            item.address      ?? null,
            item.latitude     ?? null,
            item.longitude    ?? null,
            item.phone        ?? null,
          ]);
          item.id = result.rows[0]?.id ?? item.id;
        } catch (err) {
          console.error("[geminiR] insert failed for", item.header, err);
        }
      }
      console.log(`[geminiR] persisted ${restaurantList.length} restaurants for session ${sessionId}`);
    }

    console.log(`[geminiR] returning ${restaurantList.length} restaurants`);
    return res.status(201).json({
      success: true,
      message: "Restaurants ready.",
      data: restaurantList,
    });
  } catch (error: any) {
    console.error("geminiRController error:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
}

export { getRestaurant };
