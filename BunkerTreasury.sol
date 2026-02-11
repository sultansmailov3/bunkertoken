// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20Like {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

contract BunkerTreasury {
    IERC20Like public token;
    address public admin;
    address public feeReceiver;

    uint16 public feeBps = 500;

    struct Room {
        bool exists;
        bool resolved;
        uint256 entryFee;
        uint256 pot;
        mapping(address => bool) paid;
    }

    mapping(bytes32 => Room) private rooms;

    event RoomCreated(bytes32 indexed roomId, uint256 entryFee);
    event Paid(bytes32 indexed roomId, address indexed player, uint256 amount, uint256 fee);
    event Resolved(bytes32 indexed roomId, address[] winners, uint256 paidPerWinner);

    modifier onlyAdmin() {
        require(msg.sender == admin, "only admin");
        _;
    }

    constructor(address tokenAddress, address _feeReceiver) {
        token = IERC20Like(tokenAddress);
        admin = msg.sender;
        feeReceiver = _feeReceiver;
    }

    function createRoom(bytes32 roomId, uint256 entryFee) external onlyAdmin {
        Room storage r = rooms[roomId];
        require(!r.exists, "already exists");

        r.exists = true;
        r.entryFee = entryFee;

        emit RoomCreated(roomId, entryFee);
    }

    function hasPaid(bytes32 roomId, address player) external view returns (bool) {
        Room storage r = rooms[roomId];
        require(r.exists, "no room");
        return r.paid[player];
    }

    function payEntry(bytes32 roomId) external {
        Room storage r = rooms[roomId];
        require(r.exists, "no room");
        require(!r.resolved, "resolved");
        require(!r.paid[msg.sender], "already paid");

        uint256 amount = r.entryFee;
        require(amount > 0, "fee=0");

        uint256 fee = (amount * feeBps) / 10000;
        uint256 net = amount - fee;

        require(token.transferFrom(msg.sender, feeReceiver, fee), "fee transfer fail");
        require(token.transferFrom(msg.sender, address(this), net), "pot transfer fail");

        r.paid[msg.sender] = true;
        r.pot += net;

        emit Paid(roomId, msg.sender, amount, fee);
    }

    function resolve(bytes32 roomId, address[] calldata winners) external onlyAdmin {
        Room storage r = rooms[roomId];
        require(r.exists, "no room");
        require(!r.resolved, "already resolved");
        require(winners.length > 0, "no winners");

        r.resolved = true;

        uint256 perWinner = r.pot / winners.length;

        for (uint256 i = 0; i < winners.length; i++) {
            require(token.transfer(winners[i], perWinner), "pay fail");
        }

        emit Resolved(roomId, winners, perWinner);
    }
}
