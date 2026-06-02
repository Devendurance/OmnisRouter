import { NextResponse } from "next/server";
import { getAddress, isAddress, type Hex } from "viem";
import {
  INJECTIVE_TESTNET_EVM_CHAIN_ID,
  INJECTIVE_TESTNET_USDC,
  getRelayerAddressFromEnv,
  recoverTransferWithAuthorizationSigner,
  transferWithAuthorizationTypes,
  type TransferWithAuthorizationTypedData,
} from "../../../../../../lib/server/cctp/injective-to-solana-auth";

const MAX_AUTH_VALIDITY_SECONDS = BigInt(10 * 60 + 30);

type VerifyAuthorizationRequestBody = {
  typedData?: unknown;
  signature?: unknown;
  sourceEvmAddress?: unknown;
};

export async function POST(request: Request) {
  try {
    const body = await request.json() as VerifyAuthorizationRequestBody;
    const sourceEvmAddress = parseSourceAddress(body.sourceEvmAddress);
    const signature = parseSignature(body.signature);
    const typedData = parseTypedData(body.typedData);
    const now = BigInt(Math.floor(Date.now() / 1000));
    const validAfter = BigInt(typedData.message.validAfter);
    const validBefore = BigInt(typedData.message.validBefore);

    if (typedData.message.from !== sourceEvmAddress) {
      return NextResponse.json({ ok: false, error: "typedData.message.from must match sourceEvmAddress." }, { status: 400 });
    }

    if (typedData.message.to !== getRelayerAddressFromEnv()) {
      return NextResponse.json({ ok: false, error: "typedData.message.to must match the configured OmnisRouter relayer address." }, { status: 400 });
    }

    if (validAfter > now) {
      return NextResponse.json({ ok: false, error: "Authorization is not valid yet." }, { status: 400 });
    }

    if (validBefore <= now) {
      return NextResponse.json({ ok: false, error: "Authorization has expired." }, { status: 400 });
    }

    if (validBefore - validAfter > MAX_AUTH_VALIDITY_SECONDS) {
      return NextResponse.json({ ok: false, error: "Authorization validity window is too long." }, { status: 400 });
    }

    const recoveredSigner = await recoverTransferWithAuthorizationSigner(typedData, signature);
    const authorizationValid = getAddress(recoveredSigner) === sourceEvmAddress;

    if (!authorizationValid) {
      return NextResponse.json({
        ok: false,
        recoveredSigner,
        sourceEvmAddress,
        authorizationValid: false,
        error: "Recovered signer does not match sourceEvmAddress.",
      }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      recoveredSigner,
      sourceEvmAddress,
      authorizationValid: true,
      message: "Authorization signature verified. No transaction sent.",
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Unable to verify authorization signature.",
    }, { status: 400 });
  }
}

function parseSourceAddress(value: unknown) {
  if (typeof value !== "string" || !isAddress(value.trim())) {
    throw new Error("sourceEvmAddress must be a valid EVM address.");
  }

  return getAddress(value.trim());
}

function parseSignature(value: unknown): Hex {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{130}$/.test(value.trim())) {
    throw new Error("signature must be a 65-byte hex signature.");
  }

  return value.trim() as Hex;
}

function parseTypedData(value: unknown): TransferWithAuthorizationTypedData {
  if (!value || typeof value !== "object") {
    throw new Error("typedData is required.");
  }

  const record = value as Record<string, unknown>;
  const domain = record.domain as Record<string, unknown> | undefined;
  const message = record.message as Record<string, unknown> | undefined;

  if (!domain || typeof domain !== "object" || !message || typeof message !== "object") {
    throw new Error("typedData must include domain and message.");
  }

  if (domain.name !== "USD Coin" || domain.version !== "2") {
    throw new Error("typedData domain must match Injective testnet USDC EIP-3009 domain.");
  }

  if (Number(domain.chainId) !== INJECTIVE_TESTNET_EVM_CHAIN_ID || domain.verifyingContract !== INJECTIVE_TESTNET_USDC) {
    throw new Error("typedData domain chainId or verifyingContract mismatch.");
  }

  const from = parseSourceAddress(message.from);
  const to = parseSourceAddress(message.to);
  const valueString = parseUintString(message.value, "typedData.message.value");
  const validAfter = parseUintString(message.validAfter, "typedData.message.validAfter");
  const validBefore = parseUintString(message.validBefore, "typedData.message.validBefore");
  const nonce = parseBytes32(message.nonce);

  if (BigInt(validBefore) <= BigInt(validAfter)) {
    throw new Error("typedData.message.validBefore must be greater than validAfter.");
  }

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
      value: valueString,
      validAfter,
      validBefore,
      nonce,
    },
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
