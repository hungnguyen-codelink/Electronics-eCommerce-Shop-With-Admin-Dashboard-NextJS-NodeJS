"use client";

import React from "react";
import { formatDistanceToNow, parseISO } from "date-fns";
import StarRating from "./StarRating";
import { sanitize } from "@/lib/sanitize";
import type { Review } from "@/types/review";

const ReviewCard: React.FC<{ review: Review }> = ({ review }) => {
  let when = "";
  try {
    when = formatDistanceToNow(parseISO(review.createdAt), { addSuffix: true });
  } catch {
    when = review.createdAt;
  }

  return (
    <article className="border-b border-gray-200 py-4">
      <div className="flex items-center justify-between">
        <StarRating value={review.rating} size={16} />
        <time className="text-sm text-gray-500">{when}</time>
      </div>
      {review.comment ? (
        <p className="mt-2 whitespace-pre-line text-base text-gray-800">
          {sanitize(review.comment)}
        </p>
      ) : null}
    </article>
  );
};

export default ReviewCard;
