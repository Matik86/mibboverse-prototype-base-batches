import { HardhatRuntimeEnvironment } from "hardhat/types";
import type { HardhatViemHelpers } from "@nomicfoundation/hardhat-viem/types";

declare module "hardhat/types/runtime" {
  interface HardhatRuntimeEnvironment {
    viem: HardhatViemHelpers;
  }
}