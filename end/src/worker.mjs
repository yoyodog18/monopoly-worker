import { Room } from "./room.mjs";
export { Room };

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // WebSocket endpoint: /ws/:roomId
    if (url.pathname.startsWith("/ws/")) {
      const roomId = url.pathname.split("/").pop();
      if (!roomId) return new Response("roomId required", { status: 400 });

      const id = env.ROOMS.idFromName(roomId);
      const stub = env.ROOMS.get(id);
      return stub.fetch(request); // proxy the upgrade to the Durable Object
    }

    if (url.pathname === "/health") return new Response("ok");
    return new Response("Not found", { status: 404 });
  }
};
