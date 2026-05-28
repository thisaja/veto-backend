import { Request, Response } from "express";
import * as fs from "fs";
import * as path from "path";

const DIETARY_LABELS = ["Vegan", "Vegetarian", "Gluten-Free", "Halal", "Nut Allergy", "Kosher"];

async function searchRestaurants(req: Request, res: Response) {
  const { latitude, longitude, radius, dietaryRestrictions } = req.body;

  if (latitude === undefined || longitude === undefined || radius === undefined) {
    return res.status(400).json({ success: false, error: "latitude, longitude, and radius are required" });
  }

  const radiusInMeters = radius * 1000;

  const body = {
    includedTypes: ["restaurant"],
    maxResultCount: 20,
    locationRestriction: {
      circle: {
        center: { latitude, longitude },
        radius: radiusInMeters,
      },
    },
  };

  try {
    const response = await fetch("https://places.googleapis.com/v1/places:searchNearby", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": String(process.env.GOOGLE_MAPS_API_KEY),
        "X-Goog-FieldMask":
          "places.name,places.nationalPhoneNumber,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.displayName,places.currentOpeningHours,places.priceRange,places.reviews",
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    const dietaryLabels = Array.isArray(dietaryRestrictions)
      ? dietaryRestrictions.map((i: number) => DIETARY_LABELS[i]).filter(Boolean)
      : [];

    const result = {
      metadata: {
        latitude,
        longitude,
        radius,
        dietaryRestrictions: dietaryLabels,
        fetchedAt: new Date().toISOString(),
      },
      places: data.places || [],
    };

    const outputPath = path.join(__dirname, "../response.json");
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));

    console.log(`Places API: saved ${result.places.length} restaurants to response.json`);

    return res.status(200).json({ success: true, data: result });
  } catch (error: any) {
    console.error("Google Places API error:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
}

export { searchRestaurants };
