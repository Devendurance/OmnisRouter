import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { Connection, Keypair, PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";
import bs58 from "bs58";
import { NextResponse } from "next/server";
import { parseUnits } from "viem";
import { prepareSolanaToInjectiveCctpTransfer } from "../../../../../../lib/server/cctp/solana-to-injective";

const SOLANA_DEVNET_RPC_URL = "https://api.devnet.solana.com";
const USDC_DECIMALS = 6;
const DESTINATION_DOMAIN = 29;
const SOLANA_DEVNET_USDC_MINT = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
const TOKEN_MESSENGER_MINTER_V2_PROGRAM_ID = new PublicKey("CCTPV2vPZJS2u2BBsUoscuikbYjnpFmbFsvVuJdgUMQe");
const MESSAGE_TRANSMITTER_V2_PROGRAM_ID = new PublicKey("CCTPV2Sm4AdWt5296sk4P66VBZ7bEhcARwFaaS9YPbeC");
const COMPUTE_BUDGET_PROGRAM_ID = new PublicKey("ComputeBudget111111111111111111111111111111");
const DEPOSIT_FOR_BURN_DISCRIMINATOR = Buffer.from([215, 60, 61, 46, 114, 55, 128, 176]);
const BURN_TOKEN_MINT_ACCOUNT_INDEX = 10;
const MESSAGE_SENT_EVENT_DATA_ACCOUNT_INDEX = 11;
const MESSAGE_TRANSMITTER_PROGRAM_ACCOUNT_INDEX = 12;
const TOKEN_MESSENGER_MINTER_PROGRAM_ACCOUNT_INDEX = 13;

type SubmitBurnRequestBody = {
  signedTransaction?: unknown;
  amountUsdc?: unknown;
  sourceSolanaAddress?: unknown;
  injectiveRecipientAddress?: unknown;
};

type ValidatedSubmitBurnRequest = {
  signedTransaction: string;
  amountUsdc: string;
  sourceSolanaAddress: string;
  injectiveRecipientAddress: string;
};

type DecodedInstruction = {
  programId: PublicKey;
  accountKeys: PublicKey[];
  data: Buffer;
};

export async function POST(request: Request) {
  try {
    const body = await request.json() as SubmitBurnRequestBody;
    const validation = validateBody(body);

    if (!validation.ok) {
      return NextResponse.json({ ok: false, error: validation.error }, { status: 400 });
    }

    const connection = new Connection(SOLANA_DEVNET_RPC_URL, "confirmed");
    const rawTransaction = Buffer.from(validation.signedTransaction, "base64");
    const transaction = deserializeSolanaTransaction(rawTransaction);
    const sponsorKeypair = readSolanaPrivateKey();

    try {
      await verifySignedBurnTransaction(transaction, sponsorKeypair.publicKey, validation);
    } catch (error) {
      return NextResponse.json({
        ok: false,
        error: error instanceof Error ? error.message : "Signed transaction verification failed.",
      }, { status: 400 });
    }

    let burnTxHash: string;

    try {
      burnTxHash = await connection.sendRawTransaction(rawTransaction, {
        skipPreflight: false,
        maxRetries: 5,
      });
    } catch (error) {
      console.error("User-authorized Solana burn broadcast failed:", error);
      return NextResponse.json({
        ok: false,
        error: error instanceof Error ? error.message : "Unable to broadcast signed Solana burn transaction.",
      }, { status: 500 });
    }

    let confirmation: Awaited<ReturnType<typeof connection.confirmTransaction>>;

    try {
      confirmation = await connection.confirmTransaction(burnTxHash, "confirmed");
    } catch (error) {
      console.error("User-authorized Solana burn confirmation failed:", { burnTxHash, error });
      return NextResponse.json({
        ok: false,
        error: error instanceof Error ? error.message : "Unable to confirm Solana burn transaction.",
        burnTxHash,
      }, { status: 500 });
    }

    if (confirmation.value.err) {
      return NextResponse.json({
        ok: false,
        error: `Solana burn transaction failed confirmation: ${JSON.stringify(confirmation.value.err)}`,
        burnTxHash,
      }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      burnTxHash,
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Unable to submit signed Solana burn.",
    }, { status: 400 });
  }
}

function validateBody(body: SubmitBurnRequestBody) {
  if (typeof body.signedTransaction !== "string" || !body.signedTransaction.trim()) {
    return { ok: false as const, error: "signedTransaction is required." };
  }

  if (typeof body.amountUsdc !== "string" || !body.amountUsdc.trim()) {
    return { ok: false as const, error: "amountUsdc is required." };
  }

  if (typeof body.sourceSolanaAddress !== "string" || !body.sourceSolanaAddress.trim()) {
    return { ok: false as const, error: "sourceSolanaAddress is required." };
  }

  if (typeof body.injectiveRecipientAddress !== "string" || !body.injectiveRecipientAddress.trim()) {
    return { ok: false as const, error: "injectiveRecipientAddress is required." };
  }

  const amountUsdc = body.amountUsdc.trim();

  if (!/^\d+(\.\d{1,6})?$/.test(amountUsdc) || parseUnits(amountUsdc, USDC_DECIMALS) <= BigInt(0)) {
    return { ok: false as const, error: "amountUsdc must be a positive USDC amount with up to 6 decimals." };
  }

  try {
    Buffer.from(body.signedTransaction, "base64");
  } catch {
    return { ok: false as const, error: "signedTransaction must be a base64-encoded Solana transaction." };
  }

  return {
    ok: true as const,
    signedTransaction: body.signedTransaction.trim(),
    amountUsdc,
    sourceSolanaAddress: body.sourceSolanaAddress.trim(),
    injectiveRecipientAddress: body.injectiveRecipientAddress.trim(),
  };
}

async function verifySignedBurnTransaction(
  transaction: Transaction | VersionedTransaction,
  sponsorPublicKey: PublicKey,
  request: ValidatedSubmitBurnRequest,
) {
  if (transaction instanceof VersionedTransaction) {
    throw new Error("Only legacy Solana transactions prepared by OmnisRouter are supported for submit-burn.");
  }

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

  const requiredSignerKeys = getRequiredSignerKeys(transaction);
  const feePayer = getFeePayer(transaction);

  if (!feePayer.equals(sponsorPublicKey)) {
    throw new Error("Signed transaction fee payer must be the configured sponsor wallet.");
  }

  if (!requiredSignerKeys.some((key) => key.equals(sourcePublicKey))) {
    throw new Error("sourceSolanaAddress must be a required signer on the transaction.");
  }

  if (!hasNonEmptySignature(transaction, sourcePublicKey)) {
    throw new Error("Signed transaction must contain a non-empty sourceSolanaAddress signature.");
  }

  if (!hasNonEmptySignature(transaction, sponsorPublicKey)) {
    throw new Error("Signed transaction must contain the sponsor signature.");
  }

  if (transaction instanceof Transaction && !transaction.verifySignatures()) {
    throw new Error("Signed legacy transaction contains an invalid signature.");
  }

  const decodedInstructions = getDecodedInstructions(transaction);

  for (const instruction of decodedInstructions) {
    if (
      !instruction.programId.equals(TOKEN_MESSENGER_MINTER_V2_PROGRAM_ID) &&
      !instruction.programId.equals(COMPUTE_BUDGET_PROGRAM_ID)
    ) {
      throw new Error("Signed transaction contains an unexpected instruction program.");
    }
  }

  const burnInstruction = decodedInstructions.find((instruction) => (
    instruction.programId.equals(TOKEN_MESSENGER_MINTER_V2_PROGRAM_ID) &&
    instruction.data.subarray(0, DEPOSIT_FOR_BURN_DISCRIMINATOR.length).equals(DEPOSIT_FOR_BURN_DISCRIMINATOR)
  ));

  if (!burnInstruction) {
    throw new Error("Signed transaction must contain the expected CCTP TokenMessengerMinter depositForBurn instruction.");
  }

  verifyDepositForBurnInstruction(burnInstruction, {
    sourcePublicKey,
    sponsorPublicKey,
    expectedAmount,
    expectedBurnTokenAccount,
    expectedMintRecipient,
  });

  const messageSentEventData = burnInstruction.accountKeys[MESSAGE_SENT_EVENT_DATA_ACCOUNT_INDEX];

  if (!messageSentEventData || !hasNonEmptySignature(transaction, messageSentEventData)) {
    throw new Error("CCTP messageSentEventData account must have a non-empty signature.");
  }
}

function verifyDepositForBurnInstruction(
  instruction: DecodedInstruction,
  expected: {
    sourcePublicKey: PublicKey;
    sponsorPublicKey: PublicKey;
    expectedAmount: bigint;
    expectedBurnTokenAccount: PublicKey;
    expectedMintRecipient: PublicKey;
  },
) {
  if (instruction.accountKeys.length < 17) {
    throw new Error("CCTP depositForBurn instruction is missing required accounts, including messageSentEventData.");
  }

  if (!instruction.accountKeys[0]?.equals(expected.sourcePublicKey)) {
    throw new Error("CCTP burn owner must match sourceSolanaAddress.");
  }

  if (!instruction.accountKeys[1]?.equals(expected.sponsorPublicKey)) {
    throw new Error("CCTP event rent payer must be the sponsor wallet.");
  }

  if (!instruction.accountKeys[3]?.equals(expected.expectedBurnTokenAccount)) {
    throw new Error("CCTP burn token account must be the source wallet devnet USDC ATA.");
  }

  if (!instruction.accountKeys[BURN_TOKEN_MINT_ACCOUNT_INDEX]?.equals(SOLANA_DEVNET_USDC_MINT)) {
    throw new Error("CCTP burn token mint must be Solana devnet USDC.");
  }

  if (!instruction.accountKeys[MESSAGE_SENT_EVENT_DATA_ACCOUNT_INDEX]) {
    throw new Error("CCTP messageSentEventData account is required.");
  }

  if (!instruction.accountKeys[MESSAGE_TRANSMITTER_PROGRAM_ACCOUNT_INDEX]?.equals(MESSAGE_TRANSMITTER_V2_PROGRAM_ID)) {
    throw new Error("CCTP messageTransmitterProgram account does not match the expected devnet program ID.");
  }

  if (!instruction.accountKeys[TOKEN_MESSENGER_MINTER_PROGRAM_ACCOUNT_INDEX]?.equals(TOKEN_MESSENGER_MINTER_V2_PROGRAM_ID)) {
    throw new Error("CCTP tokenMessengerMinterProgram account does not match the expected devnet program ID.");
  }

  const params = parseDepositForBurnParams(instruction.data);

  if (params.destinationDomain !== DESTINATION_DOMAIN) {
    throw new Error("CCTP destination domain must be 29 for Injective.");
  }

  if (params.amount !== expected.expectedAmount) {
    throw new Error("CCTP burn amount does not match amountUsdc.");
  }

  if (!params.mintRecipient.equals(expected.expectedMintRecipient)) {
    throw new Error("CCTP mintRecipient does not match injectiveRecipientAddress.");
  }
}

function parseDepositForBurnParams(data: Buffer) {
  const minimumLength = 8 + 8 + 4 + 32 + 32 + 8 + 4;

  if (data.length < minimumLength) {
    throw new Error("CCTP depositForBurn instruction data is too short.");
  }

  let offset = 8;
  const amount = data.readBigUInt64LE(offset);
  offset += 8;
  const destinationDomain = data.readUInt32LE(offset);
  offset += 4;
  const mintRecipient = new PublicKey(data.subarray(offset, offset + 32));

  return { amount, destinationDomain, mintRecipient };
}

function deserializeSolanaTransaction(rawTransaction: Buffer): Transaction | VersionedTransaction {
  try {
    return Transaction.from(rawTransaction);
  } catch {
    return VersionedTransaction.deserialize(rawTransaction);
  }
}

function getFeePayer(transaction: Transaction | VersionedTransaction): PublicKey {
  if (transaction instanceof Transaction) {
    if (!transaction.feePayer) throw new Error("Signed transaction is missing a fee payer.");
    return transaction.feePayer;
  }

  return transaction.message.staticAccountKeys[0];
}

function getRequiredSignerKeys(transaction: Transaction | VersionedTransaction): PublicKey[] {
  if (transaction instanceof Transaction) {
    const message = transaction.compileMessage();
    return message.accountKeys.slice(0, message.header.numRequiredSignatures);
  }

  return transaction.message.staticAccountKeys.slice(0, transaction.message.header.numRequiredSignatures);
}

function hasNonEmptySignature(transaction: Transaction | VersionedTransaction, publicKey: PublicKey): boolean {
  const signerIndex = getRequiredSignerKeys(transaction).findIndex((key) => key.equals(publicKey));

  if (signerIndex < 0) return false;

  if (transaction instanceof Transaction) {
    const legacySignature = transaction.signatures[signerIndex]?.signature;

    return Boolean(legacySignature && legacySignature.length === 64 && legacySignature.some((byte) => byte !== 0));
  }

  const signature = transaction.signatures[signerIndex];

  if (!signature) return false;

  const bytes = Buffer.from(signature);

  return bytes.length === 64 && bytes.some((byte) => byte !== 0);
}

function getDecodedInstructions(transaction: Transaction | VersionedTransaction): DecodedInstruction[] {
  if (transaction instanceof Transaction) {
    return transaction.instructions.map((instruction) => ({
      programId: instruction.programId,
      accountKeys: instruction.keys.map((key) => key.pubkey),
      data: Buffer.from(instruction.data),
    }));
  }

  const accountKeys = transaction.message.staticAccountKeys;

  return transaction.message.compiledInstructions.map((instruction) => {
    const programId = accountKeys[instruction.programIdIndex];
    const instructionAccountKeys = instruction.accountKeyIndexes.map((index) => accountKeys[index]);

    if (!programId || instructionAccountKeys.some((key) => !key)) {
      throw new Error("Versioned signed transaction uses unsupported address table lookups.");
    }

    return {
      programId,
      accountKeys: instructionAccountKeys,
      data: Buffer.from(instruction.data),
    };
  });
}

function readSolanaPrivateKey(): Keypair {
  const value = process.env.SOLANA_PRIVATE_KEY?.trim();

  if (!value) {
    throw new Error("Missing required environment variable: SOLANA_PRIVATE_KEY.");
  }

  if (value.startsWith("[")) {
    return Keypair.fromSecretKey(new Uint8Array(JSON.parse(value)));
  }

  return Keypair.fromSecretKey(bs58.decode(value));
}
