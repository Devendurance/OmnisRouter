import { NextResponse } from "next/server";
import {
  createPublicClient,
  defineChain,
  http,
  zeroAddress,
} from "viem";

const INJECTIVE_TESTNET_EVM_RPC_URL = "https://k8s.testnet.json-rpc.injective.network/";
const INJECTIVE_TESTNET_EVM_CHAIN_ID = 1439;
const INJECTIVE_TESTNET_USDC = "0x0C382e685bbeeFE5d3d9C29e29E341fEE8E84C5d" as const;
const DUMMY_BYTES32 = `0x${"0".repeat(64)}` as const;
const NOTE = "Do not assume permit alone enables relayer-paid depositForBurn, because TokenMessenger burns from msg.sender.";

type CapabilityCheck = {
  supported: boolean;
  value?: string | boolean;
  error?: string;
};

const injectiveTestnetEvm = defineChain({
  id: INJECTIVE_TESTNET_EVM_CHAIN_ID,
  name: "Injective EVM Testnet",
  nativeCurrency: { name: "Injective", symbol: "INJ", decimals: 18 },
  rpcUrls: {
    default: { http: [INJECTIVE_TESTNET_EVM_RPC_URL] },
  },
});

const usdcAuthorizationAbi = [
  {
    type: "function",
    name: "DOMAIN_SEPARATOR",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bytes32" }],
  },
  {
    type: "function",
    name: "nonces",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "permit",
    stateMutability: "nonpayable",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
      { name: "value", type: "uint256" },
      { name: "deadline", type: "uint256" },
      { name: "v", type: "uint8" },
      { name: "r", type: "bytes32" },
      { name: "s", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "transferWithAuthorization",
    stateMutability: "nonpayable",
    inputs: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
      { name: "v", type: "uint8" },
      { name: "r", type: "bytes32" },
      { name: "s", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "receiveWithAuthorization",
    stateMutability: "nonpayable",
    inputs: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
      { name: "v", type: "uint8" },
      { name: "r", type: "bytes32" },
      { name: "s", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "authorizationState",
    stateMutability: "view",
    inputs: [
      { name: "authorizer", type: "address" },
      { name: "nonce", type: "bytes32" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "cancelAuthorization",
    stateMutability: "nonpayable",
    inputs: [
      { name: "authorizer", type: "address" },
      { name: "nonce", type: "bytes32" },
      { name: "v", type: "uint8" },
      { name: "r", type: "bytes32" },
      { name: "s", type: "bytes32" },
    ],
    outputs: [],
  },
] as const;

export async function GET() {
  const publicClient = createPublicClient({
    chain: injectiveTestnetEvm,
    transport: http(INJECTIVE_TESTNET_EVM_RPC_URL),
  });
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
  const validBefore = deadline;

  const checks = {
    domainSeparator: await checkRead(async () => publicClient.readContract({
      address: INJECTIVE_TESTNET_USDC,
      abi: usdcAuthorizationAbi,
      functionName: "DOMAIN_SEPARATOR",
    })),
    nonces: await checkRead(async () => publicClient.readContract({
      address: INJECTIVE_TESTNET_USDC,
      abi: usdcAuthorizationAbi,
      functionName: "nonces",
      args: [zeroAddress],
    })),
    permit: await checkSimulation(async () => publicClient.simulateContract({
      account: zeroAddress,
      address: INJECTIVE_TESTNET_USDC,
      abi: usdcAuthorizationAbi,
      functionName: "permit",
      args: [zeroAddress, zeroAddress, BigInt(1), deadline, 27, DUMMY_BYTES32, DUMMY_BYTES32],
    })),
    transferWithAuthorization: await checkSimulation(async () => publicClient.simulateContract({
      account: zeroAddress,
      address: INJECTIVE_TESTNET_USDC,
      abi: usdcAuthorizationAbi,
      functionName: "transferWithAuthorization",
      args: [zeroAddress, zeroAddress, BigInt(1), BigInt(0), validBefore, DUMMY_BYTES32, 27, DUMMY_BYTES32, DUMMY_BYTES32],
    })),
    receiveWithAuthorization: await checkSimulation(async () => publicClient.simulateContract({
      account: zeroAddress,
      address: INJECTIVE_TESTNET_USDC,
      abi: usdcAuthorizationAbi,
      functionName: "receiveWithAuthorization",
      args: [zeroAddress, zeroAddress, BigInt(1), BigInt(0), validBefore, DUMMY_BYTES32, 27, DUMMY_BYTES32, DUMMY_BYTES32],
    })),
    authorizationState: await checkRead(async () => publicClient.readContract({
      address: INJECTIVE_TESTNET_USDC,
      abi: usdcAuthorizationAbi,
      functionName: "authorizationState",
      args: [zeroAddress, DUMMY_BYTES32],
    })),
    cancelAuthorization: await checkSimulation(async () => publicClient.simulateContract({
      account: zeroAddress,
      address: INJECTIVE_TESTNET_USDC,
      abi: usdcAuthorizationAbi,
      functionName: "cancelAuthorization",
      args: [zeroAddress, DUMMY_BYTES32, 27, DUMMY_BYTES32, DUMMY_BYTES32],
    })),
  };

  const supportsPermit = checks.domainSeparator.supported && checks.nonces.supported && checks.permit.supported;
  const supportsEip3009TransferWithAuthorization = checks.transferWithAuthorization.supported;
  const supportsReceiveWithAuthorization = checks.receiveWithAuthorization.supported;
  const supportsAuthorizationState = checks.authorizationState.supported;

  return NextResponse.json({
    ok: true,
    chainId: INJECTIVE_TESTNET_EVM_CHAIN_ID,
    usdcAddress: INJECTIVE_TESTNET_USDC,
    supportsPermit,
    supportsEip3009TransferWithAuthorization,
    supportsReceiveWithAuthorization,
    supportsAuthorizationState,
    checks,
    recommendedNextStep: getRecommendedNextStep({
      supportsAuthorizationState,
      supportsEip3009TransferWithAuthorization,
      supportsPermit,
      supportsReceiveWithAuthorization,
    }),
    note: NOTE,
  });
}

async function checkRead(read: () => Promise<unknown>): Promise<CapabilityCheck> {
  try {
    const value = await read();

    return { supported: true, value: stringifyValue(value) };
  } catch (error) {
    return { supported: false, error: getErrorMessage(error) };
  }
}

async function checkSimulation(simulate: () => Promise<unknown>): Promise<CapabilityCheck> {
  try {
    await simulate();

    return { supported: true };
  } catch (error) {
    const message = getErrorMessage(error);

    return {
      supported: !looksLikeMissingFunction(message),
      error: message,
    };
  }
}

function getRecommendedNextStep({
  supportsAuthorizationState,
  supportsEip3009TransferWithAuthorization,
  supportsPermit,
  supportsReceiveWithAuthorization,
}: {
  supportsAuthorizationState: boolean;
  supportsEip3009TransferWithAuthorization: boolean;
  supportsPermit: boolean;
  supportsReceiveWithAuthorization: boolean;
}) {
  if ((supportsEip3009TransferWithAuthorization || supportsReceiveWithAuthorization) && supportsAuthorizationState) {
    return "Design a relayer/authorization flow that consumes a single-use USDC authorization, pays Injective gas through OmnisRouter, calls CCTP forwarding, and saves a receipt.";
  }

  if (supportsPermit) {
    return "Do not proceed directly with permit alone; first solve TokenMessenger msg.sender burn semantics with a relayer contract or account-abstraction design.";
  }

  return "Use account abstraction/paymaster infrastructure or keep the existing server-funded demo mode until a verified user-owned gasless design exists.";
}

function stringifyValue(value: unknown) {
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return String(error || "Unknown contract capability error.");
}

function looksLikeMissingFunction(message: string) {
  const normalized = message.toLowerCase();

  return [
    "function selector was not recognized",
    "function does not exist",
    "function returned no data",
    "contractfunctionzerodataerror",
    "method handler crashed",
  ].some((fragment) => normalized.includes(fragment));
}
