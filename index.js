import express from "express";
import http from "http";
import { Server } from "socket.io";
import path from "path";
import { fileURLToPath } from "url";

import {
  createRoom, addPlayer, removePlayer,
  getPublicState, getPrivateState,
  reveal, startRound, toVoting, vote, finishVoting
} from "./game.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const rooms = new Map();
const socketToRoom = new Map();

app.use(express.static(path.join(__dirname, "../client")));

function emitState(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  io.to(roomId).emit("state", getPublicState(room));
  for (const [sockId] of room.playersBySocket.entries()) {
    io.to(sockId).emit("private", getPrivateState(room, sockId));
  }
}

function mustRoom(socket) {
  const roomId = socketToRoom.get(socket.id);
  if (!roomId) return { roomId: null, room: null };
  return { roomId, room: rooms.get(roomId) };
}

io.on("connection", (socket) => {
  socket.on("room:create", ({ name }) => {
    const room = createRoom(socket.id, name || "Host");
    rooms.set(room.id, room);
    socket.join(room.id);
    socketToRoom.set(socket.id, room.id);
    addPlayer(room, socket.id, name || "Host");
    emitState(room.id);
  });

  socket.on("room:join", ({ roomId, name }) => {
    const id = String(roomId || "").toUpperCase();
    const room = rooms.get(id);
    if (!room) return socket.emit("errorMsg", "Room not found");
    socket.join(id);
    socketToRoom.set(socket.id, id);
    addPlayer(room, socket.id, name || "Player");
    emitState(id);
  });

  socket.on("game:reveal", ({ key }) => {
    const { roomId, room } = mustRoom(socket);
    if (!room) return;
    if (room.phase !== "round") return;
    reveal(room, socket.id, key);
    emitState(roomId);
  });

  socket.on("game:startRound", () => {
    const { roomId, room } = mustRoom(socket);
    if (!room) return;
    if (socket.id !== room.hostSocketId) return;
    if (room.phase !== "lobby") return;
    startRound(room, Date.now());
    emitState(roomId);
  });

  socket.on("game:toVoting", () => {
    const { roomId, room } = mustRoom(socket);
    if (!room) return;
    if (socket.id !== room.hostSocketId) return;
    toVoting(room);
    emitState(roomId);
  });

  socket.on("game:vote", ({ targetSocketId }) => {
    const { roomId, room } = mustRoom(socket);
    if (!room) return;
    if (room.phase !== "voting") return;
    vote(room, socket.id, targetSocketId);
    emitState(roomId);
  });

  socket.on("game:finishVoting", () => {
    const { roomId, room } = mustRoom(socket);
    if (!room) return;
    if (socket.id !== room.hostSocketId) return;
    if (room.phase !== "voting") return;
    finishVoting(room);
    emitState(roomId);
  });

  socket.on("chat:msg", ({ text }) => {
    const { roomId, room } = mustRoom(socket);
    if (!room) return;
    const p = room.playersBySocket.get(socket.id);
    io.to(roomId).emit("chat:msg", { from: p?.name || "?", text: String(text || "").slice(0, 300), ts: Date.now() });
  });

  socket.on("rtc:signal", ({ to, data }) => {
    io.to(to).emit("rtc:signal", { from: socket.id, data });
  });

  socket.on("disconnect", () => {
    const roomId = socketToRoom.get(socket.id);
    if (!roomId) return;
    const room = rooms.get(roomId);
    socketToRoom.delete(socket.id);
    if (!room) return;

    removePlayer(room, socket.id);

    if (room.hostSocketId === socket.id) {
      const next = [...room.playersBySocket.keys()][0];
      room.hostSocketId = next || null;
      room.log.push(`New host assigned`);
    }

    if (room.playersBySocket.size === 0) rooms.delete(roomId);
    else emitState(roomId);
  });
});

setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    if (room.phase === "round" && room.roundEndsAt && now >= room.roundEndsAt) {
      toVoting(room);
      emitState(room.id);
    }
  }
}, 500);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("Server on http://localhost:" + PORT));
