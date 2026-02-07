const socket = io();

const el = (id) => document.getElementById(id);

const auth = el("auth");
const game = el("game");
const err = el("err");

const roomBadge = el("roomBadge");
const phaseBadge = el("phaseBadge");
const timerBadge = el("timerBadge");

const playersEl = el("players");
const myCardsEl = el("myCards");
const logEl = el("log");

const hostControls = el("hostControls");
const startRoundBtn = el("startRoundBtn");
const toVotingBtn = el("toVotingBtn");
const finishVotingBtn = el("finishVotingBtn");

const chatBox = el("chatBox");
const chatInput = el("chatInput");
const sendMsg = el("sendMsg");

let lastState = null;
let privateState = null;

let localStream = null;
const peers = new Map(); // socketId -> RTCPeerConnection

function setError(t){ err.textContent = t || ""; }

el("createBtn").onclick = () => {
  setError("");
  socket.emit("room:create", { name: el("name").value.trim() || "Host" });
};

el("joinBtn").onclick = () => {
  setError("");
  socket.emit("room:join", { roomId: el("roomId").value.trim(), name: el("name").value.trim() || "Player" });
};

startRoundBtn.onclick = () => socket.emit("game:startRound");
toVotingBtn.onclick = () => socket.emit("game:toVoting");
finishVotingBtn.onclick = () => socket.emit("game:finishVoting");

document.querySelectorAll(".reveal").forEach(btn => {
  btn.onclick = () => socket.emit("game:reveal", { key: btn.dataset.key });
});

sendMsg.onclick = sendChat;
chatInput.addEventListener("keydown", (e) => { if (e.key === "Enter") sendChat(); });

function sendChat(){
  const text = chatInput.value.trim();
  if (!text) return;
  socket.emit("chat:msg", { text });
  chatInput.value = "";
}

socket.on("errorMsg", setError);

socket.on("state", (state) => {
  lastState = state;
  auth.classList.add("hidden");
  game.classList.remove("hidden");

  roomBadge.textContent = `Room: ${state.id}`;
  phaseBadge.textContent = `Phase: ${state.phase} | Round: ${state.round}`;

  renderPlayers(state);
  renderLog(state);
  renderTimer(state);

  const isHost = state.hostSocketId === socket.id;
  hostControls.classList.toggle("hidden", !isHost);

  if (localStream) syncVoicePeers();
});

socket.on("private", (p) => {
  privateState = p;
  renderMyCards();
});

socket.on("chat:msg", (m) => {
  const line = document.createElement("div");
  const time = new Date(m.ts).toLocaleTimeString();
  line.textContent = `[${time}] ${m.from}: ${m.text}`;
  chatBox.appendChild(line);
  chatBox.scrollTop = chatBox.scrollHeight;
});

function renderPlayers(state){
  playersEl.innerHTML = "";
  state.players.forEach(p => {
    const row = document.createElement("div");
    row.className = "player" + (p.alive ? "" : " dead");

    const left = document.createElement("div");
    left.innerHTML = `<b>${p.name}</b> <small>${p.socketId === state.hostSocketId ? "(host)" : ""}</small><br/>
      <small>
        Profession: ${p.cards.profession ?? "?"} |
        Health: ${p.cards.health ?? "?"} |
        Hobby: ${p.cards.hobby ?? "?"} |
        Baggage: ${p.cards.baggage ?? "?"} |
        Phobia: ${p.cards.phobia ?? "?"}
      </small>`;

    const right = document.createElement("div");
    const votes = state.votesCount[p.socketId] || 0;
    right.innerHTML = `<small>Votes: ${votes}</small><br/>`;

    if (state.phase === "voting" && p.alive && p.socketId !== socket.id) {
      const b = document.createElement("button");
      b.className = "voteBtn";
      b.textContent = "Vote";
      b.onclick = () => socket.emit("game:vote", { targetSocketId: p.socketId });
      right.appendChild(b);
    }

    row.appendChild(left);
    row.appendChild(right);
    playersEl.appendChild(row);
  });
}

function renderMyCards(){
  if (!privateState) return;
  const c = privateState.myCards;
  myCardsEl.innerHTML = `
    <div class="muted">Visible only to you:</div>
    <ul>
      <li><b>Profession:</b> ${c.profession}</li>
      <li><b>Health:</b> ${c.health}</li>
      <li><b>Hobby:</b> ${c.hobby}</li>
      <li><b>Baggage:</b> ${c.baggage}</li>
      <li><b>Phobia:</b> ${c.phobia}</li>
    </ul>
  `;
}

function renderLog(state){
  logEl.innerHTML = "";
  state.log.forEach(s => {
    const div = document.createElement("div");
    div.textContent = " " + s;
    logEl.appendChild(div);
  });
  logEl.scrollTop = logEl.scrollHeight;
}

function renderTimer(state){
  if (!state.roundEndsAt) { timerBadge.textContent = "Timer: "; return; }
  const left = Math.max(0, state.roundEndsAt - Date.now());
  timerBadge.textContent = `Timer: ${Math.ceil(left/1000)}s`;
}

setInterval(() => {
  if (lastState) renderTimer(lastState);
}, 300);

// ---------- Voice (WebRTC mesh) ----------
el("voiceOn").onclick = async () => {
  if (localStream) return;
  localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  syncVoicePeers(true);
};

el("voiceOff").onclick = () => stopVoice();

function stopVoice(){
  for (const pc of peers.values()) pc.close();
  peers.clear();
  if (localStream) {
    localStream.getTracks().forEach(t => t.stop());
    localStream = null;
  }
}

function syncVoicePeers(makeOffers=false){
  if (!lastState || !localStream) return;
  const others = lastState.players.map(p => p.socketId).filter(id => id !== socket.id);

  for (const otherId of others) {
    if (!peers.has(otherId)) {
      const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
      peers.set(otherId, pc);

      localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

      pc.ontrack = (e) => {
        const audio = document.createElement("audio");
        audio.autoplay = true;
        audio.srcObject = e.streams[0];
        document.body.appendChild(audio);
      };

      pc.onicecandidate = (e) => {
        if (e.candidate) socket.emit("rtc:signal", { to: otherId, data: { type: "ice", candidate: e.candidate } });
      };
    }
  }

  for (const id of [...peers.keys()]) {
    if (!others.includes(id)) { peers.get(id).close(); peers.delete(id); }
  }

  if (makeOffers) {
    for (const [otherId, pc] of peers.entries()) {
      createOffer(otherId, pc).catch(console.error);
    }
  }
}

async function createOffer(to, pc){
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  socket.emit("rtc:signal", { to, data: { type: "offer", sdp: offer.sdp } });
}

socket.on("rtc:signal", async ({ from, data }) => {
  if (!localStream) return;
  if (!peers.has(from)) syncVoicePeers(false);
  const pc = peers.get(from);
  if (!pc) return;

  if (data.type === "offer") {
    await pc.setRemoteDescription({ type: "offer", sdp: data.sdp });
    const ans = await pc.createAnswer();
    await pc.setLocalDescription(ans);
    socket.emit("rtc:signal", { to: from, data: { type: "answer", sdp: ans.sdp } });
  } else if (data.type === "answer") {
    await pc.setRemoteDescription({ type: "answer", sdp: data.sdp });
  } else if (data.type === "ice") {
    try { await pc.addIceCandidate(data.candidate); } catch {}
  }
});
