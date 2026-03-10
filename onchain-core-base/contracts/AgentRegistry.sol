// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "./interfaces/IERC8004Registry.sol";
import "./interfaces/IAgentTreasury.sol";
import { AgentCard } from "./interfaces/AgentTypes.sol";

/// @title Agent Registry Contract
/// @notice Handles the creation and registration of new AI agents.
/// @dev Interacts with the ERC-8004 Identity Registry to mint agent NFTs and immediately 
/// routes them to the AgentTreasury for secure custodial storage.
contract AgentRegistry is Ownable, IERC721Receiver {

    // ─────────────────────────────────────────
    // DEPENDENCIES
    // ─────────────────────────────────────────

    /// @notice The ERC-8004 Identity Registry contract address (immutable)
    IERC8004Registry public immutable erc8004;
    
    /// @notice The Agent Treasury interface (immutable)
    IAgentTreasury public immutable agentTreasury;

    // ─────────────────────────────────────────
    // STRUCT
    // ─────────────────────────────────────────

    /// @notice On-chain record mapping an agent to its beneficial owner
    struct AgentRecord {
        address beneficialOwner;
        uint256 createdAt;
        bool    exists;
    }

    // ─────────────────────────────────────────
    // STORAGE
    // ─────────────────────────────────────────

    /// @notice Total number of agents registered through this contract
    uint256 public totalAgents;

    /// @dev Mapping from agentId to its core record
    mapping(uint256 => AgentRecord) private _agents;

    /// @dev Mapping from owner address to an array of their owned agentIds
    mapping(address => uint256[]) private _ownerAgents;

    /// @dev Mapping from owner address to agentId to its index in the _ownerAgents array
    mapping(address => mapping(uint256 => uint256)) private _ownerAgentIndex;

    // ─────────────────────────────────────────
    // EVENTS
    // ─────────────────────────────────────────

    /// @notice Emitted when a new agent is successfully registered
    /// @param agentId The ERC-8004 token ID of the newly created agent
    /// @param beneficialOwner The user who registered and owns the agent off-chain
    event AgentRegistered(uint256 indexed agentId, address indexed beneficialOwner);

    // ─────────────────────────────────────────
    // MODIFIERS
    // ─────────────────────────────────────────

    /// @notice Ensures the transaction sender is the recorded beneficial owner of the agent
    modifier onlyAgentOwner(uint256 agentId) {
        require(_agents[agentId].exists, "Agent not found");
        require(_agents[agentId].beneficialOwner == msg.sender, "Not agent owner");
        _;
    }

    /// @notice Ensures the agent has been registered and exists
    modifier agentExists(uint256 agentId) {
        require(_agents[agentId].exists, "Agent not found");
        _;
    }

    // ─────────────────────────────────────────
    // CONSTRUCTOR
    // ─────────────────────────────────────────

    /// @notice Initializes the Agent Registry
    /// @param _erc8004 Address of the ERC-8004 Identity Registry
    /// @param _treasury Address of the Agent Treasury
    constructor(address _erc8004, address _treasury) Ownable(msg.sender) {
        require(_erc8004 != address(0), "Zero address: erc8004");
        require(_treasury != address(0), "Zero address: treasury");
        
        erc8004 = IERC8004Registry(_erc8004);
        agentTreasury = IAgentTreasury(_treasury);
    }

    // ─────────────────────────────────────────
    // MANAGEMENT
    // ─────────────────────────────────────────

    /// @notice Overrides the default renounceOwnership to prevent locking the contract
    /// @dev Reverts unconditionally. The registry must always have an owner.
    function renounceOwnership() public view override onlyOwner {
        revert("Ownership renouncement disabled");
    }

    // ─────────────────────────────────────────
    // REGISTRATION
    // ─────────────────────────────────────────

    /// @notice Registers a new AI agent, mints its ERC-8004 NFT, and routes it to the Treasury
    /// @param card The metadata for the agent (endpoint is used as tokenURI)
    /// @param walletDeadline Deadline for the ERC-8004 wallet signature (must be <= block.timestamp + 5 mins)
    /// @param walletSig EIP-712 signature from msg.sender over AgentWalletSet in the ERC8004 domain
    /// @return agentId The newly minted ERC-8004 token ID
    function registerAgent(
        AgentCard calldata card,
        uint256 walletDeadline,
        bytes calldata walletSig
    )
        external
        returns (uint256 agentId)
    {
        // 1. Mint NFT on AgentRegistry — card.endpoint used as tokenURI
        agentId = erc8004.register(card.endpoint);

        // 2. Transfer NFT to AgentTreasury (agentWallet is cleared by ERC8004._update during transfer)
        erc8004.safeTransferFrom(address(this), address(agentTreasury), agentId);

        // 3. Treasury sets agentWallet = msg.sender via ERC8004.setAgentWallet using the provided signature
        agentTreasury.initAgent(agentId, msg.sender, walletDeadline, walletSig);

        // 4. Save internal ownership record
        _agents[agentId] = AgentRecord({
            beneficialOwner: msg.sender,
            createdAt: block.timestamp,
            exists: true
        });

        _ownerAgentIndex[msg.sender][agentId] = _ownerAgents[msg.sender].length;
        _ownerAgents[msg.sender].push(agentId);

        totalAgents++;
        emit AgentRegistered(agentId, msg.sender);
    }

    // ─────────────────────────────────────────
    // GETTERS
    // ─────────────────────────────────────────

    /// @notice Returns the beneficial owner of an agent
    /// @param agentId The ID of the agent
    /// @return The address of the beneficial owner
    function getAgentOwner(uint256 agentId) external view returns (address) {
        return _agents[agentId].beneficialOwner;
    }

    /// @notice Returns core information about a registered agent
    /// @param agentId The ID of the agent
    /// @return beneficialOwner The recorded owner of the agent
    /// @return agentWallet The active on-chain wallet of the agent from ERC-8004
    /// @return createdAt The timestamp when the agent was registered
    function getAgentInfo(uint256 agentId)
        external
        view
        agentExists(agentId)
        returns (
            address beneficialOwner,
            address agentWallet,
            uint256 createdAt
        )
    {
        AgentRecord memory record = _agents[agentId];
        beneficialOwner = record.beneficialOwner;
        agentWallet = erc8004.getAgentWallet(agentId);
        createdAt = record.createdAt;
    }

    /// @notice Returns an array of all agent IDs owned by a specific address
    function getAgentsByOwner(address owner) external view returns (uint256[] memory) {
        return _ownerAgents[owner];
    }

    /// @notice Returns the agent ID for a specific owner at a given index
    function agentOfOwnerByIndex(address owner, uint256 index)
        external
        view
        returns (uint256)
    {
        require(index < _ownerAgents[owner].length, "Index out of bounds");
        return _ownerAgents[owner][index];
    }

    /// @notice Checks if an address is the beneficial owner of a specific agent
    function isOwner(uint256 agentId, address addr) external view returns (bool) {
        return _agents[agentId].beneficialOwner == addr;
    }

    /// @notice Checks if a specific agent ID has already been registered
    function isIdTaken(uint256 agentId) external view returns (bool) {
        return _agents[agentId].exists;
    }

    // ─────────────────────────────────────────
    // ERC-721 RECEIVER
    // ─────────────────────────────────────────

    /// @notice Standard ERC721 receiver hook
    /// @dev Allows the contract to safely receive ERC8004 NFT mints before forwarding them to the Treasury.
    /// Restricts incoming NFTs to ONLY the official ERC-8004 Registry.
    function onERC721Received(address, address, uint256, bytes calldata)
        external view override returns (bytes4)
    {
        require(msg.sender == address(erc8004), "Only designated ERC8004 allowed");
        return IERC721Receiver.onERC721Received.selector;
    }
}