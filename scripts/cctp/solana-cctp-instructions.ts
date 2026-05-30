// Solana CCTP V2 instruction and PDA helpers.
//
// These are stubbed until the exact account layout and PDA seeds are verified
// against Circle's official CCTP V2 Solana program documentation.
//
// When verified, implement:
//   buildDepositForBurnInstruction() — constructs the depositForBurn
//     TransactionInstruction for the TokenMessengerMinterV2 program.
//
// References:
//   Solana TokenMessengerMinterV2: CCTPV2vPZJS2u2BBsUoscuikbYjnpFmbFsvVuJdgUMQe
//   Solana MessageTransmitterV2:  CCTPV2Sm4AdWt5296sk4P66VBZ7bEhcARwFaaS9YPbeC

import { PublicKey } from "@solana/web3.js";

export function derivePlaceholderPda(label: string): PublicKey {
  throw new Error(
    `Solana CCTP V2 PDA seed for "${label}" not verified yet. ` +
      "Verify PDA seeds against Circle's official CCTP V2 Solana program documentation " +
      "before implementing instruction building.",
  );
}

export function buildDepositForBurnInstructionPlaceholder(): never {
  throw new Error(
    "Solana CCTP V2 depositForBurn account layout not verified yet. " +
      "Verify PDA seeds and instruction account ordering against Circle's official CCTP V2 Solana program documentation " +
      "before implementing raw instruction building.",
  );
}
