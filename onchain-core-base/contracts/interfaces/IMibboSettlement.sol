// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IMibboSettlement {
    error ZeroAddress();
    error NotRelayer();
    error InvalidAmount();
    error InvalidDeadline();
    error AuthorizationAlreadyExists();
    error AuthorizationNotFound();
    error AuthorizationExpired();
    error AuthorizationIsCancelled();
    error AuthorizationExhausted();
    error AmountExceedsRemaining();
    error ChargeAlreadySettled();
    error NotAuthorizationPayer();

    event RelayerUpdated(address indexed previousRelayer, address indexed newRelayer);
    event AuthorizationActivated(bytes32 indexed authorizationId, address indexed payer, uint256 indexed permitNonce, uint256 quota, uint256 deadline);
    event PaymentSettled(bytes32 indexed authorizationId, bytes32 indexed chargeId, address indexed payer, address treasury, uint256 amount, uint256 remaining);
    event AuthorizationCancelled(bytes32 indexed authorizationId, address indexed payer);

    function activateAndSettle(address payer, uint256 quota, uint256 deadline, uint8 v, bytes32 r, bytes32 s, uint256 amount, bytes32 chargeId) external returns (bytes32 authorizationId);
    function settle(bytes32 authorizationId, uint256 amount, bytes32 chargeId) external;
    function cancelAuthorization(bytes32 authorizationId) external;
    function setRelayer(address newRelayer) external;
    function pause() external;
    function unpause() external;
    function remaining(bytes32 authorizationId) external view returns (uint256);
    function computeAuthorizationId(address payer, uint256 permitNonce, uint256 quota, uint256 deadline) external view returns (bytes32);
}
