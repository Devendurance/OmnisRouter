import { NextRequest, NextResponse } from "next/server";

import { DEMO_ACCESS_COOKIE, verifyDemoAccessToken } from "./lib/demo-access-token";

function isProtectedPage(pathname: string) {
  return pathname === "/app" || pathname.startsWith("/app/");
}

function isProtectedApi(pathname: string) {
  return pathname.startsWith("/api/cctp/");
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!isProtectedPage(pathname) && !isProtectedApi(pathname)) {
    return NextResponse.next();
  }

  const hasDemoAccess = await verifyDemoAccessToken(
    request.cookies.get(DEMO_ACCESS_COOKIE)?.value,
    process.env.DEMO_ACCESS_CODE,
  );

  if (hasDemoAccess) {
    return NextResponse.next();
  }

  if (isProtectedApi(pathname)) {
    return NextResponse.json(
      { ok: false, error: "Demo access required." },
      { status: 401 },
    );
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/demo-login";
  loginUrl.search = "";
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/app/:path*", "/api/cctp/:path*"],
};
