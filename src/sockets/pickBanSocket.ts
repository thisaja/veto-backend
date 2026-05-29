import { Server as HttpServer } from "http";
import { Server as SocketServer, Socket } from "socket.io";
import db from "../config/db";

// ── Types ──────────────────────────────────────────────────────────────────

interface Restaurant {
  id: number;
  header: string;
  imageURL: string;
  imageURLs?: string[];
  label: string;
  priceRange?: string;
  rating?: string;
  caption: string;
  popularItems?: string[];
}

interface Room {
  sessionId: string;
  restaurants: Restaurant[];      // full list, never mutated
  eliminatedIds: number[];        // accumulated across all rounds
  round: number;                  // current round (1–4)
  votes: Map<number, Set<string>>; // restaurantId → set of socket IDs
  timer: ReturnType<typeof setTimeout> | null;
  status: "waiting" | "active" | "round_end" | "finished";
  dbRoomId?: string;
}

// ── In-memory room store ───────────────────────────────────────────────────

const rooms = new Map<string, Room>();

const ROUND_SECONDS = 30;
const MAX_ROUNDS   = 4; // 5 restaurants → 4 eliminations → 1 winner

// ── Helpers ────────────────────────────────────────────────────────────────

function activeRestaurants(room: Room): Restaurant[] {
  return room.restaurants.filter((r) => !room.eliminatedIds.includes(r.id));
}

function voteCounts(room: Room): Record<number, number> {
  const counts: Record<number, number> = {};
  for (const r of activeRestaurants(room)) {
    counts[r.id] = room.votes.get(r.id)?.size ?? 0;
  }
  return counts;
}

// ── Round lifecycle ────────────────────────────────────────────────────────

function startRound(io: SocketServer, sessionId: string) {
  const room = rooms.get(sessionId);
  if (!room) return;

  // Reset votes for each active restaurant
  room.votes = new Map();
  for (const r of activeRestaurants(room)) {
    room.votes.set(r.id, new Set());
  }

  room.status = "active";

  io.to(sessionId).emit("round_start", {
    round: room.round,
    restaurants: activeRestaurants(room),
    eliminatedIds: [...room.eliminatedIds],
    timeLeft: ROUND_SECONDS,
  });

  // Server-authoritative timer
  if (room.timer) clearTimeout(room.timer);
  room.timer = setTimeout(() => resolveRound(io, sessionId), ROUND_SECONDS * 1000);
}

function resolveRound(io: SocketServer, sessionId: string) {
  const room = rooms.get(sessionId);
  if (!room || room.status !== "active") return;

  room.status = "round_end";
  if (room.timer) { clearTimeout(room.timer); room.timer = null; }

  const active = activeRestaurants(room);
  const counts = voteCounts(room);

  // Find max votes (0 is fine — random elimination if nobody voted)
  const maxVotes = Math.max(0, ...active.map((r) => counts[r.id] ?? 0));
  const topCandidates = active.filter((r) => (counts[r.id] ?? 0) === maxVotes);
  const eliminated = topCandidates[Math.floor(Math.random() * topCandidates.length)];

  room.eliminatedIds.push(eliminated.id);

  // Persist round summary
  if (room.dbRoomId) {
    for (const r of active) {
      db.query(
        `INSERT INTO RoundVotes (room_id, round_number, restaurant_id, vote_count)
         VALUES ($1, $2, $3, $4)`,
        [room.dbRoomId, room.round, r.id, counts[r.id] ?? 0]
      ).catch((err) => console.error("RoundVotes insert error:", err));
    }
  }

  io.to(sessionId).emit("round_end", {
    round: room.round,
    eliminatedId: eliminated.id,
    eliminatedRestaurant: eliminated,
    voteCounts: counts,
  });

  const remaining = activeRestaurants(room);

  if (remaining.length === 1 || room.round >= MAX_ROUNDS) {
    // ── Game over ──
    const winner = remaining[0];
    room.status = "finished";

    if (room.dbRoomId) {
      db.query(
        `UPDATE Rooms SET status = 'finished', winner_restaurant_id = $1 WHERE room_id = $2`,
        [winner.id, room.dbRoomId]
      ).catch((err) => console.error("Room update error:", err));
    }

    setTimeout(() => {
      io.to(sessionId).emit("game_over", { winner });
    }, 2500);
  } else {
    // ── Next round ──
    room.round += 1;

    if (room.dbRoomId) {
      db.query(
        `UPDATE Rooms SET current_round = $1 WHERE room_id = $2`,
        [room.round, room.dbRoomId]
      ).catch((err) => console.error("Room round update error:", err));
    }

    setTimeout(() => startRound(io, sessionId), 2500);
  }
}

// ── Socket.IO init ─────────────────────────────────────────────────────────

export function initPickBanSocket(server: HttpServer) {
  const io = new SocketServer(server, {
    cors: { origin: "*", methods: ["GET", "POST"] },
  });

  io.on("connection", (socket: Socket) => {
    console.log(`[socket] connected: ${socket.id}`);

    // ── join_room ──────────────────────────────────────────────────────────
    socket.on(
      "join_room",
      async ({ sessionId, restaurants }: { sessionId: string; restaurants: Restaurant[] }) => {
        if (!sessionId) return;
        console.log(`[socket] ${socket.id} joining room ${sessionId}`);
        socket.join(sessionId);

        let room = rooms.get(sessionId);

        if (!room) {
          // Create DB record
          let dbRoomId: string | undefined;
          try {
            const result = await db.query(
              `INSERT INTO Rooms (session_id, status, current_round)
               VALUES ($1, 'active', 1) RETURNING room_id`,
              [sessionId]
            );
            dbRoomId = result.rows[0]?.room_id;
          } catch (err) {
            console.error("[socket] Failed to insert room:", err);
          }

          room = {
            sessionId,
            restaurants,
            eliminatedIds: [],
            round: 1,
            votes: new Map(),
            timer: null,
            status: "waiting",
            dbRoomId,
          };
          rooms.set(sessionId, room);
          startRound(io, sessionId);
        } else {
          // Late-joiner: send current state
          if (room.status === "finished") {
            const winner = activeRestaurants(room)[0];
            socket.emit("game_over", { winner });
          } else {
            socket.emit("round_start", {
              round: room.round,
              restaurants: activeRestaurants(room),
              eliminatedIds: [...room.eliminatedIds],
              timeLeft: ROUND_SECONDS,
            });
          }
        }
      }
    );

    // ── cast_vote ──────────────────────────────────────────────────────────
    // Clients may call cast_vote multiple times to change their vote.
    // The server removes the socket's previous vote (if any) before applying the new one.
    socket.on(
      "cast_vote",
      ({ sessionId, restaurantId }: { sessionId: string; restaurantId: number | null }) => {
        const room = rooms.get(sessionId);
        if (!room || room.status !== "active") return;

        // Remove existing vote from whichever restaurant this socket previously voted for
        for (const [, voters] of room.votes) {
          voters.delete(socket.id);
        }

        // If restaurantId is null the user is simply removing their vote
        if (restaurantId !== null) {
          const voters = room.votes.get(restaurantId);
          if (voters) voters.add(socket.id);
        }

        io.to(sessionId).emit("vote_update", { voteCounts: voteCounts(room) });
      }
    );

    // ── disconnect ─────────────────────────────────────────────────────────
    socket.on("disconnect", () => {
      console.log(`[socket] disconnected: ${socket.id}`);
    });
  });

  return io;
}
