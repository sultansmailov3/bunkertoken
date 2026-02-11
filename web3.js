const TOKEN_ADDRESS = "0xc699BA12dCeA3B1CE92AadF579aE605e53980a3D";
const TREASURY_ADDRESS = "0xA46aA955787CFED84009dC7D1454616a1A67D834";

const TOKEN_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)"
];

const TREASURY_ABI = [
  "function createRoom(bytes32 roomId, uint256 entryFee)",
  "function payEntry(bytes32 roomId)",
  "function hasPaid(bytes32 roomId, address player) view returns (bool)"
];

let provider, signer, account;
let token, treasury;

const elAcc = document.getElementById("acc");
const elNet = document.getElementById("net");
const elBal = document.getElementById("bal");
const elPaid = document.getElementById("paid");
const elWeb3Err = document.getElementById("web3Err");

function web3Error(msg){
  if (elWeb3Err) elWeb3Err.textContent = msg || "";
}

function getRoomId() {
  const s = document.getElementById("roomId").value.trim();
  if (!s) throw new Error("Введите ROOM ID в поле выше!");
  return ethers.id(s); 
}

// БЕЗОПАСНАЯ ПРИВЯЗКА СОБЫТИЙ
const bind = (id, fn) => {
  const el = document.getElementById(id);
  if (el) el.addEventListener("click", fn);
};

bind("btnConnect", connect);
bind("btnCreateRoom", createRoom);
bind("btnApprove", approve10);
bind("btnPay", payEntry10);
bind("btnCheck", checkPaid);

async function connect() {
  try {
    web3Error("");
    if (!window.ethereum) return web3Error("MetaMask не найден.");
    
    provider = new ethers.BrowserProvider(window.ethereum);
    await provider.send("eth_requestAccounts", []);
    signer = await provider.getSigner();
    account = await signer.getAddress();

    token = new ethers.Contract(TOKEN_ADDRESS, TOKEN_ABI, signer);
    treasury = new ethers.Contract(TREASURY_ADDRESS, TREASURY_ABI, signer);

    if (elAcc) elAcc.textContent = account;

    const net = await provider.getNetwork();
    if (elNet) elNet.textContent = `${net.name} (chainId=${net.chainId})`;

    if (Number(net.chainId) !== 11155111) {
      web3Error("⚠️ Переключись на Sepolia (11155111).");
    }

    await refreshBalance();
  } catch (e) {
    web3Error("Connect error: " + (e?.message || e));
  }
}

async function refreshBalance() {
  try {
    if (!token || !account) return;
    const bal = await token.balanceOf(account);
    if (elBal) elBal.textContent = ethers.formatEther(bal);
  } catch(e) { web3Error("Balance error: " + e.message); }
}

async function createRoom() {
  try {
    if (!treasury) return web3Error("Сначала Connect MetaMask");
    const roomId = getRoomId();
    const entryFee = ethers.parseEther("10");
    const tx = await treasury.createRoom(roomId, entryFee);
    await tx.wait();
    alert("Room created in Blockchain!");
  } catch(e) { web3Error("createRoom error: " + e.message); }
}

async function approve10() {
  try {
    if (!token) return web3Error("Сначала Connect MetaMask");
    const amount = ethers.parseEther("10");
    const tx = await token.approve(TREASURY_ADDRESS, amount);
    await tx.wait();
    alert("Approved 10 BUNK!");
  } catch(e) { web3Error("approve error: " + e.message); }
}

async function payEntry10() {
  try {
    if (!treasury) return web3Error("Сначала Connect MetaMask");
    const roomId = getRoomId();
    const tx = await treasury.payEntry(roomId);
    await tx.wait();
    alert("Entry paid!");
    await refreshBalance();
  } catch(e) { web3Error("payEntry error: " + e.message); }
}

async function checkPaid() {
  try {
    if (!treasury || !account) { web3Error("Сначала Connect MetaMask"); return false; }
    const roomId = getRoomId();
    const ok = await treasury.hasPaid(roomId, account);
    if (elPaid) elPaid.textContent = ok ? "true ✅" : "false ❌";
    return ok;
  } catch(e) {
    web3Error("hasPaid error: " + e.message);
    return false;
  }
}
