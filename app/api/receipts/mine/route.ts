import { NextResponse } from "next/server";
import { listOmnisReceiptsByOwner } from "../../../../lib/server/omnis-receipts";
import { readWalletSession } from "../../../../lib/server/wallet-auth";

export async function GET() {
  try {
    const session = await readWalletSession();

    if (!session) {
      return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
    }

    const receipts = await listOmnisReceiptsByOwner(session.walletAddress, session.walletType);

    if (process.env.NODE_ENV === "development") {
      console.log("[OmnisRouter /api/receipts/mine] session", {
        walletAddress: session.walletAddress,
        walletType: session.walletType,
      });
      console.log("[OmnisRouter /api/receipts/mine] count", receipts.length);
    }

    return NextResponse.json({ ok: true, receipts, walletAddress: session.walletAddress, walletType: session.walletType });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Unable to load receipts.",
    }, { status: 500 });
  }
}
