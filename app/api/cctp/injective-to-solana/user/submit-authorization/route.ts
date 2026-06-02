import { NextResponse } from "next/server";
import {
  createPublicClient,
  createWalletClient,
  getAddress,
  http,
  isAddress,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  INJECTIVE_TESTNET_EVM_RPC_URL,
  INJECTIVE_TESTNET_USDC,
  getRelayerAddressFromEnv,
  injectiveTestnetEvm,
  parseTransferWithAuthorizationTypedData,
  parsePositiveUsdcAmount,
  parseSolanaAddress,
  readInjectivePrivateKeyFromEnv,
  readInjectiveUsdcBalance,
  readUsdcDomainDebug,
  recoverTransferWithAuthorizationSigner,
  splitSignature,
  usdcTransferWithAuthorizationAbi,
} from "../../../../../../lib/server/cctp/injective-to-solana-auth";

const MAX_AUTH_VALIDITY_SECONDS = BigInt(10 * 60 + 30);

type SubmitAuthorizationRequestBody = {
  typedData?: unknown;
  signature?: unknown;
  amountUsdc?: unknown;
  sourceEvmAddress?: unknown;
  solanaRecipientAddress?: unknown;
};

export async function POST(request: Request) {
  try {
    const body = await request.json() as SubmitAuthorizationRequestBody;
    const sourceEvmAddress = parseSourceAddress(body.sourceEvmAddress);
    const signature = parseSignature(body.signature);
    const typedData = parseTransferWithAuthorizationTypedData(body.typedData);
    const { amount, amountUsdc } = parsePositiveUsdcAmount(body.amountUsdc);
    parseSolanaAddress(body.solanaRecipientAddress);
    const relayerAddress = getRelayerAddressFromEnv();
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
      }, { status: 400 });
    }

    if (typedData.message.from !== sourceEvmAddress) {
      return NextResponse.json({ ok: false, error: "typedData.message.from must match sourceEvmAddress." }, { status: 400 });
    }

    if (typedData.message.to !== relayerAddress) {
      return NextResponse.json({ ok: false, error: "typedData.message.to must match the configured OmnisRouter relayer address." }, { status: 400 });
    }

    if (BigInt(typedData.message.value) !== amount) {
      return NextResponse.json({ ok: false, error: "typedData.message.value must match amountUsdc." }, { status: 400 });
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

    if (getAddress(recoveredSigner) !== sourceEvmAddress) {
      return NextResponse.json({ ok: false, error: "Recovered signer does not match sourceEvmAddress." }, { status: 400 });
    }

    const publicClient = createPublicClient({
      chain: injectiveTestnetEvm,
      transport: http(INJECTIVE_TESTNET_EVM_RPC_URL),
    });

    const authorizationNonce = typedData.message.nonce;
    const alreadyUsed = await publicClient.readContract({
      address: INJECTIVE_TESTNET_USDC,
      abi: usdcTransferWithAuthorizationAbi,
      functionName: "authorizationState",
      args: [sourceEvmAddress, authorizationNonce],
    });

    if (alreadyUsed) {
      return NextResponse.json({
        ok: false,
        error: "Authorization nonce has already been used or canceled.",
        recoverable: false,
      }, { status: 400 });
    }

    const sourceUsdcBalance = await readInjectiveUsdcBalance(sourceEvmAddress);

    if (sourceUsdcBalance < amount) {
      return NextResponse.json({
        ok: false,
        error: "Source EVM wallet has insufficient USDC balance.",
        sourceUsdcBalance: sourceUsdcBalance.toString(),
        requiredAmount: amount.toString(),
      }, { status: 400 });
    }

    const relayerPrivateKey = readInjectivePrivateKeyFromEnv();
    const relayerAccount = privateKeyToAccount(relayerPrivateKey);

    const walletClient = createWalletClient({
      account: relayerAccount,
      chain: injectiveTestnetEvm,
      transport: http(INJECTIVE_TESTNET_EVM_RPC_URL),
    });

    const { r, s, v } = splitSignature(signature);
    const nonce = typedData.message.nonce;

    let authorizationTxHash: Hex;

    try {
      await publicClient.simulateContract({
        address: INJECTIVE_TESTNET_USDC,
        abi: usdcTransferWithAuthorizationAbi,
        functionName: "transferWithAuthorization",
        args: [
          sourceEvmAddress,
          relayerAddress,
          amount,
          validAfter,
          validBefore,
          nonce,
          v,
          r,
          s,
        ],
        account: relayerAccount.address,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Simulation failed.";
      console.error("EIP-3009 transferWithAuthorization simulation failed:", message);

      return NextResponse.json({
        ok: false,
        simulationFailed: true,
        error: `On-chain simulation rejected: ${message}`,
        details: {
          from: sourceEvmAddress,
          to: relayerAddress,
          amount: amount.toString(),
          nonce,
          v,
          r,
          s,
        },
      }, { status: 400 });
    }

    try {
      authorizationTxHash = await walletClient.writeContract({
        address: INJECTIVE_TESTNET_USDC,
        abi: usdcTransferWithAuthorizationAbi,
        functionName: "transferWithAuthorization",
        args: [
          sourceEvmAddress,
          relayerAddress,
          amount,
          validAfter,
          validBefore,
          nonce,
          v,
          r,
          s,
        ],
        account: relayerAccount,
        chain: injectiveTestnetEvm,
      });
    } catch (error) {
      console.error("EIP-3009 transferWithAuthorization failed:", error);
      return NextResponse.json({
        ok: false,
        error: error instanceof Error ? error.message : "Unable to submit transferWithAuthorization transaction.",
      }, { status: 500 });
    }

    let authorizationReceipt: Awaited<ReturnType<typeof publicClient.waitForTransactionReceipt>>;

    try {
      authorizationReceipt = await publicClient.waitForTransactionReceipt({ hash: authorizationTxHash });
    } catch (error) {
      return NextResponse.json({
        ok: false,
        authorizationTxHash,
        error: error instanceof Error ? error.message : "Authorization submitted but receipt waiting failed.",
      }, { status: 500 });
    }

    if (authorizationReceipt.status !== "success") {
      return NextResponse.json({
        ok: false,
        authorizationTxHash,
        error: "transferWithAuthorization transaction failed.",
      }, { status: 500 });
    }

    const authorizationConsumed = await publicClient.readContract({
      address: INJECTIVE_TESTNET_USDC,
      abi: usdcTransferWithAuthorizationAbi,
      functionName: "authorizationState",
      args: [sourceEvmAddress, authorizationNonce],
    });

    const toJsonSafe = (value: unknown) => JSON.parse(JSON.stringify(value, (_key, currentValue) => (
      typeof currentValue === "bigint" ? currentValue.toString() : currentValue
    )));

    return NextResponse.json(toJsonSafe({
      ok: true,
      route: "injective-to-solana",
      executionMode: "user-authorized-server-sponsored",
      phase: "authorization-submitted",
      authorizationTxHash,
      sourceEvmAddress,
      relayerAddress,
      amountUsdc,
      authorizationConsumed: authorizationConsumed === true,
      gasPaidBy: "OmnisRouter",
      message: "Authorization submitted. USDC moved to OmnisRouter relayer. CCTP burn not attempted in this phase.",
    }));
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Unable to submit authorization.",
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
