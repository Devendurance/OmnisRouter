import "server-only";

import { randomBytes } from "node:crypto";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import {
  createPublicClient,
  defineChain,
  getAddress,
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
export const SOLANA_DEVNET_USDC_MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
export const USDC_DECIMALS = 6;

const transferWithAuthorizationRecoveryTypes = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const satisfies TypedData;

export const transferWithAuthorizationTypes = {
  EIP712Domain: [
    { name: "name", type: "string" },
    { name: "version", type: "string" },
    { name: "chainId", type: "uint256" },
    { name: "verifyingContract", type: "address" },
  ],
  ...transferWithAuthorizationRecoveryTypes,
} as const;

export type TransferWithAuthorizationTypedData = {
  domain: {
    name: "USD Coin";
    version: "2";
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
      name: "USD Coin",
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

export async function recoverTransferWithAuthorizationSigner(typedData: TransferWithAuthorizationTypedData, signature: Hex) {
  return recoverTypedDataAddress({
    domain: typedData.domain,
    types: transferWithAuthorizationRecoveryTypes,
    primaryType: typedData.primaryType,
    message: {
      ...typedData.message,
      value: BigInt(typedData.message.value),
      validAfter: BigInt(typedData.message.validAfter),
      validBefore: BigInt(typedData.message.validBefore),
    },
    signature,
  });
}
