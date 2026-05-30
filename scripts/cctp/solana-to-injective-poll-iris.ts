import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const IRIS_SANDBOX_URL = "https://iris-api-sandbox.circle.com/v2/messages/5";
const POLL_INTERVAL_MS = 5000;
const MAX_ATTEMPTS = 240;
const TMP_DIR = resolve(import.meta.dirname ?? resolve(), "..", "..", ".tmp");
const OUTPUT_FILE = resolve(TMP_DIR, "cctp-solana-to-injective-attestation.json");

const txHash = process.argv[2]?.trim() || process.env.SOLANA_BURN_TX_HASH?.trim();

if (!txHash) {
  console.error("Missing Solana burn transaction hash. Pass it as an argument or set SOLANA_BURN_TX_HASH.");
  process.exit(1);
}

console.log("OmnisRouter Solana -> Injective CCTP Iris Attestation Polling");
console.log("");
console.log(`Solana burn tx: ${txHash}`);
console.log(`Polling every ${POLL_INTERVAL_MS / 1000}s, up to ${MAX_ATTEMPTS} attempts.`);
console.log("");

if (!existsSync(TMP_DIR)) {
  mkdirSync(TMP_DIR, { recursive: true });
}

let attempt = 0;
let firstResponsePrinted = false;

while (attempt < MAX_ATTEMPTS) {
  attempt++;

  try {
    const url = `${IRIS_SANDBOX_URL}?transactionHash=${encodeURIComponent(txHash)}`;
    const response = await fetch(url);

    if (response.status === 404) {
      console.log(`[${attempt}/${MAX_ATTEMPTS}] Attestation not ready yet. This is normal; do not burn again.`);
      await delay(POLL_INTERVAL_MS);
      continue;
    }

    if (!response.ok) {
      console.log(`[${attempt}/${MAX_ATTEMPTS}] Iris returned ${response.status} ${response.statusText}.`);
      await delay(POLL_INTERVAL_MS);
      continue;
    }

    const data = await response.json() as Record<string, unknown>;

    if (!firstResponsePrinted) {
      firstResponsePrinted = true;
      console.log("First Iris response (raw):");
      console.log(JSON.stringify(data, null, 2));
      console.log("");
    }

    const messages = Array.isArray(data.messages) ? data.messages : [];
    const first = messages[0] as Record<string, unknown> | undefined;

    if (!first) {
      console.log(`[${attempt}/${MAX_ATTEMPTS}] No message found in Iris response yet.`);
      await delay(POLL_INTERVAL_MS);
      continue;
    }

    const message = typeof first.message === "string" ? first.message : "";
    const attestation = typeof first.attestation === "string" ? first.attestation : "";
    const status = (typeof first.status === "string" ? first.status : undefined)
      ?? (typeof data.status === "string" ? data.status : undefined)
      ?? "unknown";

    if (attestation === "PENDING" || !attestation) {
      console.log(`[${attempt}/${MAX_ATTEMPTS}] Attestation pending. Status: ${status}. Waiting...`);
      await delay(POLL_INTERVAL_MS);
      continue;
    }

    const isComplete = (message.startsWith("0x") && attestation.startsWith("0x"))
      || status === "complete";

    if (!isComplete) {
      console.log(`[${attempt}/${MAX_ATTEMPTS}] Status: ${status}. Waiting...`);
      await delay(POLL_INTERVAL_MS);
      continue;
    }

    console.log("");
    console.log("Attestation complete.");
    console.log(`  Tx hash: ${txHash}`);
    console.log(`  Message length: ${message.length} chars`);
    console.log(`  Attestation length: ${attestation.length} chars`);

    const result = {
      sourceDomain: 5,
      destinationDomain: 29,
      solanaBurnTxHash: txHash,
      message,
      attestation,
      status: status === "unknown" ? "complete" : status,
      fetchedAt: new Date().toISOString(),
    };

    writeFileSync(OUTPUT_FILE, JSON.stringify(result, null, 2), "utf8");
    console.log(`  Saved to ${OUTPUT_FILE}`);
    console.log("");
    console.log("Next phase: submit attestation to Injective MessageTransmitterV2 via receiveMessage.");
    console.log("No Injective transaction was attempted.");

    process.exit(0);
  } catch (error) {
    console.log(`[${attempt}/${MAX_ATTEMPTS}] Request failed: ${error instanceof Error ? error.message : String(error)}`);
    await delay(POLL_INTERVAL_MS);
  }
}

console.log("");
console.error(`Attestation not available after ${MAX_ATTEMPTS} attempts.`);
console.error("The Circle message may not have been produced yet. Try again later or verify the burn tx hash.");
process.exit(1);

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
