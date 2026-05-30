import { Server as SocketServer, Socket } from "socket.io";
import db from "../config/db";

// ── Types ──────────────────────────────────────────────────────────────────

interface Restaurant {
  id:           number;
  header:       string;
  imageURL:     string;
  imageURLs?:   string[];
  label:        string;
  priceRange?:  string;
  rating?:      string;
  caption:      string;
  popularItems?: string[];
  address?:     string;
  latitude?:    number;
  longitude?:   number;
  phone?:       string;
}

interface Room {
  sessionId:    string;
  restaurants:  Restaurant[];       // full list, never mutated
  eliminatedIds: number[];
  round:        number;
  votes:        Map<number, Set<string>>;
  timer:        ReturnType<typeof setTimeout> | null;
  status:       "waiting" | "active" | "round_end" | "finished";
  dbRoomId?:    string;
}

// ── In-memory room store ───────────────────────────────────────────────────

const rooms = new Map<string, Room>();

const ROUND_SECONDS = 30;
const MAX_ROUNDS    = 4;

// ── Helpers ────────────────────────────────────────────────────────────────

function activeRestaurants(room: Room): Restaurant[] {
  return room.restaurants.filter(r => !room.eliminatedIds.includes(r.id));
}

function voteCounts(room: Room): Record<number, number> {
  const counts: Record<number, number> = {};
  for (const r of activeRestaurants(room)) {
    counts[r.id] = room.votes.get(r.id)?.size ?? 0;
  }
  return counts;
}

async function loadRestaurantsFromDB(sessionId: string): Promise<Restaurant[]> {
  const result = await db.query(
    `SELECT id, header, "imageURL", label, caption,
            "imageURLs" AS "imageURLs",
            price_range AS "priceRange",
            rating,
            popular_items AS "popularItems",
            address, latitude, longitude, phone
     FROM Restaurants
     WHERE session_id = $1
     ORDER BY id`,
    [sessionId],
  );
  return result.rows;
}

// ── Round lifecycle ────────────────────────────────────────────────────────

function startRound(io: SocketServer, sessionId: string) {
  const room = rooms.get(sessionId);
  if (!room) return;

  room.votes = new Map();
  for (const r of activeRestaurants(room)) room.votes.set(r.id, new Set());

  room.status = "active";

  io.to(sessionId).emit("round_start", {
    round:         room.round,
    restaurants:   activeRestaurants(room),
    allRestaurants: room.restaurants,      // full list so clients can show eliminated stamps
    eliminatedIds: [...room.eliminatedIds],
    timeLeft:      ROUND_SECONDS,
  });

  if (room.timer) clearTimeout(room.timer);
  room.timer = setTimeout(() => resolveRound(io, sessionId), ROUND_SECONDS * 1000);
}

function resolveRound(io: SocketServer, sessionId: string) {
  const room = rooms.get(sessionId);
  if (!room || room.status !== "active") return;

  room.status = "round_end";
  if (room.timer) { clearTimeout(room.timer); room.timer = null; }

  const active  = activeRestaurants(room);
  const counts  = voteCounts(room);
  const maxVotes = Math.max(0, ...active.map(r => counts[r.id] ?? 0));
  const topCandidates = active.filter(r => (counts[r.id] ?? 0) === maxVotes);
  const eliminated    = topCandidates[Math.floor(Math.random() * topCandidates.length)];

  room.eliminatedIds.push(eliminated.id);

  if (room.dbRoomId) {
    for (const r of active) {
      db.query(
        `INSERT INTO RoundVotes (room_id, round_number, restaurant_id, vote_count)
         VALUES ($1, $2, $3, $4)`,
        [room.dbRoomId, room.round, r.id, counts[r.id] ?? 0],
      ).catch(err => console.error("RoundVotes insert:", err));
    }
  }

  io.to(sessionId).emit("round_end", {
    round:                room.round,
    eliminatedId:         eliminated.id,
    eliminatedRestaurant: eliminated,
    voteCounts:           counts,
  });

  const remaining = activeRestaurants(room);

  if (remaining.length === 1 || room.round >= MAX_ROUNDS) {
    const winner = remaining[0];
    room.status  = "finished";

    if (room.dbRoomId) {
      db.query(
        `UPDATE Rooms SET status = 'finished', winner_restaurant_id = $1 WHERE room_id = $2`,
        [winner.id, room.dbRoomId],
      ).catch(err => console.error("Room update error:", err));
    }

    setTimeout(() => io.to(sessionId).emit("game_over", { winner }), 2500);
  } else {
    room.round += 1;
    if (room.dbRoomId) {
      db.query(
        `UPDATE Rooms SET current_round = $1 WHERE room_id = $2`,
        [room.round, room.dbRoomId],
      ).catch(() => {});
    }
    setTimeout(() => startRound(io, sessionId), 2500);
  }
}

// ── Pick/Ban handler ───────────────────────────────────────────────────────

export function registerPickBanHandlers(io: SocketServer) {
  io.on("connection", (socket: Socket) => {
    console.log(`[pickban] connected: ${socket.id}`);

    // ── join_room ──────────────────────────────────────────────────────────
    // Server is authoritative: loads restaurants from DB, ignores any client payload.
    socket.on("join_room", async ({ sessionId, restaurants: clientRestaurants }: { sessionId: string; restaurants?: Restaurant[] }) => {
      if (!sessionId) return;
      console.log(`[pickban] ${socket.id} joining room ${sessionId}`);
      socket.join(sessionId);

      let room = rooms.get(sessionId);

      if (!room) {
        // Load restaurants from DB first (written by geminiRController or lobbySocket)
        let restaurants: Restaurant[] = [];
        try {
          restaurants = await loadRestaurantsFromDB(sessionId);
          console.log(`[pickban] loaded ${restaurants.length} restaurants from DB for session ${sessionId}`);
        } catch (err) {
          console.error("[pickban] Failed to load restaurants from DB:", err);
        }

        // Fallback: use restaurants passed from the client if DB had nothing
        if (restaurants.length === 0 && Array.isArray(clientRestaurants) && clientRestaurants.length > 0) {
          console.warn(`[pickban] DB had no restaurants for ${sessionId} — using ${clientRestaurants.length} from client payload`);
          restaurants = clientRestaurants;
        }

        if (restaurants.length === 0) {
          console.error(`[pickban] No restaurants available for session ${sessionId}`);
          socket.emit("error_event", { message: "No restaurants found for this session." });
          return;
        }

        // Create DB room record
        let dbRoomId: string | undefined;
        try {
          const result = await db.query(
            `INSERT INTO Rooms (session_id, status, current_round) VALUES ($1, 'active', 1) RETURNING room_id`,
            [sessionId],
          );
          dbRoomId = result.rows[0]?.room_id;
        } catch (err) {
          console.error("[pickban] Failed to insert room:", err);
        }

        room = {
          sessionId,
          restaurants,
          eliminatedIds: [],
          round:  1,
          votes:  new Map(),
          timer:  null,
          status: "waiting",
          dbRoomId,
        };
        rooms.set(sessionId, room);

        // Inform all clients which restaurants are in play
        io.to(sessionId).emit("room_info", { restaurants });

        startRound(io, sessionId);
      } else {
        // Late-joiner: catch up
        socket.emit("room_info", { restaurants: room.restaurants });

        if (room.status === "finished") {
          const winner = activeRestaurants(room)[0];
          socket.emit("game_over", { winner });
        } else {
          socket.emit("round_start", {
            round:          room.round,
            restaurants:    activeRestaurants(room),
            allRestaurants: room.restaurants,
            eliminatedIds:  [...room.eliminatedIds],
            timeLeft:       ROUND_SECONDS,
          });
        }
      }
    });

    // ── cast_vote ──────────────────────────────────────────────────────────
    socket.on(
      "cast_vote",
      ({ sessionId, restaurantId }: { sessionId: string; restaurantId: number | null }) => {
        const room = rooms.get(sessionId);
        if (!room || room.status !== "active") return;

        // Remove any previous vote from this socket
        for (const [, voters] of room.votes) voters.delete(socket.id);

        if (restaurantId !== null) {
          room.votes.get(restaurantId)?.add(socket.id);
        }

        io.to(sessionId).emit("vote_update", { voteCounts: voteCounts(room) });
      },
    );

    // ── disconnect ─────────────────────────────────────────────────────────
    socket.on("disconnect", () => {
      console.log(`[pickban] disconnected: ${socket.id}`);
      // Remove votes cast by this socket
      for (const room of rooms.values()) {
        for (const [, voters] of room.votes) voters.delete(socket.id);
      }
    });
  });
}
