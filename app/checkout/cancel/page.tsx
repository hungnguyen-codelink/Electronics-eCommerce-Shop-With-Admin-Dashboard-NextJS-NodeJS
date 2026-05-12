"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { apiClient } from "@/lib/api";

export default function CheckoutCancelPage() {
  const params = useSearchParams();
  const orderId = params.get("orderId");
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRetry() {
    if (!orderId) return;
    setRetrying(true);
    setError(null);
    try {
      const resp = await apiClient.post("/api/checkout/create-session", { orderId });
      if (!resp.ok) {
        setError(`Could not restart payment (${resp.status}).`);
        setRetrying(false);
        return;
      }
      const { url } = await resp.json();
      if (!url) {
        setError("Payment service returned no URL.");
        setRetrying(false);
        return;
      }
      window.location.assign(url);
    } catch (e) {
      setError("Network error while restarting payment.");
      setRetrying(false);
    }
  }

  return (
    <main className="max-w-xl mx-auto p-8">
      <h1 className="text-2xl font-bold mb-4">You cancelled the payment.</h1>
      <p className="mb-6">Your cart is preserved. You can try again or go back to your cart.</p>

      {orderId ? (
        <button
          onClick={handleRetry}
          disabled={retrying}
          className="px-4 py-2 rounded bg-black text-white disabled:opacity-50"
        >
          {retrying ? "Restarting…" : "Try again"}
        </button>
      ) : (
        <p className="text-sm text-gray-600">No order context — head back to checkout to start over.</p>
      )}

      <p className="mt-6">
        <Link className="underline" href="/cart">Back to cart</Link>
      </p>

      {error && <p className="text-red-600 mt-4">{error}</p>}
    </main>
  );
}
