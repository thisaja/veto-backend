import { Server as SocketServer, Socket } from "socket.io";
import { GoogleGenAI, Type } from "@google/genai";
import * as fs from "fs";
import * as path from "path";
import db from "../config/db";
import { getPlacesData } from "../services/placesStore";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

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

// ── Constants ──────────────────────────────────────────────────────────────
const HOST_MIGRATION_MS = 30_000;  // promote a new host after 30 s of host absence
const OVERRIDE_DELAY_MS = 60_000;  // host can force-generate 60 s after last answer

// ── Types ──────────────────────────────────────────────────────────────────

interface LobbyMember {
  socketId:    string;
  alias:       string;
  isHost:      boolean;
  userId?:     string;
  guestId?:    string;
  hasAnswered: boolean;
}

interface LobbyRoom {
  sessionId:  string;
  status:     "waiting" | "in_questions" | "generating" | "done";
  members:    LobbyMember[];
  answers:    { alias: string; userId?: string; guestId?: string; answers: any[] }[];
  // Host migration
  hostMigrationTimer: ReturnType<typeof setTimeout> | null;
  // Host answer-override
  overrideTimer: ReturnType<typeof setTimeout> | null;
}

// ── In-memory lobby store ──────────────────────────────────────────────────

const lobbyRooms = new Map<string, LobbyRoom>();

function getOrCreateRoom(sessionId: string): LobbyRoom {
  let room = lobbyRooms.get(sessionId);
  if (!room) {
    room = { sessionId, status: "waiting", members: [], answers: [],
             hostMigrationTimer: null, overrideTimer: null };
    lobbyRooms.set(sessionId, room);
  }
  return room;
}

function broadcastLobbyUpdate(
  lobbyNS: ReturnType<SocketServer["of"]>,
  sessionId: string,
) {
  const room = lobbyRooms.get(sessionId);
  if (!room) return;
  lobbyNS.to(sessionId).emit("lobby_update", {
    members: room.members.map(m => ({
      alias:       m.alias,
      isHost:      m.isHost,
      hasAnswered: m.hasAnswered,
    })),
    status: room.status,
  });
}

// ── Gemini call ────────────────────────────────────────────────────────────

async function generateRestaurantsForGroup(
  sessionId: string,
  groupAnswers: LobbyRoom["answers"],
): Promise<any[]> {
  let placesData = getPlacesData(sessionId);
  if (!placesData) {
    const filePath = path.join(__dirname, "../response.json");
    if (!fs.existsSync(filePath))
      throw new Error("No restaurant data available. Run a location search first.");
    placesData = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;

  // Pre-flatten reviews into a plain string per place so Gemini doesn't have to
  // navigate deeply nested JSON — it can read reviewSnippet directly.
  const placesWithPhotos = (placesData.places || []).map((place: any) => {
    const photoRefs: string[] = (place.photoRefs || []).slice(0, 3);
    const photoUrls = photoRefs.map(
      ref => `https://places.googleapis.com/v1/${ref}/media?maxWidthPx=800&key=${apiKey}`,
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
      reviewSnippet,
      photoUrls,
    };
  });

  const config = {
    responseMimeType: "application/json",
    responseSchema: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        required: ["header", "imageURL", "imageURLs", "label", "caption", "popularItems"],
        properties: {
          header:       { type: Type.STRING },
          imageURL:     { type: Type.STRING },
          imageURLs:    { type: Type.ARRAY, items: { type: Type.STRING } },
          label:        { type: Type.STRING },
          priceRange:   { type: Type.STRING },
          rating:       { type: Type.STRING },
          caption:      { type: Type.STRING },
          address:      { type: Type.STRING },
          latitude:     { type: Type.NUMBER },
          longitude:    { type: Type.NUMBER },
          phone:        { type: Type.STRING },
          popularItems: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
      },
    },
  };

  const prompt = `You are an expert group-dining recommendation engine.
Analyse the preferences of ALL ${groupAnswers.length} group member(s) and return the top 5 restaurants from RESTAURANT_DATA that best satisfy the entire group.

### HARD FILTERS
If ANY member has a dietary requirement, apply it as a hard filter:
- Halal: only certified Halal. Vegan: fully vegan-accommodating. Vegetarian: substantial veg options.
- Gluten-Free: safe gluten-free meals. Nut Allergy: nut-free guaranteed. Kosher: Kosher-certified only.

### MINIMUM GUARANTEE
If hard filters leave fewer than 3 restaurants, relax the least-critical filters progressively until you have 3. Prepend "⚠️ May not meet all dietary requirements. " to the caption of any relaxed addition.

### OUTPUT INSTRUCTIONS
1. imageURL: copy photoUrls[0] exactly. 2. imageURLs: copy full photoUrls array.
3. caption: use editorialSummary if present. Otherwise write 1–2 specific sentences based on reviewSnippet and the restaurant name/type. Do NOT use the same template for every restaurant.
4. popularItems: read the reviewSnippet field for THIS restaurant and pull out 3–5 specific dish or drink names customers mention. reviewSnippet is plain-text customer reviews — dish names appear naturally in it. Use those names directly. If no specific dishes are mentioned, generate 3–5 items that fit this restaurant's specific name, primaryType, and price point — make them distinct from every other restaurant in the list.
5. priceRange: "$"/"$$"/"$$$"/"$$$$". 6. rating: numeric string e.g. "4.5". 7. address: copy formattedAddress.
8. latitude/longitude: copy location. 9. phone: copy nationalPhoneNumber.
Do NOT include an "id" field — the database will assign one.

### GROUP PREFERENCES
${JSON.stringify(groupAnswers, null, 2)}

### RESTAURANT_DATA
${JSON.stringify({ places: placesWithPhotos }, null, 2)}

### RANKING
After hard filters, rank by highest cumulative preference match across ALL members. Favour variety.`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    config,
    contents: prompt,
  });

  if (!response.text) throw new Error("No response from Gemini");

  let list: any[] = JSON.parse(response.text);

  // Top up to 3 if Gemini returned fewer
  if (list.length < 3) {
    const existingHeaders = new Set(list.map((r: any) => r.header));
    const candidates = placesWithPhotos
      .filter((p: any) => !existingHeaders.has(p.displayName?.text ?? p.name))
      .sort((a: any, b: any) => (b.rating ?? 0) - (a.rating ?? 0));
    for (const p of candidates) {
      if (list.length >= 3) break;
      const name    = p.displayName?.text ?? p.name ?? "Nearby Restaurant";
      const cuisine = p.primaryTypeDisplayName?.text ?? "Restaurant";
      const rating  = p.rating ? `${p.rating}-star` : "well-rated";
      const editorial = p.editorialSummary?.text ?? p.editorialSummary;
      const baseCaption = editorial
        ? editorial
        : `A ${rating} ${cuisine.toLowerCase()} spot known for its quality food and welcoming atmosphere.`;
      list.push({
        header:       name,
        imageURL:     p.photoUrls?.[0] ?? "",
        imageURLs:    p.photoUrls ?? [],
        label:        cuisine,
        priceRange:   "$$",
        rating:       p.rating ? String(p.rating) : "",
        caption:      `⚠️ May not meet all dietary requirements. ${baseCaption}`,
        address:      p.formattedAddress ?? "",
        latitude:     p.location?.latitude ?? 0,
        longitude:    p.location?.longitude ?? 0,
        phone:        p.nationalPhoneNumber ?? "",
        popularItems: buildFallbackPopularItems(cuisine),
      });
    }
  }

  // ── Persist each restaurant to DB, get back the serial id ─────────────────
  const persisted: any[] = [];
  for (const item of list) {
    try {
      const result = await db.query(
        `INSERT INTO Restaurants
           (session_id, header, "imageURL", label, caption,
            "imageURLs", price_range, rating, popular_items,
            address, latitude, longitude, phone)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         RETURNING id`,
        [
          sessionId,
          item.header,
          item.imageURL,
          item.label,
          item.caption,
          item.imageURLs ?? [],
          item.priceRange ?? null,
          item.rating    ?? null,
          item.popularItems ?? [],
          item.address   ?? null,
          item.latitude  ?? null,
          item.longitude ?? null,
          item.phone     ?? null,
        ],
      );
      persisted.push({ ...item, id: result.rows[0].id });
    } catch (err) {
      console.error("Restaurants insert error:", err);
      persisted.push({ ...item, id: persisted.length + 1 }); // fallback (won't match DB)
    }
  }

  return persisted;
}

// ── Shared generation trigger (used by auto and host-override paths) ───────

async function triggerGeneration(
  lobby: ReturnType<SocketServer["of"]>,
  room:  LobbyRoom,
) {
  if (room.overrideTimer) { clearTimeout(room.overrideTimer); room.overrideTimer = null; }
  room.status = "generating";
  lobby.to(room.sessionId).emit("generating_restaurants");

  try {
    const restaurants = await generateRestaurantsForGroup(room.sessionId, room.answers);
    room.status = "done";
    lobby.to(room.sessionId).emit("restaurants_ready", { restaurants });
    console.log(`[lobby] restaurants_ready → ${room.sessionId}`);
  } catch (err: any) {
    console.error("[lobby] generateRestaurants error:", err);
    lobby.to(room.sessionId).emit("restaurants_error", {
      message: err.message ?? "Failed to generate restaurants.",
    });
    room.status = "in_questions"; // allow retry
  }
}

// ── Lobby socket handler ───────────────────────────────────────────────────

export function registerLobbyHandlers(io: SocketServer) {
  const lobby = io.of("/lobby");

  lobby.on("connection", (socket: Socket) => {
    console.log(`[lobby] connected: ${socket.id}`);

    // ── join_lobby ─────────────────────────────────────────────────────────
    socket.on(
      "join_lobby",
      ({ sessionId, alias, isHost, userId, guestId }: {
        sessionId: string;
        alias:     string;
        isHost:    boolean;
        userId?:   string;
        guestId?:  string;
      }) => {
        if (!sessionId) return;
        socket.join(sessionId);

        const room = getOrCreateRoom(sessionId);

        // ── Reconnect detection ──
        // Find existing entry for this identity (new socketId, same user/guest)
        const existing = room.members.find(m =>
          (userId  && m.userId  === userId)  ||
          (guestId && m.guestId === guestId),
        );
        const wasAnswered = existing?.hasAnswered ?? false;
        const wasHost     = existing?.isHost     ?? isHost;

        // Remove stale entry (same identity or same socketId)
        room.members = room.members.filter(m =>
          m.socketId !== socket.id &&
          !(userId  && m.userId  === userId)  &&
          !(guestId && m.guestId === guestId),
        );

        room.members.push({
          socketId: socket.id,
          alias,
          isHost:      wasHost,
          userId,
          guestId,
          hasAnswered: wasAnswered,
        });

        // Cancel host-migration countdown if the original host reconnects
        if (wasHost && room.hostMigrationTimer) {
          clearTimeout(room.hostMigrationTimer);
          room.hostMigrationTimer = null;
          lobby.to(sessionId).emit("host_reconnected", { alias });
          console.log(`[lobby] Host ${alias} reconnected to ${sessionId}`);
        }

        console.log(`[lobby] ${alias} joined ${sessionId} (host: ${wasHost})`);
        broadcastLobbyUpdate(lobby, sessionId);

        // If session is already past "waiting", send current state to late joiner
        if (room.status !== "waiting") {
          socket.emit("lobby_update", {
            members: room.members.map(m => ({ alias: m.alias, isHost: m.isHost, hasAnswered: m.hasAnswered })),
            status: room.status,
          });
          if (room.status === "in_questions") {
            socket.emit("questions_started");
          } else if (room.status === "generating") {
            socket.emit("generating_restaurants");
          } else if (room.status === "done") {
            // Fetch restaurants from DB so the late-joiner can proceed
            db.query(
              `SELECT id, header, "imageURL", label, caption,
                      "imageURLs", price_range AS "priceRange", rating,
                      popular_items AS "popularItems", address, latitude, longitude, phone
               FROM Restaurants WHERE session_id = $1 ORDER BY id`,
              [sessionId],
            ).then(result => {
              if (result.rows.length > 0) {
                socket.emit("restaurants_ready", { restaurants: result.rows });
              }
            }).catch(err => console.error("[lobby] late-join restaurants fetch:", err));
          }
        }
      },
    );

    // ── request_lobby_state ────────────────────────────────────────────────
    socket.on("request_lobby_state", ({ sessionId }: { sessionId: string }) => {
      const room = lobbyRooms.get(sessionId);
      if (!room) return;
      socket.emit("lobby_update", {
        members: room.members.map(m => ({ alias: m.alias, isHost: m.isHost, hasAnswered: m.hasAnswered })),
        status:  room.status,
      });
    });

    // ── start_questions (host only) ────────────────────────────────────────
    socket.on("start_questions", ({ sessionId }: { sessionId: string }) => {
      const room = lobbyRooms.get(sessionId);
      if (!room) return;
      const member = room.members.find(m => m.socketId === socket.id);
      if (!member?.isHost) {
        socket.emit("error_event", { message: "Only the host can start questions." });
        return;
      }
      room.status = "in_questions";
      console.log(`[lobby] Host started questions for ${sessionId}`);
      lobby.to(sessionId).emit("questions_started");
      broadcastLobbyUpdate(lobby, sessionId);
    });

    // ── submit_answers ─────────────────────────────────────────────────────
    socket.on(
      "submit_answers",
      async ({ sessionId, answers, alias, userId, guestId }: {
        sessionId: string;
        answers:   { id: number; question: string; answer: string }[];
        alias:     string;
        userId?:   string;
        guestId?:  string;
      }) => {
        const room = lobbyRooms.get(sessionId);
        if (!room || room.status !== "in_questions") return;

        const member = room.members.find(m => m.socketId === socket.id);
        if (member) member.hasAnswered = true;

        room.answers = room.answers.filter(a => a.alias !== alias);
        room.answers.push({ alias, userId, guestId, answers });

        // Persist answers to DB (best-effort)
        for (const qa of answers) {
          db.query(
            `INSERT INTO QuestionAnswer (session_id, user_id, guest_id, Question, Answer)
             VALUES ($1, $2, $3, $4, ARRAY[$5])`,
            [sessionId, userId ?? null, guestId ?? null, qa.question, qa.answer],
          ).catch(err => console.error("QuestionAnswer insert:", err));
        }
        // Mark has_answered in SessionMembers for both users and guests
        if (userId) {
          db.query(
            `UPDATE SessionMembers SET has_answered = true
             WHERE session_id = $1 AND user_id = $2`,
            [sessionId, userId],
          ).catch(() => {});
        } else if (guestId) {
          db.query(
            `UPDATE SessionMembers SET has_answered = true
             WHERE session_id = $1 AND guest_id = $2`,
            [sessionId, guestId],
          ).catch(() => {});
        }

        const totalMembers  = room.members.length;
        const answeredCount = room.members.filter(m => m.hasAnswered).length;
        console.log(`[lobby] ${alias} answered (${answeredCount}/${totalMembers}) session ${sessionId}`);
        broadcastLobbyUpdate(lobby, sessionId);

        if (answeredCount >= totalMembers) {
          // Everyone answered — generate immediately
          await triggerGeneration(lobby, room);
          return;
        }

        // Not everyone done yet — broadcast progress and arm the override timer
        lobby.to(sessionId).emit("answers_progress", {
          answered: answeredCount,
          total:    totalMembers,
        });

        // Reset the override countdown on every new answer
        if (room.overrideTimer) clearTimeout(room.overrideTimer);
        room.overrideTimer = setTimeout(() => {
          const r = lobbyRooms.get(sessionId);
          if (!r || r.status !== "in_questions") return;
          const answered = r.members.filter(m => m.hasAnswered).length;
          lobby.to(sessionId).emit("override_available", {
            answered,
            total: r.members.length,
          });
          console.log(`[lobby] override_available → ${sessionId} (${answered}/${r.members.length})`);
        }, OVERRIDE_DELAY_MS);
      },
    );

    // ── override_generate (host only) ──────────────────────────────────────
    socket.on("override_generate", async ({ sessionId }: { sessionId: string }) => {
      const room = lobbyRooms.get(sessionId);
      if (!room || room.status !== "in_questions") return;
      const member = room.members.find(m => m.socketId === socket.id);
      if (!member?.isHost) {
        socket.emit("error_event", { message: "Only the host can force generation." });
        return;
      }
      if (room.answers.length === 0) {
        socket.emit("error_event", { message: "No answers submitted yet." });
        return;
      }
      console.log(`[lobby] Host triggered override generation for ${sessionId}`);
      await triggerGeneration(lobby, room);
    });

    // ── disconnect ─────────────────────────────────────────────────────────
    socket.on("disconnect", () => {
      console.log(`[lobby] disconnected: ${socket.id}`);

      for (const [sessionId, room] of lobbyRooms) {
        const idx = room.members.findIndex(m => m.socketId === socket.id);
        if (idx === -1) continue;

        const leaving = room.members[idx];
        room.members.splice(idx, 1);
        broadcastLobbyUpdate(lobby, sessionId);

        // If the host left, start the migration countdown
        if (leaving.isHost && room.members.length > 0) {
          lobby.to(sessionId).emit("host_disconnected", {
            timeoutSeconds: HOST_MIGRATION_MS / 1000,
          });

          if (room.hostMigrationTimer) clearTimeout(room.hostMigrationTimer);
          room.hostMigrationTimer = setTimeout(() => {
            const r = lobbyRooms.get(sessionId);
            if (!r || r.members.length === 0) return;
            // Check no one has already claimed host
            if (r.members.some(m => m.isHost)) return;

            const newHost = r.members[Math.floor(Math.random() * r.members.length)];
            newHost.isHost = true;
            r.hostMigrationTimer = null;

            lobby.to(sessionId).emit("host_migrated", { newHostAlias: newHost.alias });
            broadcastLobbyUpdate(lobby, sessionId);
            console.log(`[lobby] Host migrated → ${newHost.alias} in ${sessionId}`);
          }, HOST_MIGRATION_MS);
        }
      }
    });
  });
}
