import { NextResponse } from "next/server";
import { getAddress, isAddress, type Hex } from "viem";
import {
  getRelayerAddressFromEnv,
  hashTransferWithAuthorizationTypedData,
  parseTransferWithAuthorizationTypedData,
  readUsdcDomainDebug,
  recoverTransferWithAuthorizationSigner,
} from "../../../../../../lib/server/cctp/injective-to-solana-auth";

const MAX_AUTH_VALIDITY_SECONDS = BigInt(10 * 60 + 30);

type VerifyAuthorizationRequestBody = {
  typedData?: unknown;
  signature?: unknown;
  sourceEvmAddress?: unknown;
  activeEvmAddress?: unknown;
  preparedTypedDataHash?: unknown;
};

export async function POST(request: Request) {
  try {
    const body = await request.json() as VerifyAuthorizationRequestBody;
    const sourceEvmAddress = parseSourceAddress(body.sourceEvmAddress);
    const activeEvmAddress = typeof body.activeEvmAddress === "string" && isAddress(body.activeEvmAddress.trim())
      ? getAddress(body.activeEvmAddress.trim())
      : undefined;
    const signature = parseSignature(body.signature);
    const typedData = parseTransferWithAuthorizationTypedData(body.typedData);
    const verifyTypedDataHash = hashTransferWithAuthorizationTypedData(typedData);
    const preparedTypedDataHash = typeof body.preparedTypedDataHash === "string" ? body.preparedTypedDataHash : verifyTypedDataHash;
    const hashesMatch = preparedTypedDataHash.toLowerCase() === verifyTypedDataHash.toLowerCase();
    const domainDebug = await readUsdcDomainDebug();
    const now = BigInt(Math.floor(Date.now() / 1000));
    const validAfter = BigInt(typedData.message.validAfter);
    const validBefore = BigInt(typedData.message.validBefore);

    if (typedData.domain.name !== domainDebug.contractName || !domainDebug.domainSeparatorMatches) {
      return NextResponse.json({
        ok: false,
        error: "typedData.domain does not match the Injective testnet USDC EIP-712 domain.",
        domainDebug: {
          typedDataDomain: typedData.domain,
          contractName: domainDebug.contractName,
          contractDomainSeparator: domainDebug.contractDomainSeparator,
          locallyComputedDomainSeparator: domainDebug.locallyComputedDomainSeparator,
          domainSeparatorMatches: domainDebug.domainSeparatorMatches,
          localDomainSeparatorError: domainDebug.localDomainSeparatorError,
        },
        preparedTypedDataHash,
        verifyTypedDataHash,
        hashesMatch,
      }, { status: 400 });
    }

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
        error: "Recovered signer does not match sourceEvmAddress",
        sourceEvmAddress,
        recoveredSigner,
        activeEvmAddress,
        addressesMatch: false,
        authorizationValid: false,
        preparedTypedDataHash,
        verifyTypedDataHash,
        hashesMatch,
        signatureLength: signature.length,
        signatureStartsWith0x: signature.startsWith("0x"),
        typedDataDomain: typedData.domain,
        typedDataPrimaryType: typedData.primaryType,
        typedDataMessage: typedData.message,
      }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      recoveredSigner,
      sourceEvmAddress,
      activeEvmAddress,
      addressesMatch: true,
      authorizationValid: true,
      preparedTypedDataHash,
      verifyTypedDataHash,
      hashesMatch,
      signatureLength: signature.length,
      signatureStartsWith0x: signature.startsWith("0x"),
      typedDataDomain: typedData.domain,
      typedDataPrimaryType: typedData.primaryType,
      typedDataMessage: typedData.message,
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
