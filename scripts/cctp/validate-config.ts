import { PublicKey } from "@solana/web3.js";
import { isAddress } from "ethers";
import {
  CCTP_DOMAINS,
  CCTP_TEST_ROUTES,
  INJECTIVE_TESTNET_CCTP,
  SOLANA_DEVNET_CCTP,
} from "./constants.ts";

type ValidationResult = {
  label: string;
  value: string | number;
  valid: boolean;
};

const results: ValidationResult[] = [
  ...Object.entries(CCTP_DOMAINS).map(([label, value]) => ({
    label: `${label} CCTP domain`,
    value,
    valid: Number.isInteger(value) && value >= 0,
  })),
  ...Object.entries(INJECTIVE_TESTNET_CCTP).map(([label, value]) => ({
    label: `Injective testnet ${label}`,
    value,
    valid: isAddress(value),
  })),
  ...Object.entries(SOLANA_DEVNET_CCTP).map(([label, value]) => ({
    label: `Solana devnet ${label}`,
    value,
    valid: isSolanaPublicKey(value),
  })),
];

console.log("OmnisRouter CCTP lab config validation");
console.log("");
console.log("Routes");

for (const route of CCTP_TEST_ROUTES) {
  console.log(`- ${route.from} -> ${route.to}: domain ${route.sourceDomain} -> ${route.destinationDomain}`);
}

console.log("");
console.log("Domains");
console.log(`- Injective: ${CCTP_DOMAINS.Injective}`);
console.log(`- Solana: ${CCTP_DOMAINS.Solana}`);

console.log("");
console.log("Addresses and programs");

for (const result of results) {
  console.log(`${result.valid ? "OK" : "INVALID"} ${result.label}: ${result.value}`);
}

const invalidResults = results.filter((result) => !result.valid);

if (invalidResults.length > 0) {
  console.error("");
  console.error(`CCTP config invalid: ${invalidResults.length} issue(s) found.`);
  process.exit(1);
}

console.log("");
console.log("CCTP config valid. No transactions performed. No private keys required.");

function isSolanaPublicKey(value: string) {
  try {
    const publicKey = new PublicKey(value);

    return publicKey.toBase58() === value;
  } catch {
    return false;
  }
}
