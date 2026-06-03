import { NextResponse } from "next/server";
import { readWalletSession } from "../../../../../lib/server/wallet-auth";

export async function GET() {
  try {
    const session = await readWalletSession();

    if (!session) {
      return NextResponse.json({ authenticated: false });
    }

    return NextResponse.json({
      authenticated: true,
      walletAddress: session.walletAddress,
      walletType: session.walletType,
    });
  } catch {
    return NextResponse.json({ authenticated: false });
  }
}
