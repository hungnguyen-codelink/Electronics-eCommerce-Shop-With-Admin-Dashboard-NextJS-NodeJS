"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import toast from "react-hot-toast";
import apiClient from "@/lib/api";
import ReviewCard from "./ReviewCard";
import ReviewForm from "./ReviewForm";
import YourReviewPanel from "./YourReviewPanel";
import type {
  Review,
  ReviewListResponse,
  UserReviewResponse,
} from "@/types/review";

interface Props {
  productId: string;
}

const FIRST_PAGE_LIMIT = 5;
const LOAD_MORE_LIMIT = 10;

const ReviewsTab: React.FC<Props> = ({ productId }) => {
  const { data: session, status } = useSession();
  const userId = (session?.user as { id?: string } | undefined)?.id;

  const [reviews, setReviews] = useState<Review[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const [yourReview, setYourReview] = useState<Review | null>(null);
  const [loadingYours, setLoadingYours] = useState(false);

  const fetchPage = useCallback(
    async (offset: number, limit: number, append: boolean) => {
      const res = await apiClient.get(
        `/api/reviews/product/${productId}?offset=${offset}&limit=${limit}`
      );
      const body: ReviewListResponse = await res.json();
      if (!res.ok) {
        toast.error(
          (body as unknown as { error?: string })?.error || "Failed to load reviews"
        );
        return;
      }
      setTotal(body.total);
      setHasMore(body.hasMore);
      setReviews((prev) =>
        append ? [...prev, ...body.reviews] : body.reviews
      );
    },
    [productId]
  );

  const fetchYourReview = useCallback(
    async (uid: string) => {
      setLoadingYours(true);
      try {
        const res = await apiClient.get(
          `/api/reviews/product/${productId}/user/${uid}`
        );
        const body: UserReviewResponse = await res.json();
        if (res.ok) setYourReview(body.review);
      } finally {
        setLoadingYours(false);
      }
    },
    [productId]
  );

  // Initial load.
  useEffect(() => {
    setLoadingList(true);
    fetchPage(0, FIRST_PAGE_LIMIT, false).finally(() => setLoadingList(false));
  }, [fetchPage]);

  // Your-review load when session resolves.
  useEffect(() => {
    if (status === "authenticated" && userId) {
      fetchYourReview(userId);
    } else if (status === "unauthenticated") {
      setYourReview(null);
    }
  }, [status, userId, fetchYourReview]);

  const onLoadMore = async () => {
    setLoadingMore(true);
    await fetchPage(reviews.length, LOAD_MORE_LIMIT, true);
    setLoadingMore(false);
  };

  const refreshAfterWrite = async () => {
    setLoadingList(true);
    await fetchPage(0, FIRST_PAGE_LIMIT, false);
    setLoadingList(false);
    if (userId) await fetchYourReview(userId);
  };

  return (
    <div className="space-y-4 pb-8">
      {status === "authenticated" && userId && yourReview ? (
        <YourReviewPanel
          review={yourReview}
          userId={userId}
          onDeleted={refreshAfterWrite}
        />
      ) : null}

      {status === "authenticated" && userId && !yourReview && !loadingYours ? (
        <ReviewForm
          productId={productId}
          userId={userId}
          onCreated={refreshAfterWrite}
        />
      ) : null}

      {status === "unauthenticated" ? (
        <p className="text-base">
          <Link href="/login" className="text-blue-600 underline">
            Log in
          </Link>{" "}
          to write a review.
        </p>
      ) : null}

      <div>
        <h3 className="text-lg font-medium">
          {total > 0 ? `${total} review${total === 1 ? "" : "s"}` : "Reviews"}
        </h3>
        {loadingList ? (
          <p className="mt-2 text-sm text-gray-500">Loading reviews…</p>
        ) : reviews.length === 0 ? (
          <p className="mt-2 text-base text-gray-600">
            No reviews yet — be the first to review this product.
          </p>
        ) : (
          <div>
            {reviews.map((r) => (
              <ReviewCard key={r.id} review={r} />
            ))}
            {hasMore ? (
              <div className="mt-4 flex justify-center">
                <button
                  type="button"
                  onClick={onLoadMore}
                  disabled={loadingMore}
                  className="rounded border border-gray-300 px-4 py-2 text-base disabled:opacity-50"
                >
                  {loadingMore ? "Loading…" : "Load more"}
                </button>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
};

export default ReviewsTab;
