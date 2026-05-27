import { PublicKey } from "@solana/web3.js";
import { NextResponse } from "next/server";
import { formatUnits, parseUnits } from "viem";
import { prepareInjectiveToSolanaCctpTransfer } from "../../../../../lib/server/cctp/injective-to-solana";

const USDC_DECIMALS = 6;

type PreflightRequestBody = {
  amountUsdc?: unknown;
  solanaRecipientAddress?: unknown;
};

// Server-side only CCTP preflight endpoint. It prepares and validates transfer data but performs no transactions.
export async function POST(request: Request) {
  try {
    const body = await request.json() as PreflightRequestBody;
    const validation = validateBody(body);

    if (!validation.ok) {
      return NextResponse.json({ ok: false, error: validation.error }, { status: 400 });
    }

    const preflight = await prepareInjectiveToSolanaCctpTransfer({
      amountUsdc: validation.amountUsdc,
      solanaRecipientAddress: validation.solanaRecipientAddress,
    });

    return NextResponse.json({
      ok: true,
      preflight: {
        sourceChain: "Injective testnet EVM",
        destinationChain: "Solana devnet",
        sourceEvmAddress: preflight.sourceAddress,
        requestedAmount: {
          usdc: preflight.amountUsdc,
          baseUnits: preflight.amount.toString(),
        },
        sourceUsdcBalance: {
          usdc: formatUsdc(preflight.sourceUsdcBalance),
          baseUnits: preflight.sourceUsdcBalance.toString(),
        },
        currentAllowance: {
          usdc: formatUsdc(preflight.currentAllowance),
          baseUnits: preflight.currentAllowance.toString(),
        },
        approvalNeeded: preflight.approvalNeeded,
        nativeInjGasBalance: preflight.nativeGasBalance.balance === null
          ? { inj: null, wei: null, error: preflight.nativeGasBalance.error }
          : {
              inj: formatUnits(preflight.nativeGasBalance.balance, 18),
              wei: preflight.nativeGasBalance.balance.toString(),
              error: null,
            },
        forwardingMaxFee: {
          usdc: formatUsdc(preflight.maxFee),
          baseUnits: preflight.maxFee.toString(),
        },
        estimatedRecipientAmount: {
          usdc: formatUsdc(preflight.estimatedRecipientAmount),
          baseUnits: preflight.estimatedRecipientAmount.toString(),
        },
        solanaRecipientWallet: preflight.solanaRecipientAddress,
        solanaUsdcAta: preflight.solanaUsdcAta,
        mintRecipientBytes32: preflight.mintRecipient,
        approvalToken: preflight.contracts.usdc,
        approvalSpender: preflight.contracts.tokenMessengerV2,
        burnTarget: preflight.contracts.tokenMessengerV2,
        minFinalityThreshold: preflight.contracts.minFinalityThreshold,
        warnings: [
          preflight.forwardingFeeWarning,
          preflight.nativeGasBalance.error ? `Native INJ gas balance unavailable: ${preflight.nativeGasBalance.error}` : undefined,
          ...preflight.safetyErrors,
        ].filter((warning): warning is string => Boolean(warning)),
      },
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Unable to prepare Injective to Solana CCTP preflight.",
    }, { status: 500 });
  }
}

function validateBody(body: PreflightRequestBody) {
  if (typeof body.amountUsdc !== "string" || !body.amountUsdc.trim()) {
    return { ok: false as const, error: "amountUsdc is required." };
  }

  if (typeof body.solanaRecipientAddress !== "string" || !body.solanaRecipientAddress.trim()) {
    return { ok: false as const, error: "solanaRecipientAddress is required." };
  }

  const amountUsdc = body.amountUsdc.trim();

  if (!/^\d+(\.\d{1,6})?$/.test(amountUsdc)) {
    return { ok: false as const, error: "amountUsdc must be a positive USDC amount with up to 6 decimals." };
  }

  if (parseUnits(amountUsdc, USDC_DECIMALS) <= BigInt(0)) {
    return { ok: false as const, error: "amountUsdc must be greater than 0." };
  }

  const solanaRecipientAddress = body.solanaRecipientAddress.trim();

  try {
    const publicKey = new PublicKey(solanaRecipientAddress);

    if (publicKey.toBase58() !== solanaRecipientAddress) {
      return { ok: false as const, error: "solanaRecipientAddress must be a valid Solana public key." };
    }
  } catch {
    return { ok: false as const, error: "solanaRecipientAddress must be a valid Solana public key." };
  }

  return { ok: true as const, amountUsdc, solanaRecipientAddress };
}

function formatUsdc(value: bigint) {
  return formatUnits(value, USDC_DECIMALS);
}
