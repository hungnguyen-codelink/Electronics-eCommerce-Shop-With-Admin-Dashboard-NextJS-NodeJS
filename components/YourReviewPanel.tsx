"use client";

import React, { useState } from "react";
import toast from "react-hot-toast";
import { formatDistanceToNow, parseISO } from "date-fns";
import StarRating from "./StarRating";
import apiClient from "@/lib/api";
import { sanitize } from "@/lib/sanitize";
import type { Review } from "@/types/review";

interface Props {
  review: Review;
  userId: string;
  onDeleted: () => void;
}

const YourReviewPanel: React.FC<Props> = ({ review, userId, onDeleted }) => {
  const [busy, setBusy] = useState(false);

  let when = "";
  try {
    when = formatDistanceToNow(parseISO(review.createdAt), { addSuffix: true });
  } catch {
    when = review.createdAt;
  }

  const onDelete = async () => {
    if (!confirm("Delete your review?")) return;
    setBusy(true);
    try {
      const res = await apiClient.delete(`/api/reviews/${review.id}`, {
        body: JSON.stringify({ userId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body?.error || "Failed to delete review");
        return;
      }
      toast.success("Review deleted");
      onDeleted();
    } catch {
      toast.error("Network error — try again");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded border border-blue-200 bg-blue-50 p-4">
      <header className="flex items-center justify-between">
        <h3 className="text-lg font-medium">Your review</h3>
        <time className="text-sm text-gray-500">{when}</time>
      </header>
      <div className="mt-2">
        <StarRating value={review.rating} size={18} />
      </div>
      {review.comment ? (
        <p className="mt-2 whitespace-pre-line text-base text-gray-800">
          {sanitize(review.comment)}
        </p>
      ) : null}
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={onDelete}
          disabled={busy}
          className="rounded border border-red-300 px-3 py-1 text-sm text-red-700 hover:bg-red-100 disabled:opacity-50"
        >
          {busy ? "Deleting…" : "Delete review"}
        </button>
      </div>
    </section>
  );
};

export default YourReviewPanel;
