// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "./interfaces/IERC8004Registry.sol";

/// @title Agent Treasury Contract
/// @notice Acts as a trusted custodian for ERC-8004 Agent NFTs.
/// It holds the NFTs on behalf of users and manages wallet and metadata updates
/// through an EIP-712 meta-transaction system requiring admin signatures.
/// @dev Implements a one-time setup for the AgentRegistry address to resolve circular deployment dependencies.
contract AgentTreasury is Ownable, EIP712, IERC721Receiver {
    using ECDSA for bytes32;

    // ─────────────────────────────────────────
    // STATE VARIABLES
    // ─────────────────────────────────────────

    /// @notice The ERC-8004 Identity Registry contract address
    IERC8004Registry public immutable erc8004;

    /// @notice The single trusted AgentRegistry contract address (set once after deployment)
    address public agentRegistry;

    /// @notice Mapping of authorized admin addresses that can sign update transactions
    mapping(address => bool) public isAdmin;

    /// @notice Tracks the nonce for each agentId to prevent replay attacks on signatures
    mapping(uint256 => uint256) public nonces;

    // ─────────────────────────────────────────
    // EIP-712 TYPEHASHES (AgentTreasury domain)
    // ─────────────────────────────────────────

    bytes32 private constant _SET_WALLET_TYPEHASH = keccak256(
        "SetWallet(uint256 agentId,address wallet,uint256 nonce,uint256 deadline)"
    );

    bytes32 private constant _SET_METADATA_TYPEHASH = keccak256(
        "SetMetadata(uint256 agentId,string key,bytes value,uint256 nonce,uint256 deadline)"
    );

    // ─────────────────────────────────────────
    // EVENTS
    // ─────────────────────────────────────────

    /// @notice Emitted when an admin's status is updated
    event AdminUpdated(address indexed admin, bool status);
    
    /// @notice Emitted when an agent's wallet is successfully set or updated
    event AgentWalletSet(uint256 indexed agentId, address indexed wallet);
    
    /// @notice Emitted when an agent's metadata key is updated
    event AgentMetadataSet(uint256 indexed agentId, string key);

    // ─────────────────────────────────────────
    // CONSTRUCTOR
    // ─────────────────────────────────────────

    /// @notice Initializes the Agent Treasury
    /// @param _erc8004 Address of the ERC-8004 Identity Registry
    constructor(address _erc8004)
        Ownable(msg.sender)
        EIP712("AgentTreasury", "1")
    {
        require(_erc8004 != address(0), "Zero address: erc8004");
        erc8004 = IERC8004Registry(_erc8004);
    }

    // ─────────────────────────────────────────
    // MANAGEMENT
    // ─────────────────────────────────────────

    /// @notice Sets the AgentRegistry address. Can only be called once by the owner.
    /// @dev This resolves the circular dependency during deployment.
    /// @param _agentRegistry Address of the trusted Agent Registry proxy/contract
    function setAgentRegistry(address _agentRegistry) external onlyOwner {
        require(agentRegistry == address(0), "Registry already set");
        require(_agentRegistry != address(0), "Zero address: agentRegistry");
        agentRegistry = _agentRegistry;
    }

    /// @notice Grants or revokes admin privileges for signing meta-transactions
    /// @param admin Address of the admin
    /// @param status True to grant admin rights, false to revoke
    function setAdmin(address admin, bool status) external onlyOwner {
        require(admin != address(0), "Zero address");
        isAdmin[admin] = status;
        emit AdminUpdated(admin, status);
    }

    /// @notice Overrides the default renounceOwnership to prevent locking the contract
    /// @dev Reverts unconditionally. The treasury must always have an owner.
    function renounceOwnership() public view override onlyOwner {
        revert("Ownership renouncement disabled");
    }

    // ─────────────────────────────────────────
    // AGENT INIT (only AgentRegistry)
    // ─────────────────────────────────────────

    /// @notice Initializes a newly minted agent by setting its initial wallet
    /// @dev Can only be called by the configured agentRegistry contract
    /// @param agentId The ERC-8004 token ID of the agent
    /// @param userWallet The address of the user's wallet to bind to the agent
    /// @param walletDeadline Deadline for the ERC-8004 wallet signature (must be <= block.timestamp + 5 mins)
    /// @param walletSig EIP-712 signature from userWallet over AgentWalletSet in the ERC8004 domain
    function initAgent(
        uint256 agentId,
        address userWallet,
        uint256 walletDeadline,
        bytes calldata walletSig
    )
        external
    {
        require(agentRegistry != address(0), "Registry not configured");
        require(msg.sender == agentRegistry, "Only AgentRegistry");
        require(erc8004.ownerOf(agentId) == address(this), "NFT not in treasury");

        // The walletDeadline is validated internally by the ERC8004 contract
        erc8004.setAgentWallet(agentId, userWallet, walletDeadline, walletSig);
        emit AgentWalletSet(agentId, userWallet);
    }

    // ─────────────────────────────────────────
    // UPDATE WALLET (admin signature)
    // ─────────────────────────────────────────

    /// @notice Updates the associated wallet for an existing agent via meta-transaction
    /// @dev Requires a valid signature from an authorized admin and a signature from the new wallet
    /// @param agentId The ERC-8004 token ID of the agent
    /// @param newWallet The new wallet address to bind to the agent
    /// @param adminDeadline Expiration timestamp for the admin's signature
    /// @param adminSig EIP-712 signature from an admin over SetWallet in the AgentTreasury domain
    /// @param walletDeadline Expiration timestamp for the new wallet's signature (ERC8004 constraint)
    /// @param walletSig EIP-712 signature from newWallet over AgentWalletSet in the ERC8004 domain
    function updateAgentWallet(
        uint256 agentId,
        address newWallet,
        uint256 adminDeadline,
        bytes calldata adminSig,
        uint256 walletDeadline,
        bytes calldata walletSig
    )
        external
    {
        require(block.timestamp <= adminDeadline, "Admin signature expired");

        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(
            _SET_WALLET_TYPEHASH,
            agentId,
            newWallet,
            nonces[agentId]++,
            adminDeadline
        )));
        require(isAdmin[digest.recover(adminSig)], "Invalid admin signature");

        erc8004.setAgentWallet(agentId, newWallet, walletDeadline, walletSig);
        emit AgentWalletSet(agentId, newWallet);
    }

    // ─────────────────────────────────────────
    // UPDATE METADATA (admin signature)
    // ─────────────────────────────────────────

    /// @notice Updates metadata for a specific agent via meta-transaction
    /// @dev Requires a valid signature from an authorized admin
    /// @param agentId The ERC-8004 token ID of the agent
    /// @param key The metadata key to update (e.g., "endpoint", "version")
    /// @param value The new metadata value encoded as bytes
    /// @param deadline Expiration timestamp for the admin's signature
    /// @param adminSig EIP-712 signature from an admin over SetMetadata in the AgentTreasury domain
    function updateMetadata(
        uint256 agentId,
        string calldata key,
        bytes calldata value,
        uint256 deadline,
        bytes calldata adminSig
    )
        external
    {
        require(block.timestamp <= deadline, "Admin signature expired");

        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(
            _SET_METADATA_TYPEHASH,
            agentId,
            keccak256(bytes(key)),
            keccak256(value),
            nonces[agentId]++,
            deadline
        )));
        require(isAdmin[digest.recover(adminSig)], "Invalid admin signature");

        // As the AgentTreasury owns the NFT, the ERC8004 contract permits this call
        erc8004.setMetadata(agentId, key, value);
        emit AgentMetadataSet(agentId, key);
    }

    // ─────────────────────────────────────────
    // ERC-721 RECEIVER
    // ─────────────────────────────────────────

    /// @notice Standard ERC721 receiver hook
    /// @dev Allows the contract to safely receive ERC8004 NFT mints and transfers.
    /// Restricts incoming NFTs to ONLY the official ERC-8004 Registry specified at deployment.
    function onERC721Received(address, address, uint256, bytes calldata)
        external view override returns (bytes4)
    {
        require(msg.sender == address(erc8004), "Only designated ERC8004 allowed");
        
        return IERC721Receiver.onERC721Received.selector;
    }
}
