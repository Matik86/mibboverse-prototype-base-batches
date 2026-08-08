// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IMibboSettlement} from "./interfaces/IMibboSettlement.sol";

/// @title MibboSettlement
/// @notice Private x402 settlement contract for one EIP-2612 token and treasury.
/// @dev A payer signs one Permit for this contract. The relayer can then settle
///      multiple charges, but cannot redirect funds or exceed the signed quota.
contract MibboSettlement is Ownable2Step, Pausable, ReentrancyGuard, IMibboSettlement {
    using SafeERC20 for IERC20;

    struct Authorization {
        address payer;
        uint256 quota;
        uint256 spent;
        uint256 deadline;
        bool cancelled;
    }

    IERC20 public immutable token;
    IERC20Permit public immutable permitToken;
    address public immutable treasury;
    address public relayer;

    mapping(bytes32 authorizationId => Authorization authorization) public authorizations;
    mapping(bytes32 authorizationId => mapping(bytes32 chargeId => bool settled)) public settledCharges;

    modifier onlyRelayer() {
        if (msg.sender != relayer) revert NotRelayer();
        _;
    }

    constructor(address token_, address treasury_, address owner_, address relayer_) Ownable(owner_) {
        if (token_ == address(0) || treasury_ == address(0) || owner_ == address(0) || relayer_ == address(0)) {
            revert ZeroAddress();
        }

        token = IERC20(token_);
        permitToken = IERC20Permit(token_);
        treasury = treasury_;
        relayer = relayer_;

        emit RelayerUpdated(address(0), relayer_);
    }

    /// @notice Atomically applies the user's Permit and settles the first charge.
    function activateAndSettle(
        address payer,
        uint256 quota,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s,
        uint256 amount,
        bytes32 chargeId
    ) external override onlyRelayer whenNotPaused nonReentrant returns (bytes32 authorizationId) {
        _validateNewAuthorization(payer, quota, deadline, amount, chargeId);

        uint256 permitNonce = permitToken.nonces(payer);
        authorizationId = computeAuthorizationId(payer, permitNonce, quota, deadline);
        if (authorizations[authorizationId].payer != address(0)) revert AuthorizationAlreadyExists();

        permitToken.permit(payer, address(this), quota, deadline, v, r, s);

        authorizations[authorizationId] = Authorization({
            payer: payer,
            quota: quota,
            spent: 0,
            deadline: deadline,
            cancelled: false
        });

        emit AuthorizationActivated(authorizationId, payer, permitNonce, quota, deadline);
        _settle(authorizationId, amount, chargeId);
    }

    /// @notice Settles another request without asking the payer for a new signature.
    function settle(bytes32 authorizationId, uint256 amount, bytes32 chargeId)
        external
        override
        onlyRelayer
        whenNotPaused
        nonReentrant
    {
        _settle(authorizationId, amount, chargeId);
    }

    /// @notice Stops future settlements for an authorization. Callable by its payer.
    function cancelAuthorization(bytes32 authorizationId) external override {
        Authorization storage authorization = authorizations[authorizationId];
        if (authorization.payer == address(0)) revert AuthorizationNotFound();
        if (authorization.payer != msg.sender) revert NotAuthorizationPayer();
        if (authorization.cancelled) revert AuthorizationIsCancelled();

        authorization.cancelled = true;
        emit AuthorizationCancelled(authorizationId, msg.sender);
    }

    function setRelayer(address newRelayer) external override onlyOwner {
        if (newRelayer == address(0)) revert ZeroAddress();
        address previousRelayer = relayer;
        relayer = newRelayer;
        emit RelayerUpdated(previousRelayer, newRelayer);
    }

    function pause() external override onlyOwner {
        _pause();
    }

    function unpause() external override onlyOwner {
        _unpause();
    }

    function remaining(bytes32 authorizationId) public view override returns (uint256) {
        Authorization storage authorization = authorizations[authorizationId];
        if (authorization.payer == address(0) || authorization.spent >= authorization.quota) return 0;
        return authorization.quota - authorization.spent;
    }

    function computeAuthorizationId(address payer, uint256 permitNonce, uint256 quota, uint256 deadline)
        public
        view
        override
        returns (bytes32)
    {
        return keccak256(abi.encode(block.chainid, address(this), address(token), payer, permitNonce, quota, deadline));
    }

    function _settle(bytes32 authorizationId, uint256 amount, bytes32 chargeId) private {
        Authorization storage authorization = authorizations[authorizationId];
        if (authorization.payer == address(0)) revert AuthorizationNotFound();
        if (authorization.cancelled) revert AuthorizationIsCancelled();
        if (block.timestamp > authorization.deadline) revert AuthorizationExpired();
        if (amount == 0 || chargeId == bytes32(0)) revert InvalidAmount();
        if (settledCharges[authorizationId][chargeId]) revert ChargeAlreadySettled();

        uint256 remainingBefore = authorization.quota - authorization.spent;
        if (remainingBefore == 0) revert AuthorizationExhausted();
        if (amount > remainingBefore) revert AmountExceedsRemaining();

        settledCharges[authorizationId][chargeId] = true;
        authorization.spent += amount;
        uint256 remainingAfter = remainingBefore - amount;

        token.safeTransferFrom(authorization.payer, treasury, amount);

        emit PaymentSettled(
            authorizationId,
            chargeId,
            authorization.payer,
            treasury,
            amount,
            remainingAfter
        );
    }

    function _validateNewAuthorization(
        address payer,
        uint256 quota,
        uint256 deadline,
        uint256 amount,
        bytes32 chargeId
    ) private view {
        if (payer == address(0)) revert ZeroAddress();
        if (deadline <= block.timestamp) revert InvalidDeadline();
        if (quota == 0 || amount == 0 || amount > quota || chargeId == bytes32(0)) revert InvalidAmount();
    }
}
