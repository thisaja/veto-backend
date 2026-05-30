import http from "http";
import { Server as SocketServer } from "socket.io";
import app from "./app";
import { registerPickBanHandlers }     from "./sockets/pickBanSocket";
import { registerLobbyHandlers }       from "./sockets/lobbySocket";
import { registerNotificationHandlers } from "./sockets/notificationSocket";

const PORT = process.env.PORT || 5000;

const server = http.createServer(app);

// One shared SocketServer — pick-ban uses default namespace, lobby uses /lobby
const io = new SocketServer(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

registerPickBanHandlers(io);
registerLobbyHandlers(io);
registerNotificationHandlers(io);

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
