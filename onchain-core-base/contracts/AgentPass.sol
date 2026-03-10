// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/IAgentRegistry.sol";
import { AgentConfig } from "./interfaces/AgentTypes.sol";

/// @title Agent Pass Contract
/// @notice Manages Soulbound ERC-1155 tokens that grant users access to AI Agents.
/// @dev Handles agent pricing configurations, subscription limits, and usage tracking.
contract AgentPass is ERC1155, Ownable {
    using Strings for uint256;
    using SafeERC20 for IERC20;

    // ─────────────────────────────────────────
    // CONSTANTS
    // ─────────────────────────────────────────

    uint256 public constant MIN_BURN_BPS = 1000;  // Minimum 10% burn rate
    uint256 public constant MIN_DURATION = 1 days;
    uint256 public constant MAX_DURATION = 365 days;

    // ─────────────────────────────────────────
    // DEPENDENCIES
    // ─────────────────────────────────────────

    /// @notice The core Agent Registry contract (immutable interface)
    IAgentRegistry public immutable registry;
    
    /// @notice Base URI for ERC-1155 metadata
    string public baseURI;

    /// @notice Authorized relayers who can report off-chain usage to the contract
    mapping(address => bool) public isRelayer;

    // ─────────────────────────────────────────
    // STRUCTS
    // ─────────────────────────────────────────

    /// @notice Internal state of a user's pass for a specific agent
    struct PassMeta {
        uint256 expiresAt;
        uint256 maxRequests;
        uint256 requestsUsed;
        uint256 configVersion;
    }

    // ─────────────────────────────────────────
    // STORAGE
    // ─────────────────────────────────────────

    /// @dev agentId => userAddress => Pass state
    mapping(uint256 => mapping(address => PassMeta)) private _passMeta;
    
    /// @dev userAddress => array of agentIds they have bought passes for
    mapping(address => uint256[]) private _userPasses;
    
    /// @dev Records if a user has ever purchased a pass for an agent to prevent duplicate array entries
    mapping(address => mapping(uint256 => bool)) private _hasPassRecord;

    /// @notice Tracks the latest configuration version for each agent
    mapping(uint256 => uint256) public currentVersion;
    
    /// @dev agentId => version => AgentConfig
    mapping(uint256 => mapping(uint256 => AgentConfig)) private _configHistory;

    // ─────────────────────────────────────────
    // EVENTS
    // ─────────────────────────────────────────

    event Locked(uint256 indexed tokenId);
    event PassPurchased(address indexed user, uint256 indexed agentId, uint256 expiresAt, uint256 fee);
    event PassExpired(address indexed user, uint256 indexed agentId, string reason);
    event RelayerUpdated(address indexed relayer, bool status);
    event BaseURIUpdated(string newURI);
    
    /// @notice Emitted when an agent's owner updates their access configuration
    event ConfigUpdated(uint256 indexed agentId, uint256 version, AgentConfig cfg);
    
    /// @notice Emitted when an agent's access is paused or unpaused
    event AgentPaused(uint256 indexed agentId, bool paused);

    // ─────────────────────────────────────────
    // MODIFIERS
    // ─────────────────────────────────────────

    /// @notice Restricts access to authorized relayers
    modifier onlyRelayer() {
        require(isRelayer[msg.sender], "Not relayer");
        _;
    }

    /// @notice Ensures only the beneficial owner of the agent (from Registry) can call the function
    modifier onlyAgentOwner(uint256 agentId) {
        require(registry.isOwner(agentId, msg.sender), "Not agent owner");
        _;
    }

    // ─────────────────────────────────────────
    // CONSTRUCTOR
    // ─────────────────────────────────────────

    /// @notice Initializes the Pass contract
    /// @param _registry Address of the Agent Registry
    /// @param _relayer Initial relayer address for reporting usage
    /// @param _baseURI Initial base URI for pass metadata
    constructor(address _registry, address _relayer, string memory _baseURI)
        ERC1155("")
        Ownable(msg.sender)
    {
        require(_registry != address(0), "Zero address: registry");
        registry = IAgentRegistry(_registry);
        baseURI = _baseURI;
        if (_relayer != address(0)) {
            isRelayer[_relayer] = true;
        }
    }

    // ─────────────────────────────────────────
    // MANAGEMENT (Ownable)
    // ─────────────────────────────────────────

    function setRelayer(address relayer, bool status) external onlyOwner {
        require(relayer != address(0), "Zero address");
        isRelayer[relayer] = status;
        emit RelayerUpdated(relayer, status);
    }

    function setBaseURI(string calldata _baseURI) external onlyOwner {
        baseURI = _baseURI;
        emit BaseURIUpdated(_baseURI);
    }

    function renounceOwnership() public view override onlyOwner {
        revert("Ownership renouncement disabled");
    }

    // ─────────────────────────────────────────
    // URI
    // ─────────────────────────────────────────

    function uri(uint256 tokenId) public view override returns (string memory) {
        return string(abi.encodePacked(baseURI, tokenId.toString()));
    }

    // ─────────────────────────────────────────
    // AGENT CONFIGURATION
    // ─────────────────────────────────────────

    /// @notice Sets a new pricing and access configuration for an agent
    /// @param agentId The ID of the agent
    /// @param cfg The new configuration parameters
    function setConfig(uint256 agentId, AgentConfig calldata cfg)
        external
        onlyAgentOwner(agentId)
    {
        require(cfg.tokenAddress != address(0), "Invalid token");
        require(cfg.subscriptionFee > 0, "Fee required");
        require(cfg.maxRequests > 0, "Requests required");
        require(
            cfg.duration >= MIN_DURATION && cfg.duration <= MAX_DURATION,
            "Invalid duration"
        );
        require(
            cfg.burnBps >= MIN_BURN_BPS && cfg.burnBps <= 10000,
            "burnBps: 10%-100%"
        );

        uint256 v = ++currentVersion[agentId];
        _configHistory[agentId][v] = cfg;
        emit ConfigUpdated(agentId, v, cfg);
    }

    /// @notice Pauses or unpauses new pass purchases for an agent
    function setPaused(uint256 agentId, bool paused)
        external
        onlyAgentOwner(agentId)
    {
        uint256 currentV = currentVersion[agentId];
        require(currentV > 0, "Agent not configured");
        
        _configHistory[agentId][currentV].paused = paused;
        emit AgentPaused(agentId, paused);
    }

    // ─────────────────────────────────────────
    // PURCHASING
    // ─────────────────────────────────────────

    /// @notice Purchases or renews an access pass for a specific agent
    /// @param agentId The ID of the agent to purchase access to
    function purchasePass(uint256 agentId) external {
        uint256 configV = currentVersion[agentId];
        require(configV > 0, "Agent not configured");
        
        AgentConfig memory cfg = _configHistory[agentId][configV];

        require(!cfg.paused, "Agent paused");
        require(cfg.subscriptionFee > 0, "Invalid fee config");

        // Burn existing pass if renewing/upgrading
        if (balanceOf(msg.sender, agentId) > 0) {
            _burn(msg.sender, agentId, 1);
            delete _passMeta[agentId][msg.sender];
        }

        uint256 fee = cfg.subscriptionFee;
        uint256 burnAmount = (fee * cfg.burnBps) / 10000;
        uint256 ownerAmount = fee - burnAmount;

        IERC20 token = IERC20(cfg.tokenAddress);
        
        if (ownerAmount > 0) {
            token.safeTransferFrom(msg.sender, registry.getAgentOwner(agentId), ownerAmount);
        }
        if (burnAmount > 0) {
            token.safeTransferFrom(msg.sender, address(0xdead), burnAmount);
        }

        // Mint Soulbound ERC-1155 Pass
        _mint(msg.sender, agentId, 1, "");

        _passMeta[agentId][msg.sender] = PassMeta({
            expiresAt: block.timestamp + cfg.duration,
            maxRequests: cfg.maxRequests,
            requestsUsed: 0,
            configVersion: configV
        });

        if (!_hasPassRecord[msg.sender][agentId]) {
            _userPasses[msg.sender].push(agentId);
            _hasPassRecord[msg.sender][agentId] = true;
        }

        emit Locked(agentId);
        emit PassPurchased(msg.sender, agentId, block.timestamp + cfg.duration, fee);
    }

    // ─────────────────────────────────────────
    // ACCESS & USAGE
    // ─────────────────────────────────────────

    /// @notice Checks if a user currently has valid access to an agent
    function hasAccess(address user, uint256 agentId) public view returns (bool) {
        uint256 configV = currentVersion[agentId];
        if (configV > 0 && _configHistory[agentId][configV].paused) return false;
        if (balanceOf(user, agentId) == 0) return false;

        PassMeta memory meta = _passMeta[agentId][user];

        return block.timestamp < meta.expiresAt &&
               meta.requestsUsed < meta.maxRequests;
    }

    /// @notice Reports usage of an agent by a user (called off-chain by relayer)
    function recordUsage(uint256 agentId, address user, uint256 count) external onlyRelayer {
        require(balanceOf(user, agentId) > 0, "No active pass");
        PassMeta storage meta = _passMeta[agentId][user];

        meta.requestsUsed += count;

        if (meta.requestsUsed >= meta.maxRequests) {
            meta.requestsUsed = meta.maxRequests;
            emit PassExpired(user, agentId, "requests_limit");
        }
    }

    // ─────────────────────────────────────────
    // GETTERS
    // ─────────────────────────────────────────

    /// @notice Returns the currently active configuration for an agent
    function getCurrentConfig(uint256 agentId) external view returns (AgentConfig memory) {
        return _configHistory[agentId][currentVersion[agentId]];
    }

    /// @notice Returns a historical configuration for an agent
    function getConfig(uint256 agentId, uint256 version) external view returns (AgentConfig memory) {
        return _configHistory[agentId][version];
    }

    /// @notice Returns detailed status of a user's pass
    function getPassStatus(address user, uint256 agentId)
        external view
        returns (
            bool    active,
            uint256 expiresAt,
            uint256 timeLeft,
            uint256 requestsUsed,
            uint256 maxRequests,
            uint256 configVersion
        )
    {
        PassMeta memory meta = _passMeta[agentId][user];
        active        = hasAccess(user, agentId);
        expiresAt     = meta.expiresAt;
        timeLeft      = meta.expiresAt > block.timestamp ? meta.expiresAt - block.timestamp : 0;
        requestsUsed  = meta.requestsUsed;
        maxRequests   = meta.maxRequests;
        configVersion = meta.configVersion;
    }

    function getUserPasses(address user) external view returns (uint256[] memory) {
        return _userPasses[user];
    }

    function getActivePasses(address user) external view returns (uint256[] memory) {
        uint256[] memory all = _userPasses[user];
        uint256[] memory temp = new uint256[](all.length);
        uint256 count = 0;

        for (uint256 i = 0; i < all.length; i++) {
            if (hasAccess(user, all[i])) temp[count++] = all[i];
        }

        uint256[] memory result = new uint256[](count);
        for (uint256 i = 0; i < count; i++) result[i] = temp[i];
        return result;
    }

    // ─────────────────────────────────────────
    // SOULBOUND LOGIC
    // ─────────────────────────────────────────

    /// @dev Blocks all transfers, allowing only mints and burns (Soulbound)
    function _update(
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory values
    ) internal override {
        require(
            from == address(0) || to == address(0),
            "Soulbound: Pass is non-transferable"
        );
        super._update(from, to, ids, values);
    }

    function supportsInterface(bytes4 interfaceId)
        public view override(ERC1155)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}