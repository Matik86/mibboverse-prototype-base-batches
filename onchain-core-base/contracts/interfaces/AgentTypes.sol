// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @notice Metadata structure for an AI Agent
struct AgentCard {
    string   name;
    string   description;
    string   version;
    string   endpoint;
    string[] capabilities;
    string   avatarURI;
    bytes    extra;
}

/// @notice Configuration for purchasing access to an agent
struct AgentConfig {
    address tokenAddress;
    uint256 subscriptionFee;
    uint256 duration;
    uint256 maxRequests;
    uint256 burnBps;
    bool    paused;
}