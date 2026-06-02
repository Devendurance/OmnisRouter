import "server-only";

import { randomBytes } from "node:crypto";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import {
  createPublicClient,
  defineChain,
  getAddress,
  hashDomain,
  hashTypedData,
  http,
  isAddress,
  parseUnits,
  recoverTypedDataAddress,
  type Address,
  type Hex,
  type TypedData,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

export const INJECTIVE_TESTNET_EVM_RPC_URL = "https://k8s.testnet.json-rpc.injective.network/";
export const INJECTIVE_TESTNET_EVM_CHAIN_ID = 1439;
export const INJECTIVE_TESTNET_USDC = "0x0C382e685bbeeFE5d3d9C29e29E341fEE8E84C5d" as const;
export const INJECTIVE_TESTNET_USDC_EIP712_NAME = "USDC";
export const SOLANA_DEVNET_USDC_MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
export const USDC_DECIMALS = 6;

export const eip712DomainFields = [
  { name: "name", type: "string" },
  { name: "version", type: "string" },
  { name: "chainId", type: "uint256" },
  { name: "verifyingContract", type: "address" },
] as const;

export const transferWithAuthorizationTypes = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const satisfies TypedData;

export type TransferWithAuthorizationTypedData = {
  domain: {
    name: string;
    version: string;
    chainId: typeof INJECTIVE_TESTNET_EVM_CHAIN_ID;
    verifyingContract: typeof INJECTIVE_TESTNET_USDC;
  };
  types: typeof transferWithAuthorizationTypes;
  primaryType: "TransferWithAuthorization";
  message: {
    from: Address;
    to: Address;
    value: string;
    validAfter: string;
    validBefore: string;
    nonce: Hex;
  };
};

export const injectiveTestnetEvm = defineChain({
  id: INJECTIVE_TESTNET_EVM_CHAIN_ID,
  name: "Injective EVM Testnet",
  nativeCurrency: { name: "Injective", symbol: "INJ", decimals: 18 },
  rpcUrls: {
    default: { http: [INJECTIVE_TESTNET_EVM_RPC_URL] },
  },
});

const erc20BalanceAbi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

const usdcMetadataAbi = [
  {
    type: "function",
    name: "name",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
  {
    type: "function",
    name: "version",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
  {
    type: "function",
    name: "DOMAIN_SEPARATOR",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bytes32" }],
  },
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
] as const;

export type UsdcDomainDebug = {
  contractName: string;
  contractVersion: "2";
  contractSymbol: string;
  contractDecimals: number;
  contractDomainSeparator?: Hex;
  locallyComputedDomainSeparator?: Hex;
  domainSeparatorMatches: boolean;
  localDomainSeparatorError?: string;
  typedDataDomain: {
    name: string;
    version: "2";
    chainId: number;
    verifyingContract: typeof INJECTIVE_TESTNET_USDC;
  };
};

export async function readUsdcDomainDebug(): Promise<UsdcDomainDebug> {
  const publicClient = createInjectiveAuthPublicClient();
  const [contractName, contractSymbol, contractDecimalsRaw, contractDomainSeparator] = await Promise.all([
    publicClient.readContract({ address: INJECTIVE_TESTNET_USDC, abi: usdcMetadataAbi, functionName: "name" }),
    publicClient.readContract({ address: INJECTIVE_TESTNET_USDC, abi: usdcMetadataAbi, functionName: "symbol" }),
    publicClient.readContract({ address: INJECTIVE_TESTNET_USDC, abi: usdcMetadataAbi, functionName: "decimals" }),
    publicClient.readContract({ address: INJECTIVE_TESTNET_USDC, abi: usdcMetadataAbi, functionName: "DOMAIN_SEPARATOR" }),
  ]);

  const typedDataDomain = {
    name: contractName as string,
    version: "2" as const,
    chainId: INJECTIVE_TESTNET_EVM_CHAIN_ID,
    verifyingContract: INJECTIVE_TESTNET_USDC,
  };

  let locallyComputedDomainSeparator: Hex | undefined;
  let localDomainSeparatorError: string | undefined;

  try {
    locallyComputedDomainSeparator = hashDomain({
      domain: {
        ...typedDataDomain,
        chainId: BigInt(INJECTIVE_TESTNET_EVM_CHAIN_ID),
      },
      types: { EIP712Domain: eip712DomainFields },
    });
  } catch (error) {
    localDomainSeparatorError = error instanceof Error ? error.message : "Unable to compute local EIP-712 domain separator.";
  }

  return {
    contractName: contractName as string,
    contractVersion: "2",
    contractSymbol: contractSymbol as string,
    contractDecimals: Number(contractDecimalsRaw),
    contractDomainSeparator: contractDomainSeparator as Hex,
    locallyComputedDomainSeparator,
    domainSeparatorMatches: Boolean(
      locallyComputedDomainSeparator &&
      (contractDomainSeparator as string).toLowerCase() === locallyComputedDomainSeparator.toLowerCase(),
    ),
    localDomainSeparatorError,
    typedDataDomain,
  };
}

export function createInjectiveAuthPublicClient() {
  return createPublicClient({
    chain: injectiveTestnetEvm,
    transport: http(INJECTIVE_TESTNET_EVM_RPC_URL),
  });
}

export function parsePositiveUsdcAmount(amountUsdc: unknown) {
  if (typeof amountUsdc !== "string" || !amountUsdc.trim()) {
    throw new Error("amountUsdc is required.");
  }

  const normalized = amountUsdc.trim();

  if (!/^\d+(\.\d{1,6})?$/.test(normalized)) {
    throw new Error("amountUsdc must be a positive USDC amount with up to 6 decimals.");
  }

  const amount = parseUnits(normalized, USDC_DECIMALS);

  if (amount <= BigInt(0)) {
    throw new Error("amountUsdc must be greater than 0.");
  }

  return { amount, amountUsdc: normalized };
}

export function parseEvmAddress(value: unknown, name: string): Address {
  if (typeof value !== "string" || !value.trim() || !isAddress(value.trim())) {
    throw new Error(`${name} must be a valid EVM address.`);
  }

  return getAddress(value.trim());
}

export function parseSolanaAddress(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("solanaRecipientAddress is required.");
  }

  const publicKey = new PublicKey(value.trim());

  if (publicKey.toBase58() !== value.trim()) {
    throw new Error("solanaRecipientAddress must be a valid Solana public key.");
  }

  return publicKey;
}

export function getSolanaUsdcAta(solanaWalletAddress: string) {
  return getAssociatedTokenAddressSync(
    new PublicKey(SOLANA_DEVNET_USDC_MINT),
    new PublicKey(solanaWalletAddress),
    true,
  ).toBase58();
}

export function getRelayerAddressFromEnv() {
  const privateKey = process.env.INJECTIVE_EVM_PRIVATE_KEY;

  if (!privateKey) {
    throw new Error("Missing required environment variable: INJECTIVE_EVM_PRIVATE_KEY.");
  }

  const normalized = privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`;

  if (!/^0x[0-9a-fA-F]{64}$/.test(normalized)) {
    throw new Error("INJECTIVE_EVM_PRIVATE_KEY must be a 32-byte hex private key.");
  }

  return privateKeyToAccount(normalized as Hex).address;
}

export async function readInjectiveUsdcBalance(address: Address) {
  return createInjectiveAuthPublicClient().readContract({
    address: INJECTIVE_TESTNET_USDC,
    abi: erc20BalanceAbi,
    functionName: "balanceOf",
    args: [address],
  });
}

export function buildTransferWithAuthorizationTypedData({
  from,
  to,
  value,
  validAfter,
  validBefore,
  nonce,
}: {
  from: Address;
  to: Address;
  value: bigint;
  validAfter: bigint;
  validBefore: bigint;
  nonce?: Hex;
}): TransferWithAuthorizationTypedData {
  return {
    domain: {
      name: INJECTIVE_TESTNET_USDC_EIP712_NAME,
      version: "2",
      chainId: INJECTIVE_TESTNET_EVM_CHAIN_ID,
      verifyingContract: INJECTIVE_TESTNET_USDC,
    },
    types: transferWithAuthorizationTypes,
    primaryType: "TransferWithAuthorization",
    message: {
      from,
      to,
      value: value.toString(),
      validAfter: validAfter.toString(),
      validBefore: validBefore.toString(),
      nonce: nonce ?? `0x${randomBytes(32).toString("hex")}`,
    },
  };
}

export function parseTransferWithAuthorizationTypedData(value: unknown): TransferWithAuthorizationTypedData {
  if (!value || typeof value !== "object") {
    throw new Error("typedData is required.");
  }

  const record = value as Record<string, unknown>;
  const domain = record.domain as Record<string, unknown> | undefined;
  const message = record.message as Record<string, unknown> | undefined;

  if (!domain || typeof domain !== "object" || !message || typeof message !== "object") {
    throw new Error("typedData must include domain and message.");
  }

  if (typeof domain.name !== "string" || domain.version !== "2") {
    throw new Error("typedData domain must include the Injective USDC name and version 2.");
  }

  if (domain.name !== INJECTIVE_TESTNET_USDC_EIP712_NAME) {
    throw new Error("typedData domain name mismatch.");
  }

  if (Number(domain.chainId) !== INJECTIVE_TESTNET_EVM_CHAIN_ID) {
    throw new Error("typedData domain chainId mismatch.");
  }

  if (typeof domain.verifyingContract !== "string" || getAddress(domain.verifyingContract) !== INJECTIVE_TESTNET_USDC) {
    throw new Error("typedData domain verifyingContract mismatch.");
  }

  const rawValue = parseUintString(message.value, "typedData.message.value");
  const rawValidAfter = parseUintString(message.validAfter, "typedData.message.validAfter");
  const rawValidBefore = parseUintString(message.validBefore, "typedData.message.validBefore");

  if (BigInt(rawValidBefore) <= BigInt(rawValidAfter)) {
    throw new Error("typedData.message.validBefore must be greater than validAfter.");
  }

  return buildTransferWithAuthorizationTypedData({
    from: parseEvmAddress(message.from, "typedData.message.from"),
    to: parseEvmAddress(message.to, "typedData.message.to"),
    value: BigInt(rawValue),
    validAfter: BigInt(rawValidAfter),
    validBefore: BigInt(rawValidBefore),
    nonce: parseBytes32(message.nonce),
  });
}

export function hashTransferWithAuthorizationTypedData(typedData: TransferWithAuthorizationTypedData) {
  return hashTypedData({
    domain: typedData.domain,
    types: transferWithAuthorizationTypes,
    primaryType: typedData.primaryType,
    message: typedDataMessageForViem(typedData),
  });
}

export async function recoverTransferWithAuthorizationSigner(typedData: TransferWithAuthorizationTypedData, signature: Hex) {
  return recoverTypedDataAddress({
    domain: typedData.domain,
    types: transferWithAuthorizationTypes,
    primaryType: typedData.primaryType,
    message: typedDataMessageForViem(typedData),
    signature,
  });
}

function typedDataMessageForViem(typedData: TransferWithAuthorizationTypedData) {
  return {
    ...typedData.message,
    value: BigInt(typedData.message.value),
    validAfter: BigInt(typedData.message.validAfter),
    validBefore: BigInt(typedData.message.validBefore),
  };
}

function parseUintString(value: unknown, name: string) {
  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    throw new Error(`${name} must be a uint string.`);
  }

  return value;
}

function parseBytes32(value: unknown): Hex {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error("typedData.message.nonce must be bytes32.");
  }

  return value as Hex;
}

export function readInjectivePrivateKeyFromEnv() {
  const privateKey = process.env.INJECTIVE_EVM_PRIVATE_KEY;

  if (!privateKey) {
    throw new Error("Missing required environment variable: INJECTIVE_EVM_PRIVATE_KEY.");
  }

  const normalized = privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`;

  if (!/^0x[0-9a-fA-F]{64}$/.test(normalized)) {
    throw new Error("INJECTIVE_EVM_PRIVATE_KEY must be a 32-byte hex private key.");
  }

  return normalized as Hex;
}

export function splitSignature(signature: Hex) {
  const hex = signature.startsWith("0x") ? signature.slice(2) : signature;

  const r = `0x${hex.slice(0, 64)}`;
  const s = `0x${hex.slice(64, 128)}`;
  let v = parseInt(hex.slice(128, 130), 16);

  if (v === 0 || v === 1) {
    v += 27;
  }

  if (v < 27) {
    v += 27;
  }

  return { r: r as Hex, s: s as Hex, v };
}

export const usdcTransferWithAuthorizationAbi = [
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
    name: "authorizationState",
    stateMutability: "view",
    inputs: [
      { name: "authorizer", type: "address" },
      { name: "nonce", type: "bytes32" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;
