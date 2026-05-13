export const findRestaurants = async (lat: number, lon: number, radius: number) => {
    const body = {
        includedTypes: [
            "restaurant"
        ],
        maxResultCount: 10,
        locationRestriction: {
            circle: {
            center: {
                latitude: lat,
                longitude: lon
            },
            radius: radius
            }
        }
    }
  try {
    const response = await fetch("https://places.googleapis.com/v1/places:searchNearby", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": String(process.env.GOOGLE_MAPS_API_KEY),
        "X-Goog-FieldMask": "places.nationalPhoneNumber,places.formattedAddress,places.location,places.rating,places.displayName,places.currentOpeningHours,places.priceRange,places.name,places.userRatingCount,places.reviews"
      },
      body: JSON.stringify(body)
    })
    const data = await response.json()
    console.log(data)
  }
  catch (error) {
    console.error("Something went wrong:", error)
  }
}