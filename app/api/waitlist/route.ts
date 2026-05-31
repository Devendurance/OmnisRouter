import { NextResponse } from "next/server";

import { createSupabaseServiceRoleClient } from "@/lib/server/supabase";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid request body." },
      { status: 400 },
    );
  }

  const email =
    typeof body === "object" && body !== null && "email" in body
      ? String(body.email).trim().toLowerCase()
      : "";

  if (!email || email.length > 254 || !EMAIL_PATTERN.test(email)) {
    return NextResponse.json(
      { ok: false, error: "Enter a valid email address." },
      { status: 400 },
    );
  }

  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase.from("omnis_waitlist").insert({ email });

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({
        ok: true,
        message: "You’re already on the waitlist.",
      });
    }

    return NextResponse.json(
      { ok: false, error: "Unable to join the waitlist right now." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    message: "You’re on the waitlist.",
  });
}
