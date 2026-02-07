import { nanoid } from "nanoid";
import { CARDS, pick } from "./cards.js";

function makePlayer(userId, name) {
  return {
    id: userId,
    name,
    alive: true,
    revealed: { profession: false, health: false, hobby: false, baggage: false, phobia: false },
    cards: {
      profession: pick(CARDS.profession),
      health: pick(CARDS.health),
      hobby: pick(CARDS.hobby),
      baggage: pick(CARDS.baggage),
      phobia: pick(CARDS.phobia)
    }
  };
}

export function createRoom(hostSocketId, hostName) {
  const roomId = nanoid(6).toUpperCase();
  return {
    id: roomId,
    hostSocketId,
    phase: "lobby",
    round: 1,
    roundEndsAt: null,
    playersBySocket: new Map(),
    votes: new Map(),
    log: [],
    settings: { roundSeconds: 90 },
    bunker: { catastrophe: "Global nuclear winter", capacity: 3 }
  };
}

export function addPlayer(room, socketId, name) {
  const p = makePlayer(socketId, name);
  room.playersBySocket.set(socketId, p);
  room.log.push(`${name} joined`);
  return p;
}

export function removePlayer(room, socketId) {
  const p = room.playersBySocket.get(socketId);
  if (!p) return;
  room.playersBySocket.delete(socketId);
  room.votes.delete(socketId);
  for (const [voter, target] of room.votes.entries()) {
    if (target === socketId) room.votes.delete(voter);
  }
  room.log.push(`${p.name} left`);
}

export function getPublicState(room) {
  const players = [...room.playersBySocket.entries()].map(([socketId, p]) => ({
    socketId,
    name: p.name,
    alive: p.alive,
    revealed: p.revealed,
    cards: {
      profession: p.revealed.profession ? p.cards.profession : null,
      health: p.revealed.health ? p.cards.health : null,
      hobby: p.revealed.hobby ? p.cards.hobby : null,
      baggage: p.revealed.baggage ? p.cards.baggage : null,
      phobia: p.revealed.phobia ? p.cards.phobia : null
    }
  }));

  return {
    id: room.id,
    hostSocketId: room.hostSocketId,
    phase: room.phase,
    round: room.round,
    roundEndsAt: room.roundEndsAt,
    settings: room.settings,
    bunker: room.bunker,
    players,
    votesCount: countVotes(room),
    log: room.log.slice(-20)
  };
}

export function getPrivateState(room, socketId) {
  const me = room.playersBySocket.get(socketId);
  if (!me) return null;
  return { myCards: me.cards, myRevealed: me.revealed };
}

export function reveal(room, socketId, key) {
  const p = room.playersBySocket.get(socketId);
  if (!p || !p.alive) return false;
  if (!(key in p.revealed)) return false;
  p.revealed[key] = true;
  room.log.push(`${p.name} revealed ${key}`);
  return true;
}

export function startRound(room, nowMs) {
  room.phase = "round";
  room.roundEndsAt = nowMs + room.settings.roundSeconds * 1000;
  room.log.push(`Round ${room.round} started (${room.settings.roundSeconds}s)`);
}

export function toVoting(room) {
  room.phase = "voting";
  room.votes = new Map();
  room.log.push(`Voting started`);
}

export function vote(room, voterSocketId, targetSocketId) {
  const voter = room.playersBySocket.get(voterSocketId);
  const target = room.playersBySocket.get(targetSocketId);
  if (!voter || !target) return false;
  if (!voter.alive || !target.alive) return false;
  if (voterSocketId === targetSocketId) return false;
  room.votes.set(voterSocketId, targetSocketId);
  return true;
}

export function finishVoting(room) {
  const tally = new Map();
  for (const target of room.votes.values()) {
    tally.set(target, (tally.get(target) || 0) + 1);
  }
  let max = 0;
  let losers = [];
  for (const [target, c] of tally.entries()) {
    if (c > max) { max = c; losers = [target]; }
    else if (c === max) losers.push(target);
  }

  if (losers.length !== 1 || max === 0) {
    room.log.push(`Voting ended: tie/no votes`);
  } else {
    const loserSock = losers[0];
    const p = room.playersBySocket.get(loserSock);
    if (p) {
      p.alive = false;
      room.log.push(`Eliminated: ${p.name}`);
    }
  }

  const alive = [...room.playersBySocket.values()].filter(p => p.alive);
  if (alive.length <= room.bunker.capacity) {
    room.phase = "ended";
    room.log.push(`Game ended. Survivors: ${alive.map(a => a.name).join(", ")}`);
  } else {
    room.round += 1;
    room.phase = "lobby";
    room.roundEndsAt = null;
    room.log.push(`Back to lobby for next round`);
  }
}

export function countVotes(room) {
  const tally = {};
  for (const target of room.votes.values()) {
    tally[target] = (tally[target] || 0) + 1;
  }
  return tally;
}
