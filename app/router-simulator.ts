import { PublicKey } from "@solana/web3.js";
import { bech32 } from "bech32";
import { isAddress } from "ethers";

export type ChainName = "Solana" | "Injective" | "Base" | "Arbitrum";
export type DetectedChain = ChainName | "EVM" | "Unknown";
export type RecipientAddressValidation = {
  isValid: boolean;
  chainType: "Solana" | "Injective" | "EVM" | "Unknown";
  normalizedAddress: string;
  error?: string;
  warning?: string;
};

export type PaymentIntent = {
  amount: number;
  asset: string;
  recipientAddress: string;
  optionalSourceChain?: string;
  optionalDestinationChain?: string;
};

export type SpendingRules = {
  maxTransferAmount: number;
  dailyTransferLimit: number;
  approvalThreshold: number;
  allowedDestinationChains: string[];
  gasCreditLimit: number;
  emergencyPauseEnabled: boolean;
};

export type GasCreditState = {
  dailyLimit: number;
  usedToday: number;
  lastResetDate: string;
  remaining: number;
};

export type BalanceEntry = {
  USDC: number;
  enabled: boolean;
};

export type MockBalances = Record<ChainName, BalanceEntry>;

export type RuleResult = {
  status: "approved" | "needs_approval" | "denied";
  reasons: string[];
};

export type RouteDefinition = {
  id: string;
  asset: string;
  sourceChain: ChainName;
  destinationChain: ChainName;
  protocol: string;
  executionMode: "simulated";
  destinationMintMode: string;
};

export type RealRouteCandidate = {
  id: string;
  asset: "USDC";
  sourceChain: "Injective";
  destinationChain: "Solana";
  protocol: "Circle CCTP Forwarding Service";
  executionMode: "real-testnet";
  sourceAsset: "Injective testnet USDC";
  destinationAsset: "Solana devnet USDC";
};

export type RouteResult = {
  supported: boolean;
  recommended: boolean;
  sourceChain?: ChainName;
  destinationChain: DetectedChain;
  recipientValidation: RecipientAddressValidation;
  route?: string;
  routeId?: string;
  protocol?: string;
  destinationMintMode?: string;
  reason: string;
  definition?: RouteDefinition;
  realRouteCandidate?: RealRouteCandidate;
};

export type GasResult = {
  feeMode: "sponsored" | "user_choice_required";
  uiText: string;
  remaining: number;
  remainingAfterPayment: number;
  estimatedFee: number;
};

export type PaymentExecution = {
  timeline: string[];
  receipt: {
    sender: string;
    recipient: string;
    amount: string;
    received: string;
    route: string;
    routeId: string;
    protocol: string;
    gasMode: string;
    destinationMintMode: string;
    feePaidBy: string;
    status: string;
    timestamp: string;
  };
};

const base58Pattern = /^[1-9A-HJ-NP-Za-km-z]+$/;
const hexPattern = /^[0-9a-fA-F]+$/;

export const estimatedFeeUsdc = 0.03;

export const defaultBalances: MockBalances = {
  Solana: { USDC: 100, enabled: true },
  Injective: { USDC: 50, enabled: true },
  Base: { USDC: 0, enabled: false },
  Arbitrum: { USDC: 0, enabled: false },
};

export const routeRegistry: RouteDefinition[] = [
  {
    id: "solana-usdc-injective-usdc-cctp",
    asset: "USDC",
    sourceChain: "Solana",
    destinationChain: "Injective",
    protocol: "CCTP",
    executionMode: "simulated",
    destinationMintMode: "custom-relay-or-guided-claim",
  },
  {
    id: "injective-usdc-solana-usdc-cctp",
    asset: "USDC",
    sourceChain: "Injective",
    destinationChain: "Solana",
    protocol: "CCTP",
    executionMode: "simulated",
    destinationMintMode: "forwarding-service-or-relay",
  },
];

const injectiveToSolanaRealCctpCandidate: RealRouteCandidate = {
  id: "injective-testnet-usdc-solana-devnet-usdc-cctp-forwarding-service",
  asset: "USDC",
  sourceChain: "Injective",
  destinationChain: "Solana",
  protocol: "Circle CCTP Forwarding Service",
  executionMode: "real-testnet",
  sourceAsset: "Injective testnet USDC",
  destinationAsset: "Solana devnet USDC",
};

export function validateRecipientAddress(address: string): RecipientAddressValidation {
  const normalizedAddress = address.trim();

  if (!normalizedAddress) {
    return {
      isValid: false,
      chainType: "Unknown",
      normalizedAddress,
      error: "Enter a recipient address.",
    };
  }

  if (/^inj/i.test(normalizedAddress)) {
    try {
      const decoded = bech32.decode(normalizedAddress);
      const accountData = bech32.fromWords(decoded.words);

      if (decoded.prefix !== "inj") {
        return {
          isValid: false,
          chainType: "Injective",
          normalizedAddress,
          error: "Injective address must use the inj prefix.",
        };
      }

      if (accountData.length !== 20) {
        return {
          isValid: false,
          chainType: "Injective",
          normalizedAddress,
          error: "Injective address decoded account data is not a normal 20-byte account.",
        };
      }

      return { isValid: true, chainType: "Injective", normalizedAddress };
    } catch {
      return {
        isValid: false,
        chainType: "Injective",
        normalizedAddress,
        error: "Invalid Injective Bech32 address.",
      };
    }
  }

  if (/^0x/i.test(normalizedAddress)) {
    if (normalizedAddress.length !== 42) {
      return {
        isValid: false,
        chainType: "EVM",
        normalizedAddress,
        error: "EVM address must be exactly 42 characters including 0x.",
        warning: "EVM address detected, but exact EVM destination chain cannot be inferred from address alone. EVM routing is not enabled in this MVP yet.",
      };
    }

    if (!hexPattern.test(normalizedAddress.slice(2)) || !isAddress(normalizedAddress)) {
      return {
        isValid: false,
        chainType: "EVM",
        normalizedAddress,
        error: "Invalid EVM address.",
        warning: "EVM address detected, but exact EVM destination chain cannot be inferred from address alone. EVM routing is not enabled in this MVP yet.",
      };
    }

    return {
      isValid: true,
      chainType: "EVM",
      normalizedAddress,
      warning: "EVM address detected, but exact EVM destination chain cannot be inferred from address alone. EVM routing is not enabled in this MVP yet.",
    };
  }

  if (base58Pattern.test(normalizedAddress)) {
    if (normalizedAddress.length < 32 || normalizedAddress.length > 44) {
      return {
        isValid: false,
        chainType: "Unknown",
        normalizedAddress,
        error: "Solana address must be a valid base58 public key between 32 and 44 characters.",
      };
    }

    try {
      const key = new PublicKey(normalizedAddress);

      if (key.toBase58() !== normalizedAddress) {
        return {
          isValid: false,
          chainType: "Unknown",
          normalizedAddress,
          error: "Invalid Solana public key.",
        };
      }

      return { isValid: true, chainType: "Solana", normalizedAddress };
    } catch {
      return {
        isValid: false,
        chainType: "Unknown",
        normalizedAddress,
        error: "Invalid Solana public key.",
      };
    }
  }

  return {
    isValid: false,
    chainType: "Unknown",
    normalizedAddress,
    error: "Unknown recipient address format. Enter a valid Solana, Injective, or EVM address.",
  };
}

export function detectAddressChain(address: string): DetectedChain {
  return validateRecipientAddress(address).chainType;
}

export function shortenAddress(address: string): string {
  const normalized = address.trim();

  if (normalized.length <= 14) {
    return normalized || "No recipient detected";
  }

  return `${normalized.slice(0, 6)}...${normalized.slice(-6)}`;
}

export function parsePaymentIntent(command: string): PaymentIntent {
  const normalized = command.trim();
  const amountMatch = normalized.match(/\b(?:send|pay|transfer)\s+(\d+(?:\.\d+)?)\s*(?:USDC|USDT|DAI)?\b/i) ?? normalized.match(/\b(\d+(?:\.\d+)?)\s*(?:USDC|USDT|DAI)\b/i);
  const assetMatch = normalized.match(/\b(USDC|USDT|DAI)\b/i);
  const sourceMatch = normalized.match(/\bfrom\s+(Solana|Injective|Base|Arbitrum)\b/i);
  const destinationMatch = normalized.match(/\bto\s+(Solana|Injective|Base|Arbitrum)\b/i);
  const explicitAddressMatch = normalized.match(/\bto\s+(?:this\s+)?(?:Solana|Injective|Base|Arbitrum|EVM)?\s*(?:address\s+)?(\S+)/i);
  const recipientMatch = explicitAddressMatch?.[1] ?? normalized.match(/\b(inj\S+|0x\S+|[1-9A-HJ-NP-Za-km-z]{8,44})\b/i)?.[1];

  return {
    amount: amountMatch ? Number(amountMatch[1]) : 0,
    asset: assetMatch ? assetMatch[1].toUpperCase() : "USDC",
    recipientAddress: recipientMatch ?? "",
    optionalSourceChain: sourceMatch ? titleCase(sourceMatch[1]) : undefined,
    optionalDestinationChain: destinationMatch ? titleCase(destinationMatch[1]) : undefined,
  };
}

export function resolvePaymentRoute(
  intent: PaymentIntent,
  balances: MockBalances,
  supportedRoutes: RouteDefinition[] = routeRegistry,
): RouteResult {
  const recipientValidation = validateRecipientAddress(intent.recipientAddress);
  const destinationChain = recipientValidation.chainType;
  const requestedSource = normalizeChain(intent.optionalSourceChain);
  const realRouteCandidate = getRealCctpCandidate(intent, recipientValidation, requestedSource);

  if (!recipientValidation.isValid) {
    return {
      supported: false,
      recommended: false,
      destinationChain,
      recipientValidation,
      reason: recipientValidation.error ?? "Invalid recipient address.",
      realRouteCandidate,
    };
  }

  if (destinationChain === "EVM") {
    return {
      supported: false,
      recommended: false,
      destinationChain,
      recipientValidation,
      reason: "EVM address detected, but exact EVM destination chain cannot be inferred from address alone. EVM routing is not enabled in this MVP yet.",
      realRouteCandidate,
    };
  }

  if (destinationChain === "Unknown") {
    return {
      supported: false,
      recommended: false,
      destinationChain,
      recipientValidation,
      reason: "Enter a valid Solana or Injective recipient address to resolve a supported route.",
      realRouteCandidate,
    };
  }

  const candidateRoutes = supportedRoutes.filter(
    (route) =>
      route.asset === intent.asset &&
      route.destinationChain === destinationChain &&
      (!requestedSource || route.sourceChain === requestedSource),
  );
  const route = candidateRoutes.find((candidate) => {
    const sourceBalance = balances[candidate.sourceChain];

    return sourceBalance.enabled && sourceBalance.USDC >= intent.amount;
  });

  if (!route) {
    return {
      supported: false,
      recommended: false,
      destinationChain,
      recipientValidation,
      reason: candidateRoutes.length === 0
        ? "No simulated USDC CCTP route is enabled for this destination in the MVP."
        : `No enabled source chain has enough ${intent.asset} balance for this route.`,
      realRouteCandidate,
    };
  }

  return {
    supported: true,
    recommended: true,
    sourceChain: route.sourceChain,
    destinationChain: route.destinationChain,
    recipientValidation,
    route: `${route.sourceChain} -> ${route.destinationChain}`,
    routeId: route.id,
    protocol: route.protocol,
    destinationMintMode: route.destinationMintMode,
    reason: `${route.protocol} route recommended with ${route.destinationMintMode}.`,
    definition: route,
    realRouteCandidate,
  };
}

function getRealCctpCandidate(
  intent: PaymentIntent,
  recipientValidation: RecipientAddressValidation,
  requestedSource: ChainName | undefined,
): RealRouteCandidate | undefined {
  const sourceDoesNotConflict = !requestedSource || requestedSource === "Injective";

  if (
    intent.asset.toUpperCase() === "USDC" &&
    intent.amount > 0 &&
    recipientValidation.isValid &&
    recipientValidation.chainType === "Solana" &&
    sourceDoesNotConflict
  ) {
    return injectiveToSolanaRealCctpCandidate;
  }

  return undefined;
}

export function validateSpendingRules(
  intent: PaymentIntent,
  rules: SpendingRules,
  route: RouteResult,
): RuleResult {
  if (rules.emergencyPauseEnabled) {
    return { status: "denied", reasons: ["Emergency pause is enabled."] };
  }

  if (intent.amount > rules.maxTransferAmount) {
    return {
      status: "denied",
      reasons: [`Amount exceeds max transfer amount of ${rules.maxTransferAmount} USDC.`],
    };
  }

  if (!route.supported) {
    return { status: "denied", reasons: [route.reason] };
  }

  if (!rules.allowedDestinationChains.includes(route.destinationChain)) {
    return {
      status: "denied",
      reasons: [`Destination chain ${route.destinationChain} is not allowed.`],
    };
  }

  if (intent.amount > rules.approvalThreshold) {
    return {
      status: "needs_approval",
      reasons: [`Amount is above the ${rules.approvalThreshold} USDC approval threshold.`],
    };
  }

  return { status: "approved", reasons: ["All spending rules passed."] };
}

export function checkGasCredits(gasCredits: GasCreditState): GasResult {
  const remaining = Math.max(gasCredits.dailyLimit - gasCredits.usedToday, 0);

  if (remaining <= 0) {
    return {
      feeMode: "user_choice_required",
      uiText: "You've used your 5 sponsored transfers today.",
      remaining: 0,
      remainingAfterPayment: 0,
      estimatedFee: estimatedFeeUsdc,
    };
  }

  return {
    feeMode: "sponsored",
    uiText: "Gas covered by sponsored transfer credit",
    remaining,
    remainingAfterPayment: remaining - 1,
    estimatedFee: estimatedFeeUsdc,
  };
}

export function simulatePaymentExecution(
  intent: PaymentIntent,
  route: RouteResult,
  gasMode: string,
  receivedAmount: number,
): PaymentExecution {
  const timestamp = new Date().toISOString();
  const sourceChain = route.sourceChain ?? "Unknown";
  const destinationChain = route.destinationChain;

  return {
    timeline: [
      "Intent parsed",
      `Destination detected as ${destinationChain}`,
      `Route selected: ${route.routeId ?? "unsupported"}`,
      "Rules validated",
      "User approved",
      `USDC burned on ${sourceChain}`,
      "Circle attestation received",
      `Mint handled by ${route.destinationMintMode ?? "unknown mode"}`,
      `USDC credited on ${destinationChain}`,
      "Complete",
    ],
    receipt: {
      sender: `mock-${sourceChain.toLowerCase()}-wallet`,
      recipient: intent.recipientAddress,
      amount: `${intent.amount.toFixed(2)} ${intent.asset}`,
      received: `${receivedAmount.toFixed(2)} ${intent.asset}`,
      route: route.route ?? "Unsupported",
      routeId: route.routeId ?? "unsupported",
      protocol: route.protocol ?? "None",
      gasMode,
      destinationMintMode: route.destinationMintMode ?? "None",
      feePaidBy: gasMode === "sponsored" ? "OmnisRouter gas credit" : "Sender",
      status: "Complete",
      timestamp,
    },
  };
}

function normalizeChain(value?: string): ChainName | undefined {
  const normalized = titleCase(value ?? "");

  if (["Solana", "Injective", "Base", "Arbitrum"].includes(normalized)) {
    return normalized as ChainName;
  }

  return undefined;
}

function titleCase(value: string): string {
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}
