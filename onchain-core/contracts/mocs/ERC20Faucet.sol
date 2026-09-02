// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title Test Token (Faucet enabled)
/// @notice A mock ERC-20 token with 6 decimals (like USDC) meant ONLY for testnets.
/// @dev Anyone can mint tokens to any address.
contract TokenFaucet is ERC20 {
    
    constructor() ERC20("Test", "TEST") {}

    /// @notice Overrides default 18 decimals to match USDC (6 decimals)
    function decimals() public view virtual override returns (uint8) {
        return 6;
    }

    /// @notice Public mint function (Faucet)
    /// @dev Allows anyone to mint tokens to any address for testing purposes
    /// @param to The address that will receive the minted tokens
    /// @param amount The amount of tokens to mint (remember to include 6 decimals)
    function mint(address to, uint256 amount) public {
        _mint(to, amount);
    }
}