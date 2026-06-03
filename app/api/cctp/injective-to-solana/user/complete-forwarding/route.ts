import { PublicKey } from "@solana/web3.js";
import { NextResponse } from "next/server";
import {
  encodeFunctionData,
  formatUnits,
  getAddress,
  http,
  isAddress,
  parseUnits,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  injectiveTestnetEvm,
  INJECTIVE_TESTNET_EVM_RPC_URL,
  getRelayerAddressFromEnv,
  readInjectiveUsdcBalance,
  readInjectivePrivateKeyFromEnv,
  usdcTransferWithAuthorizationAbi,
} from "../../../../../../lib/server/cctp/injective-to-solana-auth";
import {
  buildForwardHookDataWithAtaCreation,
  CCTP_DOMAINS,
  encodeSolanaAtaAsBytes32,
  erc20Abi,
  getForwardingFeeEstimate,
  hasForwardingMaxFee,
  INJECTIVE_TESTNET_CCTP,
  MIN_FINALITY_THRESHOLD,
  tokenMessengerV2Abi,
  ZERO_BYTES32,
} from "../../../../../../lib/server/cctp/injective-to-solana";
import { createPublicClient, createWalletClient } from "viem";
import { persistUserOwnedForwardingReceiptBestEffort } from "../../../../../../lib/server/omnis-receipts";

const USDC_DECIMALS = 6;

type CompleteForwardingRequestBody = {
  authorizationTxHash?: unknown;
  sourceEvmAddress?: unknown;
  amountUsdc?: unknown;
  solanaRecipientAddress?: unknown;
  solanaRecipientAta?: unknown;
  authorization?: {
    from?: unknown;
    to?: unknown;
    value?: unknown;
    validAfter?: unknown;
    validBefore?: unknown;
    nonce?: unknown;
  };
};

type ForwardingStage =
  | "validation"
  | "fee-estimation"
  | "approval-transaction"
  | "approval-receipt"
  | "burn-transaction"
  | "burn-receipt";

export async function POST(request: Request) {
  let stage: ForwardingStage = "validation";

  try {
    const body = await request.json() as CompleteForwardingRequestBody;

    const authorizationTxHash = parseTxHash(body.authorizationTxHash, "authorizationTxHash");
    const sourceEvmAddress = parseEvmAddress(body.sourceEvmAddress, "sourceEvmAddress");
    const { amount, amountUsdc } = parseUsdcAmount(body.amountUsdc);
    const solanaRecipientAddress = parseSolanaAddress(body.solanaRecipientAddress);
    const solanaRecipientAta = parseSolanaAta(body.solanaRecipientAta);
    const authorization = parseAuthorization(body.authorization);
    const relayerAddress = getRelayerAddressFromEnv();
    const relayerPrivateKey = readInjectivePrivateKeyFromEnv();
    const relayerAccount = privateKeyToAccount(relayerPrivateKey);

    if (authorization.to !== relayerAddress) {
      return NextResponse.json({
        ok: false,
        error: "Authorization.to must equal the OmnisRouter relayer address.",
        authorizationTo: authorization.to,
        relayerAddress,
      }, { status: 400 });
    }

    const publicClient = createPublicClient({
      chain: injectiveTestnetEvm,
      transport: http(INJECTIVE_TESTNET_EVM_RPC_URL),
    });

    const authorizationConsumed = await publicClient.readContract({
      address: INJECTIVE_TESTNET_CCTP.USDC,
      abi: usdcTransferWithAuthorizationAbi,
      functionName: "authorizationState",
      args: [sourceEvmAddress, authorization.nonce],
    });

    if (!authorizationConsumed) {
      return NextResponse.json({
        ok: false,
        error: "Authorization nonce has not been consumed yet. Complete Phase 2A submission first.",
        authorizationNonce: authorization.nonce,
        sourceEvmAddress,
      }, { status: 400 });
    }

    const relayerBalance = await readInjectiveUsdcBalance(relayerAddress);

    if (relayerBalance < amount) {
      return NextResponse.json({
        ok: false,
        error: "OmnisRouter relayer has insufficient USDC after authorization. Wait for Phase 2A confirmation.",
        relayerBalance: formatUnits(relayerBalance, USDC_DECIMALS),
        requiredAmount: formatUnits(amount, USDC_DECIMALS),
      }, { status: 400 });
    }

    stage = "fee-estimation";

    const feeEstimate = await getForwardingFeeEstimate({ includeRecipientSetup: true });
    let maxFeeValue: string | undefined = hasForwardingMaxFee(feeEstimate) ? feeEstimate.maxFee : undefined;

    if (!maxFeeValue) {
      const manualFeeUsdc = process.env.CCTP_MAX_FEE_USDC?.trim();

      if (manualFeeUsdc) {
        const manualFeeBaseUnits = parseUnits(manualFeeUsdc, USDC_DECIMALS);

        if (manualFeeBaseUnits <= BigInt(0)) {
          return NextResponse.json({
            ok: false,
            error: "CCTP_MAX_FEE_USDC is set but invalid.",
          }, { status: 500 });
        }

        maxFeeValue = manualFeeBaseUnits.toString();
      }
    }

    if (!maxFeeValue) {
      return NextResponse.json({
        ok: false,
        error: "Circle fee estimate unavailable. Set CCTP_MAX_FEE_USDC.",
      }, { status: 502 });
    }

    const maxFee = BigInt(maxFeeValue);

    if (amount <= maxFee) {
      return NextResponse.json({
        ok: false,
        error: "Requested amount is too small relative to the forwarding fee.",
      }, { status: 400 });
    }

    const mintRecipient = encodeSolanaAtaAsBytes32(solanaRecipientAddress) as Hex;
    const hookData = buildForwardHookDataWithAtaCreation(solanaRecipientAddress) as Hex;
    const effectiveAta = solanaRecipientAta || "";

    stage = "approval-transaction";

    const currentAllowance = await publicClient.readContract({
      address: INJECTIVE_TESTNET_CCTP.USDC,
      abi: erc20Abi,
      functionName: "allowance",
      args: [relayerAddress, INJECTIVE_TESTNET_CCTP.TokenMessengerV2],
    });

    let approvalTxHash: Hex | null = null;

    if (currentAllowance < amount) {
      const approveCalldata = encodeFunctionData({
        abi: erc20Abi,
        functionName: "approve",
        args: [INJECTIVE_TESTNET_CCTP.TokenMessengerV2, amount],
      });

      const walletClient = createWalletClient({
        account: relayerAccount,
        chain: injectiveTestnetEvm,
        transport: http(INJECTIVE_TESTNET_EVM_RPC_URL),
      });

      try {
        approvalTxHash = await walletClient.sendTransaction({
          account: relayerAccount,
          to: INJECTIVE_TESTNET_CCTP.USDC,
          data: approveCalldata,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Approval transaction failed.";

        return NextResponse.json({
          ok: false,
          stage: "approval-transaction",
          error: message,
        }, { status: 500 });
      }

      stage = "approval-receipt";

      try {
        const approvalReceipt = await publicClient.waitForTransactionReceipt({ hash: approvalTxHash });

        if (approvalReceipt.status !== "success") {
          return NextResponse.json({
            ok: false,
            stage: "approval-receipt",
            approvalTxHash,
            error: "USDC approval transaction failed. Burn not attempted.",
          }, { status: 500 });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Approval receipt waiting failed.";

        return NextResponse.json({
          ok: false,
          stage: "approval-receipt",
          approvalTxHash,
          error: message,
        }, { status: 500 });
      }
    }

    stage = "burn-transaction";

    const burnCalldata = encodeFunctionData({
      abi: tokenMessengerV2Abi,
      functionName: "depositForBurnWithHook",
      args: [
        amount,
        CCTP_DOMAINS.Solana,
        mintRecipient,
        INJECTIVE_TESTNET_CCTP.USDC,
        ZERO_BYTES32,
        maxFee,
        MIN_FINALITY_THRESHOLD,
        hookData,
      ],
    });

    let burnTxHash: Hex;

    {
      const walletClient = createWalletClient({
        account: relayerAccount,
        chain: injectiveTestnetEvm,
        transport: http(INJECTIVE_TESTNET_EVM_RPC_URL),
      });

      try {
        burnTxHash = await walletClient.sendTransaction({
          account: relayerAccount,
          to: INJECTIVE_TESTNET_CCTP.TokenMessengerV2,
          data: burnCalldata,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Burn transaction failed.";

        return NextResponse.json({
          ok: false,
          stage: "burn-transaction",
          approvalTxHash,
          error: message,
        }, { status: 500 });
      }
    }

    stage = "burn-receipt";
    let receiptId: string | null = null;

    try {
      const burnReceipt = await publicClient.waitForTransactionReceipt({ hash: burnTxHash });

      if (burnReceipt.status !== "success") {
        return NextResponse.json({
          ok: false,
          stage: "burn-receipt",
          approvalTxHash,
          burnTxHash,
          error: "depositForBurnWithHook transaction failed.",
        }, { status: 500 });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Burn receipt waiting failed.";

      return NextResponse.json({
        ok: false,
        stage: "burn-receipt",
        approvalTxHash,
        burnTxHash,
        error: message,
      }, { status: 500 });
    }

    receiptId = await persistUserOwnedForwardingReceiptBestEffort({
      amountUsdc,
      approvalTxHash,
      authorizationTxHash,
      burnTxHash,
      relayerAddress,
      solanaRecipientAddress,
      solanaRecipientAta: effectiveAta || "",
      sourceEvmAddress,
    });

    return NextResponse.json(toJsonSafe({
      ok: true,
      route: "injective-to-solana",
      executionMode: "user-authorized-server-sponsored",
      phase: "cctp-burn-submitted",
      authorizationTxHash,
      approvalTxHash,
      burnTxHash,
      receiptId,
      sourceEvmAddress,
      relayerAddress,
      amountUsdc,
      solanaRecipientAddress,
      solanaRecipientAta: effectiveAta || undefined,
      gasPaidBy: "OmnisRouter",
      message: "USDC was burned on Injective. Circle Forwarding Service is handling Solana minting.",
    }));
  } catch (error) {
    return NextResponse.json({
      ok: false,
      stage,
      error: error instanceof Error ? error.message : "Unable to complete forwarding.",
    }, { status: 400 });
  }
}

function parseTxHash(value: unknown, name: string): Hex {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error(`${name} must be a valid 0x-prefixed transaction hash.`);
  }

  return value as Hex;
}

function parseEvmAddress(value: unknown, name: string): Address {
  if (typeof value !== "string" || !isAddress(value.trim())) {
    throw new Error(`${name} must be a valid EVM address.`);
  }

  return getAddress(value.trim());
}

function parseUsdcAmount(value: unknown) {
  if (typeof value !== "string" || !/^\d+(\.\d{1,6})?$/.test(value.trim())) {
    throw new Error("amountUsdc must be a positive USDC amount with up to 6 decimals.");
  }

  const amount = parseUnits(value.trim(), USDC_DECIMALS);

  if (amount <= BigInt(0)) {
    throw new Error("amountUsdc must be greater than 0.");
  }

  return { amount, amountUsdc: value.trim() };
}

function parseSolanaAddress(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("solanaRecipientAddress is required.");
  }

  const publicKey = new PublicKey(value.trim());

  if (publicKey.toBase58() !== value.trim()) {
    throw new Error("solanaRecipientAddress must be a valid Solana public key.");
  }

  return publicKey.toBase58();
}

function parseSolanaAta(value: unknown) {
  if (!value || (typeof value === "string" && !value.trim())) {
    return undefined;
  }

  if (typeof value !== "string" || !value.trim()) {
    throw new Error("solanaRecipientAta must be a valid base58 address.");
  }

  try {
    new PublicKey(value.trim());
  } catch {
    throw new Error("solanaRecipientAta must be a valid base58 address.");
  }

  return value.trim();
}

function parseAuthorization(value: unknown) {
  if (!value || typeof value !== "object") {
    throw new Error("authorization is required.");
  }

  const record = value as Record<string, unknown>;
  const from = typeof record.from === "string" ? parseEvmAddress(record.from, "authorization.from") : undefined;
  const to = typeof record.to === "string" ? parseEvmAddress(record.to, "authorization.to") : undefined;
  const authValue = typeof record.value === "string" ? record.value : undefined;
  const validAfter = typeof record.validAfter === "string" ? record.validAfter : undefined;
  const validBefore = typeof record.validBefore === "string" ? record.validBefore : undefined;
  const nonce = typeof record.nonce === "string" && /^0x[0-9a-fA-F]{64}$/.test(record.nonce) ? record.nonce as Hex : undefined;

  if (!from || !to || !authValue || !validAfter || !validBefore || !nonce) {
    throw new Error("authorization must include from, to, value, validAfter, validBefore, and nonce.");
  }

  return { from, to, value: authValue, validAfter, validBefore, nonce };
}

function toJsonSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (_key, currentValue) => (
    typeof currentValue === "bigint" ? currentValue.toString() : currentValue
  ))) as T;
}
