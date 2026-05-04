"use client";

import React, { useState } from "react";
import toast from "react-hot-toast";
import StarRating from "./StarRating";
import apiClient from "@/lib/api";
import type { Review } from "@/types/review";

interface Props {
  productId: string;
  userId: string;
  onCreated: (review: Review) => void;
}

const MAX_COMMENT = 2000;

const ReviewForm: React.FC<Props> = ({ productId, userId, onCreated }) => {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (rating < 1) {
      toast.error("Please pick a star rating.");
      return;
    }
    if (comment.length > MAX_COMMENT) {
      toast.error(`Comment is too long (${comment.length}/${MAX_COMMENT}).`);
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiClient.post("/api/reviews", {
        productId,
        userId,
        rating,
        comment: comment.trim() || undefined,
      });
      const body = await res.json();
      if (!res.ok) {
        toast.error(body?.error || "Failed to post review");
        return;
      }
      toast.success("Review posted");
      setRating(0);
      setComment("");
      onCreated(body.review);
    } catch {
      toast.error("Network error — try again");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="rounded border border-gray-200 p-4">
      <h3 className="text-lg font-medium">Write a review</h3>
      <div className="mt-2">
        <StarRating
          value={rating}
          interactive
          onChange={setRating}
          size={24}
        />
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Optional: share your experience…"
        maxLength={MAX_COMMENT}
        rows={4}
        className="mt-2 w-full rounded border border-gray-300 p-2 text-base"
      />
      <div className="mt-2 flex items-center justify-between">
        <span className="text-sm text-gray-500">
          {comment.length}/{MAX_COMMENT}
        </span>
        <button
          type="submit"
          disabled={submitting || rating < 1}
          className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
        >
          {submitting ? "Posting…" : "Post review"}
        </button>
      </div>
    </form>
  );
};

export default ReviewForm;
