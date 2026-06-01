import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import { NextResponse } from "next/server";
import { parseUnits, type Hex } from "viem";
import { prepareSolanaToInjectiveCctpTransfer } from "../../../../../../lib/server/cctp/solana-to-injective";
import { relaySolanaCctpMessageToInjective, waitForSolanaCctpInjectiveRelayReceipt } from "../../../../../../lib/server/cctp/solana-to-injective-executor";
import {
  DAILY_SPONSORED_GAS_CREDIT_EXHAUSTED_ERROR,
  getRequestIp,
  reserveSponsoredGasCredit,
  rollbackSponsoredGasCredit,
} from "../../../../../../lib/server/gas-credit-limiter";
import { findOmnisReceiptByBurnTx, insertOmnisReceipt, updateOmnisReceiptRelayCompleted, withoutUndefined } from "../../../../../../lib/server/omnis-receipts";

const SOLANA_DEVNET_RPC_URL = "https://api.devnet.solana.com";
const IRIS_SANDBOX_URL = "https://iris-api-sandbox.circle.com/v2/messages/5";
const USDC_DECIMALS = 6;
const DESTINATION_DOMAIN = 29;
const IRIS_ATTEMPTS = 3;
const IRIS_RETRY_DELAY_MS = 2500;
const SOLANA_DEVNET_USDC_MINT = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
const TOKEN_MESSENGER_MINTER_V2_PROGRAM_ID = new PublicKey("CCTPV2vPZJS2u2BBsUoscuikbYjnpFmbFsvVuJdgUMQe");
const MESSAGE_TRANSMITTER_V2_PROGRAM_ID = new PublicKey("CCTPV2Sm4AdWt5296sk4P66VBZ7bEhcARwFaaS9YPbeC");
const COMPUTE_BUDGET_PROGRAM_ID = new PublicKey("ComputeBudget111111111111111111111111111111");
const DEPOSIT_FOR_BURN_DISCRIMINATOR = Buffer.from([215, 60, 61, 46, 114, 55, 128, 176]);
const BURN_TOKEN_MINT_ACCOUNT_INDEX = 10;
const MESSAGE_SENT_EVENT_DATA_ACCOUNT_INDEX = 11;
const MESSAGE_TRANSMITTER_PROGRAM_ACCOUNT_INDEX = 12;
const TOKEN_MESSENGER_MINTER_PROGRAM_ACCOUNT_INDEX = 13;

type CompleteRelayRequestBody = {
  burnTxHash?: unknown;
  amountUsdc?: unknown;
  sourceSolanaAddress?: unknown;
  injectiveRecipientAddress?: unknown;
};

type ValidatedCompleteRelayRequest = {
  burnTxHash: string;
  amountUsdc: string;
  sourceSolanaAddress: string;
  injectiveRecipientAddress: string;
};

type DecodedInstruction = {
  programId: PublicKey;
  accountKeys: PublicKey[];
  data: Buffer;
};

type SolanaMessageLike = {
  accountKeys?: unknown[];
  compiledInstructions?: SolanaInstructionLike[];
  header?: { numRequiredSignatures?: unknown };
  instructions?: SolanaInstructionLike[];
  staticAccountKeys?: unknown[];
};

type SolanaInstructionLike = {
  accountKeyIndexes?: unknown[];
  accounts?: unknown[];
  data?: unknown;
  programIdIndex?: unknown;
};

type SolanaTransactionResponseLike = {
  meta?: { err?: unknown } | null;
  transaction?: {
    message?: SolanaMessageLike;
    signatures?: unknown[];
  };
};

export async function POST(request: Request) {
  let reservedLimiterKey: string | null = null;
  let relaySubmitted = false;

  try {
    const body = await request.json() as CompleteRelayRequestBody;
    const validation = validateBody(body);

    if (!validation.ok) {
      return NextResponse.json({ ok: false, error: validation.error }, { status: 400 });
    }

    const existingReceipt = await findOmnisReceiptByBurnTx(validation.burnTxHash);

    if (existingReceipt?.status === "completed" && existingReceipt.relay_tx) {
      return NextResponse.json({
        ok: true,
        status: "completed",
        burnTxHash: validation.burnTxHash,
        relayTxHash: existingReceipt.relay_tx,
        receiptId: existingReceipt.id,
        message: "User-authorized burn relayed to Injective and receipt saved.",
      });
    }

    const connection = new Connection(SOLANA_DEVNET_RPC_URL, "confirmed");
    const transaction = await connection.getTransaction(validation.burnTxHash, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });

    if (!transaction) {
      return NextResponse.json({
        ok: true,
        status: "pending",
        burnTxHash: validation.burnTxHash,
        message: "Solana burn transaction is not indexed on devnet yet. Retry relay completion shortly; no additional burn will be submitted.",
      });
    }

    try {
      await verifyBurnTransaction(transaction, readSolanaPrivateKey().publicKey, validation);
    } catch (error) {
      return NextResponse.json({
        ok: false,
        burnTxHash: validation.burnTxHash,
        error: error instanceof Error ? error.message : "Solana burn transaction verification failed.",
      }, { status: 400 });
    }

    if (existingReceipt?.relay_tx) {
      try {
        await waitForSolanaCctpInjectiveRelayReceipt(existingReceipt.relay_tx as Hex);
        await updateOmnisReceiptRelayCompleted(
          existingReceipt.id,
          existingReceipt.relay_tx,
          buildRawReceipt(validation, existingReceipt.relay_tx),
        );

        return NextResponse.json({
          ok: true,
          status: "completed",
          burnTxHash: validation.burnTxHash,
          relayTxHash: existingReceipt.relay_tx,
          receiptId: existingReceipt.id,
          message: "User-authorized burn relayed to Injective and receipt saved.",
        });
      } catch (error) {
        return NextResponse.json({
          ok: false,
          burnTxHash: validation.burnTxHash,
          relayTxHash: existingReceipt.relay_tx,
          error: error instanceof Error ? error.message : "Existing Injective relay transaction is not confirmed yet. Retry completion without burning again.",
        }, { status: 500 });
      }
    }

    const attestation = await pollIris(validation.burnTxHash);

    if (!attestation) {
      return NextResponse.json({
        ok: true,
        status: "pending",
        burnTxHash: validation.burnTxHash,
        message: "Circle Iris attestation is not ready yet. Retry relay completion shortly; the existing burn will be reused.",
      });
    }

    let relayTxHash: string;

    const limiterReservation = reserveSponsoredGasCredit(validation.sourceSolanaAddress || getRequestIp(request));

    if (!limiterReservation.ok) {
      return NextResponse.json({ ok: false, burnTxHash: validation.burnTxHash, error: DAILY_SPONSORED_GAS_CREDIT_EXHAUSTED_ERROR }, { status: 429 });
    }

    reservedLimiterKey = limiterReservation.storageKey;

    try {
      ({ relayTxHash } = await relaySolanaCctpMessageToInjective(attestation.message as Hex, attestation.attestation as Hex));
      relaySubmitted = true;
    } catch (error) {
      const submittedRelayTxHash = getRelayTxHashFromError(error);

      if (submittedRelayTxHash) {
        relaySubmitted = true;

        try {
          await insertRelaySubmittedReceipt(validation, submittedRelayTxHash);
        } catch (receiptError) {
          console.error("Unable to persist relay-submitted receipt:", receiptError);
        }
      }

      console.error("User-authorized Solana burn Injective relay failed:", { burnTxHash: validation.burnTxHash, error });
      return NextResponse.json({
        ok: false,
        burnTxHash: validation.burnTxHash,
        relayTxHash: submittedRelayTxHash,
        error: error instanceof Error ? error.message : "Unable to relay receiveMessage on Injective. Retry completion without burning again.",
      }, { status: 500 });
    }

    let receiptId: string | null;

    try {
      receiptId = await insertCompletedReceipt(validation, relayTxHash);
    } catch (error) {
      return NextResponse.json({
        ok: false,
        burnTxHash: validation.burnTxHash,
        relayTxHash,
        error: error instanceof Error ? error.message : "Injective relay succeeded, but receipt persistence failed.",
      }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      status: "completed",
      burnTxHash: validation.burnTxHash,
      relayTxHash,
      receiptId,
      message: "User-authorized burn relayed to Injective and receipt saved.",
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Unable to complete Injective relay.",
    }, { status: 400 });
  } finally {
    if (reservedLimiterKey && !relaySubmitted) {
      rollbackSponsoredGasCredit(reservedLimiterKey);
    }
  }
}

async function insertCompletedReceipt(validation: ValidatedCompleteRelayRequest, relayTxHash: string) {
  return insertOmnisReceipt(buildReceipt(validation, relayTxHash, "completed"));
}

async function insertRelaySubmittedReceipt(validation: ValidatedCompleteRelayRequest, relayTxHash: string) {
  return insertOmnisReceipt(buildReceipt(validation, relayTxHash, "relay-submitted"));
}

function buildReceipt(validation: ValidatedCompleteRelayRequest, relayTxHash: string, status: "completed" | "relay-submitted") {
  return {
    amount_usdc: validation.amountUsdc,
    burn_tx: validation.burnTxHash,
    destination_address: validation.injectiveRecipientAddress,
    destination_chain: "Injective",
    estimated_received_usdc: validation.amountUsdc,
    gas_sponsor: "OmnisRouter",
    injective_recipient_address: validation.injectiveRecipientAddress,
    raw_receipt: buildRawReceipt(validation, relayTxHash, status),
    receive_message_tx: relayTxHash,
    relay_tx: relayTxHash,
    route: "solana-to-injective",
    solana_source_address: validation.sourceSolanaAddress,
    source_address: validation.sourceSolanaAddress,
    source_chain: "Solana",
    status,
  };
}

function buildRawReceipt(validation: ValidatedCompleteRelayRequest, relayTxHash: string, status = "completed") {
  return withoutUndefined({
    amountUsdc: validation.amountUsdc,
    burnTxHash: validation.burnTxHash,
    executionMode: "user-authorized-server-sponsored",
    gasPaidBy: "OmnisRouter",
    message: "User-authorized burn relayed to Injective and receipt saved.",
    relayTxHash,
    route: "solana-to-injective",
    solanaSourceAddress: validation.sourceSolanaAddress,
    injectiveRecipientAddress: validation.injectiveRecipientAddress,
    status,
  });
}

function getRelayTxHashFromError(error: unknown): string | undefined {
  if (error && typeof error === "object" && "relayTxHash" in error) {
    const relayTxHash = (error as { relayTxHash?: unknown }).relayTxHash;

    return typeof relayTxHash === "string" ? relayTxHash : undefined;
  }

  return undefined;
}

function validateBody(body: CompleteRelayRequestBody) {
  if (typeof body.burnTxHash !== "string" || !body.burnTxHash.trim()) {
    return { ok: false as const, error: "burnTxHash is required." };
  }

  if (!isValidSolanaSignature(body.burnTxHash.trim())) {
    return { ok: false as const, error: "burnTxHash must be a valid Solana signature." };
  }

  if (typeof body.amountUsdc !== "string" || !body.amountUsdc.trim()) {
    return { ok: false as const, error: "amountUsdc is required." };
  }

  const amountUsdc = body.amountUsdc.trim();

  if (!/^\d+(\.\d{1,6})?$/.test(amountUsdc) || parseUnits(amountUsdc, USDC_DECIMALS) <= BigInt(0)) {
    return { ok: false as const, error: "amountUsdc must be a positive USDC amount with up to 6 decimals." };
  }

  if (typeof body.sourceSolanaAddress !== "string" || !body.sourceSolanaAddress.trim()) {
    return { ok: false as const, error: "sourceSolanaAddress is required." };
  }

  try {
    const source = new PublicKey(body.sourceSolanaAddress.trim());
    if (source.toBase58() !== body.sourceSolanaAddress.trim()) throw new Error("mismatch");
  } catch {
    return { ok: false as const, error: "sourceSolanaAddress must be a valid Solana public key." };
  }

  if (typeof body.injectiveRecipientAddress !== "string" || !body.injectiveRecipientAddress.trim().startsWith("inj")) {
    return { ok: false as const, error: "injectiveRecipientAddress must start with inj." };
  }

  return {
    ok: true as const,
    amountUsdc,
    burnTxHash: body.burnTxHash.trim(),
    sourceSolanaAddress: body.sourceSolanaAddress.trim(),
    injectiveRecipientAddress: body.injectiveRecipientAddress.trim(),
  };
}

async function verifyBurnTransaction(transaction: unknown, sponsorPublicKey: PublicKey, request: ValidatedCompleteRelayRequest) {
  const tx = transaction as SolanaTransactionResponseLike;
  if (tx.meta?.err) {
    throw new Error(`Solana burn transaction failed: ${JSON.stringify(tx.meta.err)}`);
  }

  const message = tx.transaction?.message;
  const signatures = Array.isArray(tx.transaction?.signatures) ? tx.transaction.signatures : [];
  const accountKeys = getAccountKeys(message);
  const header = message?.header;
  const requiredSignatureCount = Number(header?.numRequiredSignatures ?? 0);
  const sourcePublicKey = new PublicKey(request.sourceSolanaAddress);
  const preflight = await prepareSolanaToInjectiveCctpTransfer({
    amountUsdc: request.amountUsdc,
    sourceSolanaAddress: request.sourceSolanaAddress,
    recipientInjectiveAddress: request.injectiveRecipientAddress,
  });
  const expectedAmount = parseUnits(request.amountUsdc, USDC_DECIMALS);
  const expectedBurnTokenAccount = getAssociatedTokenAddressSync(SOLANA_DEVNET_USDC_MINT, sourcePublicKey, true);
  const expectedMintRecipient = new PublicKey(Buffer.from(preflight.mintRecipient.replace(/^0x/, ""), "hex"));

  if (preflight.destinationDomain !== DESTINATION_DOMAIN) {
    throw new Error("Preflight destination domain mismatch.");
  }

  if (!accountKeys[0]?.equals(sponsorPublicKey)) {
    throw new Error("Solana burn fee payer must be the configured sponsor wallet.");
  }

  const requiredSignerKeys = accountKeys.slice(0, requiredSignatureCount);
  const sourceSignerIndex = requiredSignerKeys.findIndex((key) => key.equals(sourcePublicKey));

  if (sourceSignerIndex < 0 || !isValidSolanaSignature(signatures[sourceSignerIndex])) {
    throw new Error("sourceSolanaAddress must have signed the Solana burn transaction.");
  }

  const sponsorSignerIndex = requiredSignerKeys.findIndex((key) => key.equals(sponsorPublicKey));

  if (sponsorSignerIndex !== 0 || !isValidSolanaSignature(signatures[sponsorSignerIndex])) {
    throw new Error("Sponsor fee payer signature is missing from the Solana burn transaction.");
  }

  const decodedInstructions = getDecodedInstructions(message, accountKeys);

  for (const instruction of decodedInstructions) {
    if (!instruction.programId.equals(TOKEN_MESSENGER_MINTER_V2_PROGRAM_ID) && !instruction.programId.equals(COMPUTE_BUDGET_PROGRAM_ID)) {
      throw new Error("Solana burn transaction contains an unexpected instruction program.");
    }
  }

  const burnInstructions = decodedInstructions.filter((instruction) => (
    instruction.programId.equals(TOKEN_MESSENGER_MINTER_V2_PROGRAM_ID) &&
    instruction.data.subarray(0, DEPOSIT_FOR_BURN_DISCRIMINATOR.length).equals(DEPOSIT_FOR_BURN_DISCRIMINATOR)
  ));
  const burnInstruction = burnInstructions[0];

  if (burnInstructions.length !== 1 || !burnInstruction) {
    throw new Error("Solana burn transaction must contain exactly one expected CCTP TokenMessengerMinter depositForBurn instruction.");
  }

  const messageSentEventData = burnInstruction.accountKeys[MESSAGE_SENT_EVENT_DATA_ACCOUNT_INDEX];
  const eventSignerIndex = messageSentEventData
    ? requiredSignerKeys.findIndex((key) => key.equals(messageSentEventData))
    : -1;

  if (eventSignerIndex < 0 || !isValidSolanaSignature(signatures[eventSignerIndex])) {
    throw new Error("CCTP messageSentEventData account must have a non-empty signature.");
  }

  verifyDepositForBurnInstruction(burnInstruction, {
    expectedAmount,
    expectedBurnTokenAccount,
    expectedMintRecipient,
    sourcePublicKey,
    sponsorPublicKey,
  });
}

function verifyDepositForBurnInstruction(instruction: DecodedInstruction, expected: {
  expectedAmount: bigint;
  expectedBurnTokenAccount: PublicKey;
  expectedMintRecipient: PublicKey;
  sourcePublicKey: PublicKey;
  sponsorPublicKey: PublicKey;
}) {
  if (instruction.accountKeys.length < 17) {
    throw new Error("CCTP depositForBurn instruction is missing required accounts.");
  }

  if (!instruction.accountKeys[0]?.equals(expected.sourcePublicKey)) throw new Error("CCTP burn owner must match sourceSolanaAddress.");
  if (!instruction.accountKeys[1]?.equals(expected.sponsorPublicKey)) throw new Error("CCTP event rent payer must be the sponsor wallet.");
  if (!instruction.accountKeys[3]?.equals(expected.expectedBurnTokenAccount)) throw new Error("CCTP burn token account must be the source wallet devnet USDC ATA.");
  if (!instruction.accountKeys[BURN_TOKEN_MINT_ACCOUNT_INDEX]?.equals(SOLANA_DEVNET_USDC_MINT)) throw new Error("CCTP burn token mint must be Solana devnet USDC.");
  if (!instruction.accountKeys[MESSAGE_TRANSMITTER_PROGRAM_ACCOUNT_INDEX]?.equals(MESSAGE_TRANSMITTER_V2_PROGRAM_ID)) throw new Error("CCTP messageTransmitterProgram account does not match the expected devnet program ID.");
  if (!instruction.accountKeys[TOKEN_MESSENGER_MINTER_PROGRAM_ACCOUNT_INDEX]?.equals(TOKEN_MESSENGER_MINTER_V2_PROGRAM_ID)) throw new Error("CCTP tokenMessengerMinterProgram account does not match the expected devnet program ID.");

  const params = parseDepositForBurnParams(instruction.data);

  if (params.destinationDomain !== DESTINATION_DOMAIN) throw new Error("CCTP destination domain must be 29 for Injective.");
  if (params.amount !== expected.expectedAmount) throw new Error("CCTP burn amount does not match amountUsdc.");
  if (!params.mintRecipient.equals(expected.expectedMintRecipient)) throw new Error("CCTP mintRecipient does not match injectiveRecipientAddress.");
}

function parseDepositForBurnParams(data: Buffer) {
  if (data.length < 92) throw new Error("CCTP depositForBurn instruction data is too short.");

  let offset = 8;
  const amount = data.readBigUInt64LE(offset);
  offset += 8;
  const destinationDomain = data.readUInt32LE(offset);
  offset += 4;
  const mintRecipient = new PublicKey(data.subarray(offset, offset + 32));

  return { amount, destinationDomain, mintRecipient };
}

function getAccountKeys(message: SolanaMessageLike | undefined): PublicKey[] {
  const keys = Array.isArray(message?.staticAccountKeys) ? message.staticAccountKeys : message?.accountKeys;

  if (!Array.isArray(keys)) throw new Error("Unable to read Solana transaction account keys.");

  return keys.map((key: unknown) => new PublicKey(String(key)));
}

function getDecodedInstructions(message: SolanaMessageLike | undefined, accountKeys: PublicKey[]): DecodedInstruction[] {
  const instructions = Array.isArray(message?.compiledInstructions) ? message.compiledInstructions : message?.instructions;

  if (!Array.isArray(instructions)) throw new Error("Unable to read Solana transaction instructions.");

  return instructions.map((instruction) => {
    const indexes = Array.isArray(instruction.accountKeyIndexes) ? instruction.accountKeyIndexes : instruction.accounts;
    const programIdIndex = Number(instruction.programIdIndex);
    const programId = accountKeys[programIdIndex];

    if (!Array.isArray(indexes)) {
      throw new Error("Unable to read Solana instruction accounts.");
    }

    const instructionAccountKeys = indexes.map((index) => accountKeys[Number(index)]);

    if (!programId || instructionAccountKeys.some((key) => !key)) {
      throw new Error("Solana burn transaction uses unsupported address table lookups.");
    }

    return {
      accountKeys: instructionAccountKeys as PublicKey[],
      data: decodeInstructionData(instruction.data),
      programId,
    };
  });
}

function decodeInstructionData(data: unknown): Buffer {
  if (typeof data === "string") return Buffer.from(bs58.decode(data));
  if (data instanceof Uint8Array) return Buffer.from(data);
  throw new Error("Unable to decode Solana instruction data.");
}

async function pollIris(burnTxHash: string): Promise<{ message: string; attestation: string } | null> {
  for (let attempt = 1; attempt <= IRIS_ATTEMPTS; attempt++) {
    const irisResponse = await fetch(`${IRIS_SANDBOX_URL}?transactionHash=${encodeURIComponent(burnTxHash)}`);

    if (irisResponse.ok) {
      const data = await irisResponse.json() as Record<string, unknown>;
      const messages = Array.isArray(data.messages) ? data.messages : [];
      const first = messages[0] as Record<string, unknown> | undefined;
      const message = typeof first?.message === "string" ? first.message : "";
      const attestation = typeof first?.attestation === "string" ? first.attestation : "";

      if (message.startsWith("0x") && attestation.startsWith("0x") && attestation !== "PENDING") {
        return { message, attestation };
      }
    }

    if (attempt < IRIS_ATTEMPTS) await new Promise((resolve) => setTimeout(resolve, IRIS_RETRY_DELAY_MS));
  }

  return null;
}

function isValidSolanaSignature(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim()) return false;

  try {
    return bs58.decode(value.trim()).length === 64;
  } catch {
    return false;
  }
}

function readSolanaPrivateKey(): Keypair {
  const value = process.env.SOLANA_PRIVATE_KEY?.trim();

  if (!value) throw new Error("Missing required environment variable: SOLANA_PRIVATE_KEY.");
  if (value.startsWith("[")) return Keypair.fromSecretKey(new Uint8Array(JSON.parse(value)));

  return Keypair.fromSecretKey(bs58.decode(value));
}
