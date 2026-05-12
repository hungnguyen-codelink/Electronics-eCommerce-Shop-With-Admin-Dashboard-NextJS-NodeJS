"use client";

import React, { useState } from "react";
import { FaStar, FaRegStar } from "react-icons/fa";

interface StarRatingProps {
  value: number; // 0..5
  interactive?: boolean;
  onChange?: (value: number) => void;
  size?: number; // px
  ariaLabel?: string;
}

const StarRating: React.FC<StarRatingProps> = ({
  value,
  interactive = false,
  onChange,
  size = 20,
  ariaLabel,
}) => {
  const [hover, setHover] = useState<number | null>(null);
  const display = hover ?? value;

  const stars = [1, 2, 3, 4, 5].map((n) => {
    const filled = n <= display;
    const Icon = filled ? FaStar : FaRegStar;
    const common = {
      size,
      style: { color: filled ? "#facc15" : "#9ca3af" },
    };
    if (interactive) {
      return (
        <button
          key={n}
          type="button"
          aria-label={`Rate ${n} star${n === 1 ? "" : "s"}`}
          onClick={() => onChange?.(n)}
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(null)}
          className="p-0.5 cursor-pointer"
        >
          <Icon {...common} />
        </button>
      );
    }
    return <Icon key={n} {...common} />;
  });

  return (
    <div
      role={interactive ? "radiogroup" : "img"}
      aria-label={ariaLabel || `Rated ${value} out of 5`}
      className="inline-flex items-center gap-0.5"
    >
      {stars}
    </div>
  );
};

export default StarRating;
