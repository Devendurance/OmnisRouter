import { NextResponse } from "next/server";
import { clearWalletSessionCookie } from "../../../../../lib/server/wallet-auth";

export async function POST() {
  try {
    await clearWalletSessionCookie();

    return NextResponse.json({ ok: true, message: "Logged out." });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Unable to log out.",
    }, { status: 500 });
  }
}
