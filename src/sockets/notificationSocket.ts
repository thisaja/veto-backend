import { Server as SocketServer, Namespace } from "socket.io";

let ns: Namespace | null = null;

export function registerNotificationHandlers(io: SocketServer): void {
  ns = io.of("/notifications");

  ns.on("connection", (socket) => {
    socket.on("register", ({ userId }: { userId: string }) => {
      if (userId) {
        socket.join(`user:${userId}`);
      }
    });
  });
}

/** Emit an event to all sockets registered for a given userId. */
export function notifyUser(userId: string, event: string, data?: object): void {
  ns?.to(`user:${userId}`).emit(event, data ?? {});
}
