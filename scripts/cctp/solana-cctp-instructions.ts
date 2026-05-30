// Solana CCTP V2 instruction and PDA helpers.
//
// Uses official on-chain Anchor IDLs fetched from Solana devnet.
//
// References:
//   Solana TokenMessengerMinterV2: CCTPV2vPZJS2u2BBsUoscuikbYjnpFmbFsvVuJdgUMQe
//   Solana MessageTransmitterV2:  CCTPV2Sm4AdWt5296sk4P66VBZ7bEhcARwFaaS9YPbeC

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import anchor from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
} from "@solana/web3.js";

const { AnchorProvider, BN, Program } = anchor;

const SOLANA_DEVNET_USDC_MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
const TOKEN_MESSENGER_MINTER_V2_PROGRAM_ID = "CCTPV2vPZJS2u2BBsUoscuikbYjnpFmbFsvVuJdgUMQe";
const MESSAGE_TRANSMITTER_V2_PROGRAM_ID = "CCTPV2Sm4AdWt5296sk4P66VBZ7bEhcARwFaaS9YPbeC";
const DESTINATION_DOMAIN = 29;

const IDL_DIR = resolve(import.meta.dirname ?? resolve(), "..", "..", "lib", "server", "cctp", "idl");

function loadIdl(filename: string) {
  const raw = readFileSync(resolve(IDL_DIR, filename), "utf8");

  return JSON.parse(raw);
}

export type BurnTxBuildParams = {
  amountBaseUnits: bigint;
  mintRecipientBytes32: string;
  ownerAddress: string;
  sourceUsdcAta: string;
  maxFeeBaseUnits?: bigint;
  minFinalityThreshold?: number;
};

export type BurnTxBuildResult = {
  transaction: Transaction;
  messageSentEventDataKeypair: Keypair;
  messageSentEventDataPublicKey: PublicKey;
  messageSentEventDataSecretKeyBytes: Uint8Array;
  requiredSigners: PublicKey[];
  sourceUsdcAta: string;
  mintRecipientBytes32: string;
  mintRecipientPublicKey: PublicKey;
  pdaSummary: Record<string, string>;
};

export async function buildSolanaDepositForBurnTransaction(
  connection: Connection,
  params: BurnTxBuildParams,
): BurnTxBuildResult {
  const tokenMessengerMinterIdl = loadIdl("token_messenger_minter_v2.json");

  const wallet = new anchor.Wallet(Keypair.generate());
  const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });

  const tokenMessengerMinterProgram = new Program(
    tokenMessengerMinterIdl,
    provider,
  );

  const depositForBurnIx = tokenMessengerMinterIdl.instructions.find(
    (ix: { name: string }) => ix.name === "deposit_for_burn",
  );

  console.log("IDL deposit_for_burn account names:");
  if (depositForBurnIx?.accounts) {
    for (const account of depositForBurnIx.accounts) {
      console.log(`  - ${account.name}`);
    }
  }

  const ownerPubkey = new PublicKey(params.ownerAddress);
  const usdcMint = new PublicKey(SOLANA_DEVNET_USDC_MINT);
  const programId = new PublicKey(TOKEN_MESSENGER_MINTER_V2_PROGRAM_ID);
  const messageTransmitterProgramId = new PublicKey(MESSAGE_TRANSMITTER_V2_PROGRAM_ID);
  const burnTokenAccount = new PublicKey(params.sourceUsdcAta);

  const amount = new BN(params.amountBaseUnits.toString());
  const maxFee = new BN((params.maxFeeBaseUnits ?? BigInt(0)).toString());
  const minFinalityThreshold = params.minFinalityThreshold ?? 2000;
  const destinationDomain = DESTINATION_DOMAIN;

  const mintRecipientBytes32 = params.mintRecipientBytes32;
  const mintRecipientRaw = Buffer.from(mintRecipientBytes32.replace(/^0x/, ""), "hex");

  if (mintRecipientRaw.length !== 32) {
    throw new Error(`mintRecipient must be 32 bytes, got ${mintRecipientRaw.length}`);
  }

  const mintRecipientPubkey = new PublicKey(mintRecipientRaw);

  const [senderAuthorityPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("sender_authority")],
    programId,
  );

  const [denylistAccountPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("denylist_account"), ownerPubkey.toBuffer()],
    programId,
  );

  const [messageTransmitterPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("message_transmitter")],
    messageTransmitterProgramId,
  );

  const [tokenMessengerPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("token_messenger")],
    programId,
  );

  const [tokenMinterPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("token_minter")],
    programId,
  );

  const [localTokenPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("local_token"), usdcMint.toBuffer()],
    programId,
  );

  const [eventAuthorityPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("__event_authority")],
    programId,
  );

  const domainBytes = Buffer.alloc(4);
  domainBytes.writeUInt32LE(destinationDomain, 0);

  const [derivedRemoteTokenMessengerPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("remote_token_messenger"), domainBytes],
    programId,
  );

  console.log(`  old derived remote_token_messenger PDA: ${derivedRemoteTokenMessengerPda.toBase58()}`);

  const allRemoteTokenMessengers = await tokenMessengerMinterProgram.account.remoteTokenMessenger.all();
  const target = allRemoteTokenMessengers.find(
    (entry) => (entry.account.domain as number) === destinationDomain,
  );

  if (!target) {
    throw new Error(
      `No initialized Circle remoteTokenMessenger found for destination domain ${destinationDomain}.`,
    );
  }

  const remoteTokenMessengerPda = target.publicKey;

  console.log(`  selected remote_token_messenger: ${remoteTokenMessengerPda.toBase58()} (domain ${target.account.domain})`);

  const messageSentEventDataKeypair = Keypair.generate();

  const accounts = {
    owner: ownerPubkey,
    eventRentPayer: ownerPubkey,
    senderAuthorityPda,
    burnTokenAccount,
    denylistAccount: denylistAccountPda,
    messageTransmitter: messageTransmitterPda,
    tokenMessenger: tokenMessengerPda,
    remoteTokenMessenger: remoteTokenMessengerPda,
    tokenMinter: tokenMinterPda,
    localToken: localTokenPda,
    burnTokenMint: usdcMint,
    messageSentEventData: messageSentEventDataKeypair.publicKey,
    messageTransmitterProgram: messageTransmitterProgramId,
    tokenMessengerMinterProgram: programId,
    tokenProgram: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
    systemProgram: new PublicKey("11111111111111111111111111111111"),
    eventAuthority: eventAuthorityPda,
    program: programId,
  };

  console.log("");
  console.log("Object.keys(accounts):");
  for (const key of Object.keys(accounts)) {
    console.log(`  - ${key}`);
  }

  const tx = await tokenMessengerMinterProgram.methods
    .depositForBurn({
      amount,
      destinationDomain,
      mintRecipient: mintRecipientPubkey,
      destinationCaller: PublicKey.default,
      maxFee,
      minFinalityThreshold,
    })
    .accounts(accounts)
    .signers([messageSentEventDataKeypair])
    .transaction();

  const pdaSummary: Record<string, string> = {
    sender_authority_pda: senderAuthorityPda.toBase58(),
    denylist_account: denylistAccountPda.toBase58(),
    message_transmitter: messageTransmitterPda.toBase58(),
    token_messenger: tokenMessengerPda.toBase58(),
    token_minter: tokenMinterPda.toBase58(),
    local_token: localTokenPda.toBase58(),
    event_authority: eventAuthorityPda.toBase58(),
    remote_token_messenger: remoteTokenMessengerPda.toBase58(),
    message_sent_event_data: messageSentEventDataKeypair.publicKey.toBase58(),
  };

  return {
    transaction: tx,
    messageSentEventDataKeypair,
    messageSentEventDataPublicKey: messageSentEventDataKeypair.publicKey,
    messageSentEventDataSecretKeyBytes: messageSentEventDataKeypair.secretKey,
    requiredSigners: [ownerPubkey, messageSentEventDataKeypair.publicKey],
    sourceUsdcAta: params.sourceUsdcAta,
    mintRecipientBytes32,
    mintRecipientPublicKey: mintRecipientPubkey,
    pdaSummary,
  };
}
