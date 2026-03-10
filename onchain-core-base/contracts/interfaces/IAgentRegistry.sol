// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @notice Lightweight interface for the Agent Registry
interface IAgentRegistry {
    function getAgentOwner(uint256 agentId) external view returns (address);
    function isOwner(uint256 agentId, address addr) external view returns (bool);
    function isIdTaken(uint256 agentId) external view returns (bool);
}