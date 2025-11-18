import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  NATIVE_MINT,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";

export const cpSwapProgram = new PublicKey(
  "CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C"
);

// Raydium CPMM mainnet create pool fee receiver
export const createPoolFee = new PublicKey(
  "DNXgeM9EiiaAbaWvwjHj9fQQLAX5ZsfHyvmYUNRAdNC8"
);
// AMM Config (use Raydium's standard config)
// AMM Config for 2%
export const ammConfig = new PublicKey(
  "D4FPEruKEHrG5TenZ2mpDGEfu1iUvTiqBxvpU8HLBvC2"
);

export const QUOTE_MINT = NATIVE_MINT;
