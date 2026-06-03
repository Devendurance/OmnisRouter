import { NextResponse } from "next/server";
import { createPublicClient, formatUnits, getAddress, http, isAddress } from "viem";

const INJECTIVE_EVM_TESTNET_RPC_URL = "https://k8s.testnet.json-rpc.injective.network/";
const INJECTIVE_EVM_TESTNET_CHAIN_ID = 1439;
const INJECTIVE_TESTNET_USDC = "0x0C382e685bbeeFE5d3d9C29e29E341fEE8E84C5d";

const usdcBalanceOfAbi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

type BalanceRequestBody = { address?: unknown };

export async function POST(request: Request) {
  try {
    const body = await request.json() as BalanceRequestBody;

    if (typeof body.address !== "string" || !isAddress(body.address.trim())) {
      return NextResponse.json({ ok: false, error: "Valid EVM address is required." }, { status: 400 });
    }

    const address = getAddress(body.address.trim());
    const publicClient = createPublicClient({
      transport: http(INJECTIVE_EVM_TESTNET_RPC_URL),
    });

    const [injBalance, usdcBalance] = await Promise.all([
      publicClient.getBalance({ address }).catch(() => null),
      publicClient.readContract({
        address: INJECTIVE_TESTNET_USDC,
        abi: usdcBalanceOfAbi,
        functionName: "balanceOf",
        args: [address],
      }).catch(() => null),
    ]);

    return NextResponse.json({
      ok: true,
      address,
      chainId: INJECTIVE_EVM_TESTNET_CHAIN_ID,
      injBalance: injBalance !== null ? injBalance.toString() : null,
      injBalanceFormatted: injBalance !== null ? formatUnits(injBalance, 18) : null,
      usdcBalance: usdcBalance !== null ? usdcBalance.toString() : null,
      usdcBalanceFormatted: usdcBalance !== null ? formatUnits(usdcBalance, 6) : null,
      usdcDecimals: 6,
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Unable to read Injective EVM balances.",
    }, { status: 500 });
  }
}
