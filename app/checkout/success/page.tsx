"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { apiClient } from "@/lib/api";
import { useProductStore } from "@/app/_zustand/store";

type Status = "polling" | "paid" | "failed" | "expired" | "timedout" | "error";

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 30000;

export default function CheckoutSuccessPage() {
  const params = useSearchParams();
  const sessionId = params.get("session_id");
  const [status, setStatus] = useState<Status>(sessionId ? "polling" : "error");
  const [orderId, setOrderId] = useState<string | null>(null);
  const clearedRef = useRef(false);
  const { clearCart } = useProductStore();

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    const startedAt = Date.now();

    async function pollOnce() {
      try {
        const resp = await apiClient.get(`/api/checkout/session/${sessionId}`);
        if (!resp.ok) {
          if (!cancelled) setStatus("error");
          return true; // stop polling
        }
        const body = await resp.json();
        if (cancelled) return true;
        setOrderId(body.orderId);
        if (body.paymentStatus === "paid") {
          setStatus("paid");
          if (!clearedRef.current) {
            clearedRef.current = true;
            clearCart();
          }
          return true; // stop
        }
        if (body.paymentStatus === "failed" || body.paymentStatus === "expired") {
          setStatus(body.paymentStatus as Status);
          return true; // stop
        }
        return false; // keep polling
      } catch {
        if (!cancelled) setStatus("error");
        return true;
      }
    }

    (async () => {
      while (!cancelled) {
        const done = await pollOnce();
        if (done) return;
        if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
          if (!cancelled) setStatus("timedout");
          return;
        }
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sessionId, clearCart]);

  if (!sessionId) {
    return (
      <main className="max-w-xl mx-auto p-8 text-center">
        <h1 className="text-2xl font-bold mb-4">Missing session</h1>
        <p>This page expects a session_id query parameter.</p>
        <Link className="underline" href="/">Go home</Link>
      </main>
    );
  }

  return (
    <main className="max-w-xl mx-auto p-8">
      {status === "polling" && (
        <>
          <h1 className="text-2xl font-bold mb-4">Confirming your payment…</h1>
          <p>Hang tight — we&apos;re waiting on Stripe to confirm your payment.</p>
        </>
      )}
      {status === "paid" && (
        <>
          <h1 className="text-2xl font-bold mb-4">Thanks — your order is confirmed.</h1>
          {orderId && <p className="mb-4">Order ID: <code>{orderId}</code></p>}
          <Link className="underline" href="/">Continue shopping</Link>
        </>
      )}
      {status === "failed" && (
        <>
          <h1 className="text-2xl font-bold mb-4">Payment didn&apos;t go through.</h1>
          <p>Your cart is still here. <Link className="underline" href="/checkout">Try again</Link>.</p>
        </>
      )}
      {status === "expired" && (
        <>
          <h1 className="text-2xl font-bold mb-4">Payment session expired.</h1>
          <p>Your cart is still here. <Link className="underline" href="/checkout">Try again</Link>.</p>
        </>
      )}
      {status === "timedout" && (
        <>
          <h1 className="text-2xl font-bold mb-4">Payment is taking longer than expected.</h1>
          <p>We&apos;ll notify you once Stripe confirms. You can also check your account later.</p>
        </>
      )}
      {status === "error" && (
        <>
          <h1 className="text-2xl font-bold mb-4">Something went wrong.</h1>
          <p><Link className="underline" href="/">Go home</Link></p>
        </>
      )}
    </main>
  );
}
