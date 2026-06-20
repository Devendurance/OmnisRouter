import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { createDemoAccessToken, DEMO_ACCESS_COOKIE } from "../../lib/demo-access-token";

export const metadata: Metadata = {
  title: "OmnisRouter Demo Access",
};

async function enterDemo(formData: FormData) {
  "use server";

  const configuredCode = process.env.DEMO_ACCESS_CODE?.trim();
  const submittedCode = String(formData.get("accessCode") ?? "").trim();

  if (!configuredCode || submittedCode !== configuredCode) {
    redirect("/demo-login?error=1");
  }

  const cookieStore = await cookies();
  const accessToken = await createDemoAccessToken(configuredCode);

  cookieStore.set(DEMO_ACCESS_COOKIE, accessToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });

  try {
    await fetch("https://data.pendo.io/data/track", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-pendo-integration-key": "b56618b7-6614-453b-b8a6-f6015dfa36c4",
      },
      body: JSON.stringify({
        type: "track",
        event: "demo_access_granted",
        visitorId: "system",
        accountId: "system",
        timestamp: Date.now(),
      }),
    });
  } catch {
    // tracking failure should not block the redirect
  }

  redirect("/app");
}

export default async function DemoLoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  const params = searchParams ? await searchParams : {};
  const hasError = params.error === "1";

  return (
    <main className="demo-login-page">
      <section className="demo-login-card" aria-labelledby="demo-login-title">
        <p className="section-eyebrow">Private demo</p>
        <h1 id="demo-login-title" className="demo-login-title">
          OmnisRouter Demo Access
        </h1>
        <p className="demo-login-copy">
          Enter your access code to open the private testnet demo.
        </p>
        <form action={enterDemo} className="demo-login-form">
          <label className="demo-login-label" htmlFor="accessCode">
            Access code
          </label>
          <input
            id="accessCode"
            name="accessCode"
            className="demo-login-input"
            type="password"
            autoComplete="one-time-code"
            aria-invalid={hasError}
            aria-describedby={hasError ? "demo-login-error" : undefined}
            required
          />
          {hasError ? (
            <p id="demo-login-error" className="form-message error" role="alert">
              Invalid access code. Please try again.
            </p>
          ) : null}
          <button className="btn-primary" type="submit">
            Enter demo
          </button>
        </form>
      </section>
    </main>
  );
}
