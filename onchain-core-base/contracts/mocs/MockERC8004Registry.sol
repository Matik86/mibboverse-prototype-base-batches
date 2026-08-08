// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/**
 * @dev Minimal mock for IERC8004Registry used in MibboTreasury tests.
 *      Allows configuring ownerOf() return value and recording the last calls.
 */
contract MockERC8004Registry {
    // Configurable ownerOf result per tokenId
    mapping(uint256 => address) private _owners;

    // Last recorded calls — inspectable in tests
    uint256 public lastSetWalletAgentId;
    address public lastSetWalletAddress;

    uint256 public lastSetMetadataAgentId;
    string  public lastSetMetadataKey;
    bytes   public lastSetMetadataValue;

    uint256 public lastSetURIAgentId;
    string  public lastSetURIValue;

    // ── Configuration helpers ─────────────────────────────────────────────────

    function setOwnerOf(uint256 tokenId, address owner) external {
        _owners[tokenId] = owner;
    }

    // ── IERC8004Registry stubs ────────────────────────────────────────────────

    function ownerOf(uint256 tokenId) external view returns (address) {
        return _owners[tokenId];
    }

    function setAgentWallet(
        uint256 agentId,
        address wallet,
        uint256, /* deadline */
        bytes calldata /* sig */
    ) external {
        lastSetWalletAgentId = agentId;
        lastSetWalletAddress = wallet;
    }

    function setMetadata(
        uint256 agentId,
        string calldata key,
        bytes calldata value
    ) external {
        lastSetMetadataAgentId = agentId;
        lastSetMetadataKey     = key;
        lastSetMetadataValue   = value;
    }

    function setAgentURI(uint256 agentId, string calldata newURI) external {
        lastSetURIAgentId = agentId;
        lastSetURIValue   = newURI;
    }
}
