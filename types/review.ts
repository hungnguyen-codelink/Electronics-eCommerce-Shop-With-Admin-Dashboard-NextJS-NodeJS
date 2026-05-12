export interface Review {
  id: string;
  rating: number; // 1..5
  comment: string | null;
  createdAt: string; // ISO timestamp
  userId: string;
}

export interface ReviewListResponse {
  reviews: Review[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
}

export interface UserReviewResponse {
  review: Review | null;
}

export interface CreateReviewPayload {
  productId: string;
  userId: string;
  rating: number;
  comment?: string;
}
