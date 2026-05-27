import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { CCTP_DOMAINS, SOLANA_DEVNET_CCTP } from "./constants.ts";

export const STATIC_FORWARD_HOOK_DATA = "0x636374702d666f72776172640000000000000000000000000000000000000000";
export const CCTP_FORWARD_MAGIC = "cctp-forward";
export const CIRCLE_SANDBOX_FORWARD_FEE_URL = `https://iris-api-sandbox.circle.com/v2/burn/USDC/fees/${CCTP_DOMAINS.Injective}/${CCTP_DOMAINS.Solana}?forward=true`;

type ForwardingFeeEstimate = {
  low?: string;
  med?: string;
  high?: string;
  maxFee?: string;
  rawResponse?: unknown;
  feeOptions?: Array<{
    finalityThreshold?: string;
    minimumFee?: string;
    low?: string;
    med?: string;
    high?: string;
  }>;
  explanation?: string;
  warning?: string;
};

export function getSolanaUsdcAta(solanaWalletAddress: string) {
  const owner = new PublicKey(solanaWalletAddress);
  const mint = new PublicKey(SOLANA_DEVNET_CCTP.UsdcMint);

  return getAssociatedTokenAddressSync(mint, owner);
}

export function encodeSolanaAtaAsBytes32(solanaWalletAddress: string) {
  const ata = getSolanaUsdcAta(solanaWalletAddress);

  return publicKeyToBytes32Hex(ata);
}

export function buildStaticForwardHookData() {
  return STATIC_FORWARD_HOOK_DATA;
}

export function buildForwardHookDataWithAtaCreation(solanaWalletAddress: string) {
  const wallet = new PublicKey(solanaWalletAddress);
  const magic = Buffer.alloc(24);
  magic.write(CCTP_FORWARD_MAGIC, "ascii");

  const version = Buffer.alloc(4);
  version.writeUInt32BE(0, 0);

  const length = Buffer.alloc(4);
  length.writeUInt32BE(33, 0);

  const ataCreationFlag = Buffer.from([1]);
  const hookData = Buffer.concat([
    magic,
    version,
    length,
    ataCreationFlag,
    Buffer.from(wallet.toBytes()),
  ]);

  return `0x${hookData.toString("hex")}`;
}

export async function getForwardingFeeEstimate(options: { includeRecipientSetup?: boolean } = {}): Promise<ForwardingFeeEstimate> {
  const url = options.includeRecipientSetup
    ? `${CIRCLE_SANDBOX_FORWARD_FEE_URL}&includeRecipientSetup=true`
    : CIRCLE_SANDBOX_FORWARD_FEE_URL;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      return { warning: `Circle fee API returned ${response.status} ${response.statusText}.` };
    }

    const data = await response.json() as unknown;

    return {
      rawResponse: data,
      ...extractForwardingFees(data),
    };
  } catch (error) {
    return {
      warning: error instanceof Error
        ? `Circle fee API request failed: ${error.message}`
        : "Circle fee API request failed.",
    };
  }
}

function publicKeyToBytes32Hex(publicKey: PublicKey) {
  const bytes = publicKey.toBytes();

  if (bytes.length !== 32) {
    throw new Error(`Expected Solana public key to be 32 bytes, received ${bytes.length}.`);
  }

  return `0x${Buffer.from(bytes).toString("hex")}`;
}

function extractForwardingFees(data: unknown): ForwardingFeeEstimate {
  if (Array.isArray(data)) {
    return extractForwardingFeeOptions(data);
  }

  if (!data || typeof data !== "object") {
    return { warning: "Circle fee API returned an unexpected response." };
  }

  const record = data as Record<string, unknown>;
  const direct = pickFeeTiers(record);

  if (direct.low || direct.med || direct.high) {
    return direct;
  }

  for (const value of Object.values(record)) {
    if (value && typeof value === "object") {
      const nested = pickFeeTiers(value as Record<string, unknown>);

      if (nested.low || nested.med || nested.high) {
        return nested;
      }
    }
  }

  return { warning: "Circle fee API response did not include low/med/high fee tiers." };
}

function extractForwardingFeeOptions(values: unknown[]): ForwardingFeeEstimate {
  const feeOptions = values
    .filter((value): value is Record<string, unknown> => Boolean(value) && typeof value === "object")
    .map((record) => {
      const forwardFee = record.forwardFee && typeof record.forwardFee === "object"
        ? record.forwardFee as Record<string, unknown>
        : undefined;

      return {
        finalityThreshold: stringifyFee(record.finalityThreshold),
        minimumFee: stringifyFee(record.minimumFee),
        low: stringifyFee(forwardFee?.low),
        med: stringifyFee(forwardFee?.med),
        high: stringifyFee(forwardFee?.high),
      };
    });
  const firstCompleteOption = feeOptions.find((option) => option.low || option.med || option.high);

  if (!firstCompleteOption) {
    return {
      explanation: "Circle returned fee options, but none included forwardFee.low/med/high values.",
      feeOptions,
      warning: "Circle fee API response did not include forward fee tiers.",
    };
  }

  return {
    ...firstCompleteOption,
    explanation: buildFeeExplanation(firstCompleteOption),
    feeOptions,
    maxFee: computeMaxForwardFee(feeOptions),
  };
}

function pickFeeTiers(record: Record<string, unknown>): ForwardingFeeEstimate {
  return {
    low: stringifyFee(record.low ?? record.lowFee ?? record.minimumFee),
    med: stringifyFee(record.med ?? record.medium ?? record.mediumFee),
    high: stringifyFee(record.high ?? record.highFee ?? record.maximumFee),
  };
}

function stringifyFee(value: unknown) {
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }

  if (value && typeof value === "object") {
    return JSON.stringify(value);
  }

  return undefined;
}

function computeMaxForwardFee(feeOptions: Array<{ high?: string; minimumFee?: string }>) {
  const maxFee = feeOptions.reduce<bigint | null>((currentMax, option) => {
    const high = parseIntegerString(option.high);
    const minimumFee = parseIntegerString(option.minimumFee) ?? BigInt(0);

    if (high === undefined) {
      return currentMax;
    }

    const candidate = high + minimumFee;

    return currentMax === null || candidate > currentMax ? candidate : currentMax;
  }, null);

  return maxFee === null ? undefined : maxFee.toString();
}

function parseIntegerString(value: string | undefined) {
  if (!value || !/^\d+$/.test(value)) {
    return undefined;
  }

  return BigInt(value);
}

function buildFeeExplanation(option: { low?: string; med?: string; high?: string }) {
  const missing = [
    option.low ? undefined : "low",
    option.med ? undefined : "med",
    option.high ? undefined : "high",
  ].filter(Boolean);

  if (missing.length === 0) {
    return "Circle returned forwardFee.low, forwardFee.med, and forwardFee.high values.";
  }

  return `Circle did not return ${missing.join("/")} forward fee value(s) for the selected option.`;
}
