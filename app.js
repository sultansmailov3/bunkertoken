// ===============================
// Bunker Survival DApp — app.js
// ethers.js v5 + MetaMask (Sepolia)
// ===============================

let provider;
let signer;
let bunkerContract;

// === CONFIG ===
const SEPOLIA_CHAIN_ID = "0xaa36a7"; // 11155111
const CROWDFUNDING_ADDRESS = "0x2551462F9bAaA8dfd4BCE95b4e177e236b9FCF23";

// === ABI (BunkerCrowdfunding) ===
const CROWDFUNDING_ABI = [
  {
    "inputs": [
      { "internalType": "address", "name": "rewardTokenAddress", "type": "address" }
    ],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  {
    "inputs": [
      { "internalType": "string", "name": "name", "type": "string" },
      { "internalType": "uint256", "name": "goalWei", "type": "uint256" },
      { "internalType": "uint256", "name": "durationDays", "type": "uint256" }
    ],
    "name": "createBunker",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "uint256", "name": "bunkerId", "type": "uint256" }],
    "name": "contributeToBunker",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getBunkers",
    "outputs": [
      {
        "components": [
          { "internalType": "string", "name": "name", "type": "string" },
          { "internalType": "uint256", "name": "goal", "type": "uint256" },
          { "internalType": "uint256", "name": "totalFunded", "type": "uint256" },
          { "internalType": "uint256", "name": "deadline", "type": "uint256" },
          { "internalType": "bool", "name": "active", "type": "bool" }
        ],
        "internalType": "struct BunkerCrowdfunding.Bunker[]",
        "name": "",
        "type": "tuple[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "rewardToken",
    "outputs": [{ "internalType": "contract IRewardToken", "name": "", "type": "address" }],
    "stateMutability": "view",
    "type": "function"
  }
];

// === ABI (ERC-20 minimal) ===
const ERC20_ABI = [
  {
    "inputs": [{ "name": "owner", "type": "address" }],
    "name": "balanceOf",
    "outputs": [{ "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "decimals",
    "outputs": [{ "type": "uint8" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "symbol",
    "outputs": [{ "type": "string" }],
    "stateMutability": "view",
    "type": "function"
  }
];

// === HELPERS ===
function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

async function checkNetwork() {
  const chainId = await window.ethereum.request({ method: "eth_chainId" });
  if (chainId !== SEPOLIA_CHAIN_ID) {
    throw new Error("Please switch MetaMask to Sepolia test network");
  }
}

// === CONNECT WALLET ===
window.connectWallet = async function () {
  if (!window.ethereum) {
    alert("MetaMask not found");
    return;
  }

  try {
    await checkNetwork();

    provider = new ethers.providers.Web3Provider(window.ethereum);
    await provider.send("eth_requestAccounts", []);
    signer = provider.getSigner();

    bunkerContract = new ethers.Contract(
      CROWDFUNDING_ADDRESS,
      CROWDFUNDING_ABI,
      signer
    );

    await updateBalances();
    await loadBunkers();

    window.ethereum.on("accountsChanged", () => window.location.reload());
    window.ethereum.on("chainChanged", () => window.location.reload());

  } catch (err) {
    alert(err.message);
  }
};

// === UPDATE BALANCES ===
async function updateBalances() {
  const user = await signer.getAddress();

  // ETH
  const ethBal = await provider.getBalance(user);
  setText("ethBalance", ethers.utils.formatEther(ethBal));

  // Token
  try {
    const tokenAddress = await bunkerContract.rewardToken();
    const token = new ethers.Contract(tokenAddress, ERC20_ABI, provider);

    const [decimals, symbol, raw] = await Promise.all([
      token.decimals(),
      token.symbol(),
      token.balanceOf(user)
    ]);

    setText(
      "tokenBalance",
      ethers.utils.formatUnits(raw, decimals) + " " + symbol
    );
  } catch {
    setText("tokenBalance", "–");
  }
}

// === CREATE BUNKER ===
window.createBunker = async function () {
  if (!bunkerContract) {
    alert("Connect wallet first");
    return;
  }

  const name = document.getElementById("bunkerName").value;
  const goal = document.getElementById("bunkerGoal").value;
  const days = document.getElementById("bunkerDuration").value;

  if (!name || !goal || !days) {
    alert("Fill all fields");
    return;
  }

  try {
    const tx = await bunkerContract.createBunker(
      name,
      ethers.utils.parseEther(goal),
      days
    );
    await tx.wait();

    await updateBalances();
    await loadBunkers();
  } catch (e) {
    alert("Create bunker failed");
    console.error(e);
  }
};

// === LOAD BUNKERS ===
window.loadBunkers = async function () {
  if (!bunkerContract) return;

  const box = document.getElementById("bunkersContainer");
  box.innerHTML = "";

  try {
    const bunkers = await bunkerContract.getBunkers();

    if (bunkers.length === 0) {
      box.innerHTML = "<div>No bunkers yet</div>";
      return;
    }

    bunkers.forEach((b, i) => {
      box.innerHTML += `
        <div class="card">
          <div class="bunker-title">${b.name}</div>
          <div class="bunker-meta">Goal: ${ethers.utils.formatEther(b.goal)} ETH</div>
          <div class="bunker-meta">Funded: ${ethers.utils.formatEther(b.totalFunded)} ETH</div>
          <div class="bunker-meta">Status: ${b.active ? "Active" : "Closed"}</div>
          <div class="contrib-row">
            <input id="v${i}" placeholder="0.01" />
            <button onclick="joinBunker(${i})" ${b.active ? "" : "disabled"}>
              Join
            </button>
          </div>
        </div>
      `;
    });
  } catch (e) {
    box.innerHTML = "<div>Error loading bunkers</div>";
    console.error(e);
  }
};

// === JOIN BUNKER ===
window.joinBunker = async function (id) {
  const input = document.getElementById("v" + id);
  const amount = input.value.trim().replace(",", ".");

  if (!amount || Number(amount) <= 0) {
    alert("Enter valid ETH amount");
    return;
  }

  try {
    const tx = await bunkerContract.contributeToBunker(id, {
      value: ethers.utils.parseEther(amount)
    });
    await tx.wait();

    input.value = "";
    await updateBalances();
    await loadBunkers();
  } catch (e) {
    alert("Transaction failed");
    console.error(e);
  }
};
