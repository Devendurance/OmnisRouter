import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import anchor from "@coral-xyz/anchor";

const { AnchorProvider, Program } = anchor;

const SOLANA_DEVNET_RPC_URL = "https://api.devnet.solana.com";
const IDL_OUTPUT_DIR = resolve(import.meta.dirname ?? resolve(), "..", "..", "lib", "server", "cctp", "idl");

const PROGRAMS = [
  {
    label: "TokenMessengerMinterV2",
    programId: "CCTPV2vPZJS2u2BBsUoscuikbYjnpFmbFsvVuJdgUMQe",
    outputFile: "token_messenger_minter_v2.json",
  },
  {
    label: "MessageTransmitterV2",
    programId: "CCTPV2Sm4AdWt5296sk4P66VBZ7bEhcARwFaaS9YPbeC",
    outputFile: "message_transmitter_v2.json",
  },
] as const;

if (!existsSync(IDL_OUTPUT_DIR)) {
  mkdirSync(IDL_OUTPUT_DIR, { recursive: true });
}

const connection = new Connection(SOLANA_DEVNET_RPC_URL, "confirmed");
const wallet = new anchor.Wallet(Keypair.generate());
const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
let hasErrors = false;

for (const { label, programId, outputFile } of PROGRAMS) {
  console.log(`Fetching IDL for ${label} (${programId})...`);

  try {
    const programPublicKey = new PublicKey(programId);
    const idl = await Program.fetchIdl(programPublicKey, provider);

    if (!idl) {
      console.error(`ERROR: ${label} returned null IDL. The program may not have an Anchor IDL published on-chain.`);
      hasErrors = true;
      continue;
    }

    const outputPath = resolve(IDL_OUTPUT_DIR, outputFile);
    writeFileSync(outputPath, JSON.stringify(idl, null, 2), "utf8");

    const name = "name" in idl && typeof idl.name === "string" ? idl.name : "(unnamed)";
    const version = "version" in idl ? String(idl.version) : "(no version)";
    const instructions = "instructions" in idl && Array.isArray(idl.instructions) ? idl.instructions.length : 0;
    const accounts = "accounts" in idl && Array.isArray(idl.accounts) ? idl.accounts.length : 0;

    console.log(`  OK: ${name} v${version} — ${instructions} instructions, ${accounts} accounts`);
    console.log(`  Written to ${outputPath}`);
  } catch (error) {
    console.error(`  ERROR fetching ${label}: ${error instanceof Error ? error.message : String(error)}`);
    hasErrors = true;
  }

  console.log("");
}

if (hasErrors) {
  console.error("One or more IDL fetches failed. See errors above.");
  process.exit(1);
}

console.log("All IDLs fetched successfully.");
console.log("No transactions sent.");
