import { NextResponse } from "next/server";
import { formatUnits } from "viem";
import {
  INJECTIVE_TESTNET_EVM_CHAIN_ID,
  INJECTIVE_TESTNET_USDC,
  USDC_DECIMALS,
  buildTransferWithAuthorizationTypedData,
  getRelayerAddressFromEnv,
  getSolanaUsdcAta,
  hashTransferWithAuthorizationTypedData,
  parseEvmAddress,
  parsePositiveUsdcAmount,
  parseSolanaAddress,
  readInjectiveUsdcBalance,
  readUsdcDomainDebug,
} from "../../../../../../lib/server/cctp/injective-to-solana-auth";

const AUTH_VALIDITY_SECONDS = 10 * 60;
const AUTH_VALID_AFTER_BUFFER_SECONDS = 30;

type PrepareAuthorizationRequestBody = {
  amountUsdc?: unknown;
  sourceEvmAddress?: unknown;
  solanaRecipientAddress?: unknown;
};

export async function POST(request: Request) {
  try {
    const body = await request.json() as PrepareAuthorizationRequestBody;
    const { amount } = parsePositiveUsdcAmount(body.amountUsdc);
    const sourceEvmAddress = parseEvmAddress(body.sourceEvmAddress, "sourceEvmAddress");
    const solanaRecipientPublicKey = parseSolanaAddress(body.solanaRecipientAddress);
    const solanaRecipientAddress = solanaRecipientPublicKey.toBase58();
    const relayerAddress = getRelayerAddressFromEnv();
    const [sourceUsdcBalance, domainDebug] = await Promise.all([
      readInjectiveUsdcBalance(sourceEvmAddress),
      readUsdcDomainDebug(),
    ]);

    if (sourceUsdcBalance < amount) {
      return NextResponse.json({
        ok: false,
        error: "Connected Injective EVM address has less USDC than the requested amount. Fund this 0x address with Injective testnet USDC or lower the amount.",
        sourceUsdcBalance: {
          usdc: formatUnits(sourceUsdcBalance, USDC_DECIMALS),
          baseUnits: sourceUsdcBalance.toString(),
        },
        requiredAmount: amount.toString(),
      }, { status: 400 });
    }

    const now = Math.floor(Date.now() / 1000);
    const validAfter = BigInt(Math.max(0, now - AUTH_VALID_AFTER_BUFFER_SECONDS));
    const validBefore = BigInt(now + AUTH_VALIDITY_SECONDS);
    const typedData = buildTransferWithAuthorizationTypedData({
      from: sourceEvmAddress,
      to: relayerAddress,
      value: amount,
      validAfter,
      validBefore,
    });
    const preparedTypedDataHash = hashTransferWithAuthorizationTypedData(typedData);

    return NextResponse.json({
      ok: true,
      route: "injective-to-solana",
      executionMode: "user-authorized-server-sponsored",
      authorizationType: "EIP-3009 transferWithAuthorization",
      typedData,
      preparedTypedDataHash,
      from: sourceEvmAddress,
      to: relayerAddress,
      value: amount.toString(),
      validAfter: validAfter.toString(),
      validBefore: validBefore.toString(),
      nonce: typedData.message.nonce,
      usdcAddress: INJECTIVE_TESTNET_USDC,
      chainId: INJECTIVE_TESTNET_EVM_CHAIN_ID,
      relayerAddress,
      solanaRecipientAddress,
      solanaRecipientAta: getSolanaUsdcAta(solanaRecipientAddress),
      sourceUsdcBalance: {
        usdc: formatUnits(sourceUsdcBalance, USDC_DECIMALS),
        baseUnits: sourceUsdcBalance.toString(),
      },
      requestedAmount: {
        usdc: formatUnits(amount, USDC_DECIMALS),
        baseUnits: amount.toString(),
      },
      domainDebug: {
        name: typedData.domain.name,
        version: typedData.domain.version,
        symbol: domainDebug.contractSymbol,
        decimals: domainDebug.contractDecimals,
        chainId: typedData.domain.chainId,
        verifyingContract: typedData.domain.verifyingContract,
        contractDomainSeparator: domainDebug.contractDomainSeparator,
        locallyComputedDomainSeparator: domainDebug.locallyComputedDomainSeparator,
        domainSeparatorMatches: domainDebug.domainSeparatorMatches,
        localDomainSeparatorError: domainDebug.localDomainSeparatorError,
      },
      gasPaidBy: "OmnisRouter",
      note: domainDebug.domainSeparatorMatches
        ? "User signs authorization only. No transaction is sent in this phase."
        : "Typed-data domain does not match Injective USDC contract domain. Signature would be rejected on-chain.",
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Unable to prepare Injective to Solana authorization.",
    }, { status: 400 });
  }
}
