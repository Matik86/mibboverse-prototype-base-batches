// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @notice Lightweight interface for the Agent Treasury
interface IAgentTreasury {
    /// @notice Initializes a newly minted agent by setting its initial wallet
    function initAgent(
        uint256 agentId,
        address userWallet,
        uint256 walletDeadline,
        bytes calldata walletSig
    ) external;
}