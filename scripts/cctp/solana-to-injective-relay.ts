import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const INJECTIVE_TESTNET_EVM_RPC_URL = "https://k8s.testnet.json-rpc.injective.network/";
const INJECTIVE_TESTNET_EVM_CHAIN_ID = 1439;
const MESSAGE_TRANSMITTER_V2 = "0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275";
const RELAY_CONFIRMATION = "YES";

const DEFAULT_ATTESTATION_PATH = resolve(
  import.meta.dirname ?? resolve(),
  "..",
  "..",
  ".tmp",
  "cctp-solana-to-injective-attestation.json",
);

const TMP_DIR = resolve(import.meta.dirname ?? resolve(), "..", "..", ".tmp");
const RECEIPT_FILE = resolve(TMP_DIR, "cctp-solana-to-injective-relay-receipt.json");

if (process.env.CONFIRM_SOLANA_TO_INJECTIVE_RELAY !== RELAY_CONFIRMATION) {
  console.error("CONFIRM_SOLANA_TO_INJECTIVE_RELAY must be YES to submit the relay transaction.");
  console.error("No transaction sent.");
  process.exit(1);
}

const attestationPath = process.argv[2]?.trim() || DEFAULT_ATTESTATION_PATH;

if (!existsSync(attestationPath)) {
  console.error(`Attestation file not found: ${attestationPath}`);
  console.error("Run the Iris polling script first to generate the attestation.");
  process.exit(1);
}

const raw = readFileSync(attestationPath, "utf8");
const attestationData = JSON.parse(raw) as Record<string, unknown>;

const message = typeof attestationData.message === "string" ? attestationData.message : "";
const attestation = typeof attestationData.attestation === "string" ? attestationData.attestation : "";
const solanaBurnTxHash = typeof attestationData.solanaBurnTxHash === "string" ? attestationData.solanaBurnTxHash : "";
const destinationDomain = attestationData.destinationDomain;

if (!message.startsWith("0x")) {
  throw new Error("Invalid message in attestation file: must start with 0x.");
}

if (!attestation.startsWith("0x")) {
  throw new Error("Invalid attestation in attestation file: must start with 0x.");
}

const privateKey = process.env.INJECTIVE_EVM_PRIVATE_KEY;

if (!privateKey) {
  throw new Error("Missing required environment variable: INJECTIVE_EVM_PRIVATE_KEY.");
}

const normalizedKey = privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`;

if (!/^0x[0-9a-fA-F]{64}$/.test(normalizedKey)) {
  throw new Error("INJECTIVE_EVM_PRIVATE_KEY must be a 32-byte hex private key.");
}

const account = privateKeyToAccount(normalizedKey as Hex);

const injectiveTestnetEvm = defineChain({
  id: INJECTIVE_TESTNET_EVM_CHAIN_ID,
  name: "Injective EVM Testnet",
  nativeCurrency: { name: "Injective", symbol: "INJ", decimals: 18 },
  rpcUrls: {
    default: { http: [INJECTIVE_TESTNET_EVM_RPC_URL] },
  },
});

const publicClient = createPublicClient({
  chain: injectiveTestnetEvm,
  transport: http(INJECTIVE_TESTNET_EVM_RPC_URL),
});

const walletClient = createWalletClient({
  account,
  chain: injectiveTestnetEvm,
  transport: http(INJECTIVE_TESTNET_EVM_RPC_URL),
});

const messageTransmitterV2Abi = [
  {
    type: "function",
    name: "receiveMessage",
    stateMutability: "nonpayable",
    inputs: [
      { name: "message", type: "bytes" },
      { name: "attestation", type: "bytes" },
    ],
    outputs: [{ name: "success", type: "bool" }],
  },
] as const;

console.log("OmnisRouter Solana -> Injective CCTP V2 Manual Relay — receiveMessage");
console.log("");
console.log(`Relayer address: ${account.address}`);
console.log(`Solana burn tx: ${solanaBurnTxHash}`);
console.log(`Destination domain: ${destinationDomain}`);
console.log(`Message length: ${message.length} chars`);
console.log(`Attestation length: ${attestation.length} chars`);

const txHash = await walletClient.writeContract({
  address: MESSAGE_TRANSMITTER_V2,
  abi: messageTransmitterV2Abi,
  functionName: "receiveMessage",
  args: [message as Hex, attestation as Hex],
  account,
  chain: injectiveTestnetEvm,
});

console.log(`Relay tx submitted: ${txHash}`);

const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

console.log("");
console.log(`Receipt status: ${receipt.status}`);
console.log(`Block number: ${receipt.blockNumber}`);

if (!existsSync(TMP_DIR)) {
  mkdirSync(TMP_DIR, { recursive: true });
}

const receiptPayload = {
  solanaBurnTxHash,
  injectiveRelayTxHash: txHash,
  receiptStatus: receipt.status,
  blockNumber: receipt.blockNumber.toString(),
  relayerAddress: account.address,
  destinationDomain,
  submittedAt: new Date().toISOString(),
};

writeFileSync(RECEIPT_FILE, JSON.stringify(receiptPayload, null, 2), "utf8");

console.log(`Receipt saved to ${RECEIPT_FILE}`);
console.log("");
console.log("Relay complete. Solana -> Injective CCTP V2 manual relay finished.");
