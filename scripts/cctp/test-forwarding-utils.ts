import {
  CCTP_FORWARD_MAGIC,
  STATIC_FORWARD_HOOK_DATA,
  buildForwardHookDataWithAtaCreation,
  buildStaticForwardHookData,
  encodeSolanaAtaAsBytes32,
  getForwardingFeeEstimate,
  getSolanaUsdcAta,
} from "./forwarding-utils.ts";

const SAMPLE_SOLANA_DEVNET_WALLET_ADDRESS = "8kA3DaRME1xdJrYn3XZmsSMFXZJEm4bj4kkhSAfy12VH";
const EXPECTED_STATIC_HOOK_DATA = "0x636374702d666f72776172640000000000000000000000000000000000000000";
const MAGIC_HEX_PREFIX = `0x${Buffer.from(CCTP_FORWARD_MAGIC, "ascii").toString("hex")}`;

const validationErrors: string[] = [];
const ata = getSolanaUsdcAta(SAMPLE_SOLANA_DEVNET_WALLET_ADDRESS);
const encodedAta = encodeSolanaAtaAsBytes32(SAMPLE_SOLANA_DEVNET_WALLET_ADDRESS);
const staticHookData = buildStaticForwardHookData();
const extendedHookData = buildForwardHookDataWithAtaCreation(SAMPLE_SOLANA_DEVNET_WALLET_ADDRESS);
const feeEstimate = await getForwardingFeeEstimate({ includeRecipientSetup: true });

if (encodedAta.length !== 66) {
  validationErrors.push(`Encoded ATA bytes32 length must be 66, received ${encodedAta.length}.`);
}

if (staticHookData !== EXPECTED_STATIC_HOOK_DATA || staticHookData !== STATIC_FORWARD_HOOK_DATA) {
  validationErrors.push("Static hook data does not match expected cctp-forward payload.");
}

if (!extendedHookData.startsWith(MAGIC_HEX_PREFIX)) {
  validationErrors.push("Extended hook data does not start with cctp-forward magic bytes.");
}

console.log("OmnisRouter CCTP Forwarding Service utility dry test");
console.log("");
console.log(`Solana devnet wallet: ${SAMPLE_SOLANA_DEVNET_WALLET_ADDRESS}`);
console.log(`Derived USDC ATA: ${ata.toBase58()}`);
console.log(`Encoded ATA bytes32: ${encodedAta}`);
console.log(`Static hook data: ${staticHookData}`);
console.log(`Extended ATA-creation hook data: ${extendedHookData}`);
console.log("");

if (feeEstimate.warning) {
  console.warn(`Fee estimate warning: ${feeEstimate.warning}`);
}

if (feeEstimate.rawResponse !== undefined) {
  console.log("Raw Circle fee response");
  console.log(JSON.stringify(feeEstimate.rawResponse, null, 2));
  console.log("");
}

if (feeEstimate.feeOptions?.length) {
  console.log("Parsed forwarding fee options");
  for (const option of feeEstimate.feeOptions) {
    console.log(`- finalityThreshold=${option.finalityThreshold ?? "unknown"}, minimumFee=${option.minimumFee ?? "unknown"}, low=${option.low ?? "not returned"}, med=${option.med ?? "not returned"}, high=${option.high ?? "not returned"}`);
  }
  console.log("");
}

if (feeEstimate.low || feeEstimate.med || feeEstimate.high) {
  console.log("Selected forwarding fee estimate");
  console.log(`- low: ${feeEstimate.low ?? "not returned by Circle"}`);
  console.log(`- med: ${feeEstimate.med ?? "not returned by Circle"}`);
  console.log(`- high: ${feeEstimate.high ?? "not returned by Circle"}`);
  console.log(`- maxFee: ${feeEstimate.maxFee ?? "cannot compute without high fee"}`);
  console.log(`- explanation: ${feeEstimate.explanation ?? "No explanation provided."}`);
} else if (!feeEstimate.warning) {
  console.log("Forwarding fee estimate unavailable: Circle response did not include parseable forwardFee tiers.");
}

if (validationErrors.length > 0) {
  console.error("");
  console.error("Local forwarding utility validation failed:");
  for (const error of validationErrors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("");
console.log("Forwarding utility dry test passed. No transactions performed. No private keys required.");
