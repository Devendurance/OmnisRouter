import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Connection, PublicKey } from "@solana/web3.js";
import anchor from "@coral-xyz/anchor";

const { AnchorProvider, BorshCoder, Program } = anchor;

const SOLANA_DEVNET_RPC_URL = "https://api.devnet.solana.com";
const TOKEN_MESSENGER_MINTER_V2_PROGRAM_ID = "CCTPV2vPZJS2u2BBsUoscuikbYjnpFmbFsvVuJdgUMQe";
const DESTINATION_DOMAIN = 29;

const IDL_DIR = resolve(import.meta.dirname ?? resolve(), "..", "..", "lib", "server", "cctp", "idl");

const idl = JSON.parse(readFileSync(resolve(IDL_DIR, "token_messenger_minter_v2.json"), "utf8"));

const connection = new Connection(SOLANA_DEVNET_RPC_URL, "confirmed");
const wallet = new anchor.Wallet(anchor.web3.Keypair.generate());
const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
const program = new Program(idl, provider);
const programId = new PublicKey(TOKEN_MESSENGER_MINTER_V2_PROGRAM_ID);

console.log("Solana CCTP V2 — Remote Token Messenger Diagnostic");
console.log("");
console.log(`Program: ${TOKEN_MESSENGER_MINTER_V2_PROGRAM_ID}`);
console.log("");

console.log("Available program.account keys:");
for (const key of Object.keys(program.account)) {
  console.log(`  - ${key}`);
}

console.log("");

const [remoteTokenMessengerPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("remote_token_messenger"), (() => { const b = Buffer.alloc(4); b.writeUInt32LE(DESTINATION_DOMAIN, 0); return b; })()],
  programId,
);

console.log(`Derived remote_token_messenger PDA for domain ${DESTINATION_DOMAIN}:`);
console.log(`  ${remoteTokenMessengerPda.toBase58()}`);
console.log("");

const accountInfo = await connection.getAccountInfo(remoteTokenMessengerPda);

console.log("On-chain account info for derived PDA:");
console.log(`  exists: ${accountInfo ? "yes" : "no"}`);
console.log(`  owner: ${accountInfo?.owner.toBase58() ?? "N/A"}`);
console.log(`  data length: ${accountInfo?.data.length ?? 0} bytes`);
console.log(`  executable: ${accountInfo?.executable ?? "N/A"}`);

if (accountInfo && accountInfo.owner.toBase58() === TOKEN_MESSENGER_MINTER_V2_PROGRAM_ID) {
  try {
    const coder = new BorshCoder(idl);
    const decoded = coder.accounts.decode("RemoteTokenMessenger", accountInfo.data);
    console.log(`  domain: ${decoded.domain}`);
    console.log(`  token_messenger: ${decoded.tokenMessenger}`);
  } catch {
    console.log("  (could not decode account data)");
  }
}

console.log("");

let hasDomain29 = false;

try {
  const allAccounts = await program.account.remoteTokenMessenger.all();

  console.log(`Total RemoteTokenMessenger accounts: ${allAccounts.length}`);
  console.log("");

  for (const entry of allAccounts) {
    const domain = entry.account.domain as number;

    console.log(`  ${entry.publicKey.toBase58()}`);
    console.log(`    domain: ${domain}`);

    if (domain === DESTINATION_DOMAIN) {
      console.log("    *** MATCHES domain 29 (Injective) ***");
      hasDomain29 = true;
    }

    if (entry.account.tokenMessenger) {
      const tm = entry.account.tokenMessenger as PublicKey;
      console.log(`    token_messenger: ${tm.toBase58()}`);
    }

    if (entry.account.tokenMinter) {
      const tminter = entry.account.tokenMinter as PublicKey;
      console.log(`    token_minter: ${tminter.toBase58()}`);
    }

    console.log("");
  }
} catch (error) {
  console.error("Error fetching RemoteTokenMessenger accounts:");
  console.error(error instanceof Error ? error.message : String(error));
}

if (!hasDomain29) {
  console.log("No RemoteTokenMessenger found for domain 29 (Injective).");
  console.log("This means the Circle operator has not initialized the Injective remote token messenger on Solana devnet.");
  console.log("depositForBurn to domain 29 will fail with AccountNotInitialized until Circle deploys this.");
}

console.log("");
console.log("No transactions sent.");
