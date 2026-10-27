import { friendlyDate } from "@/lib/format";
import type { ProductReviews } from "@/lib/storefront/contract";

export function ProductReviewsBlock({ reviews }: { reviews: ProductReviews }) {
  if (reviews.count === 0) {
    return (
      <section className="mt-10">
        <h2 className="text-sm font-semibold">Verified purchase reviews</h2>
        <p className="mt-2 text-sm text-neutral-600">
          No verified purchase reviews yet. An empty list is not a score of zero, and this page does
          not invent ratings.
        </p>
      </section>
    );
  }

  return (
    <section className="mt-10">
      <h2 className="text-sm font-semibold">Verified purchase reviews</h2>
      <p className="mt-1 text-sm text-neutral-600">
        Average {reviews.average} from {reviews.count} {reviews.count === 1 ? "review" : "reviews"}{" "}
        left by people who proved an order with an access code.
      </p>
      <ul className="mt-4 space-y-4">
        {reviews.reviews.map((review) => (
          <li key={review.id} className="border-t pt-3 text-sm">
            <p className="font-medium">
              {review.displayName} · {review.rating}/5
              {review.verifiedPurchase ? " · Verified purchase" : ""}
            </p>
            <p className="mt-1 whitespace-pre-wrap text-neutral-700">{review.body}</p>
            <p className="mt-1 text-xs text-neutral-500">{friendlyDate(review.createdAt)}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
