"use client";

import { useState, useTransition } from "react";
import type { FormEvent } from "react";

type SubmissionState = {
  status: "idle" | "success" | "error";
  message: string;
};

export function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<SubmissionState>({
    status: "idle",
    message: "",
  });
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState({ status: "idle", message: "" });

    startTransition(async () => {
      try {
        const response = await fetch("/api/waitlist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        const data = (await response.json()) as {
          ok?: boolean;
          message?: string;
          error?: string;
        };

        if (!response.ok || !data.ok) {
          setState({
            status: "error",
            message: data.error ?? "Unable to join the waitlist right now.",
          });
          return;
        }

        setState({
          status: "success",
          message: data.message ?? "You’re on the waitlist.",
        });
        setEmail("");
        if (typeof pendo !== "undefined") {
          pendo.track("waitlist_signup_completed", {
            status: "success",
            is_duplicate: data.message?.toLowerCase().includes("already") ?? false,
          });
        }
      } catch {
        setState({
          status: "error",
          message: "Unable to join the waitlist right now.",
        });
      }
    });
  }

  return (
    <form className="waitlist-form" onSubmit={handleSubmit}>
      <label className="sr-only" htmlFor="waitlist-email">
        Email address
      </label>
      <input
        id="waitlist-email"
        className="waitlist-input"
        type="email"
        name="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="you@example.com"
        autoComplete="email"
        required
      />
      <button className="btn-primary" type="submit" disabled={isPending}>
        Join waitlist
      </button>
      {state.message ? (
        <p className={`form-message ${state.status}`} aria-live="polite">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
