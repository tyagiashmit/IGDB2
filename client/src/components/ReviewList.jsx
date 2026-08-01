import StarRating from './StarRating';

export default function ReviewList({ reviews }) {
  if (!reviews.length) {
    return (
      <div className="no-reviews">
        <p>No reviews yet. Be the first to share your thoughts!</p>
      </div>
    );
  }

  return (
    <div className="review-list">
      {reviews.map((r) => (
        <div key={r.id} className="review-card">
          <div className="review-header">
            <div className="reviewer-avatar">
              {r.author[0]?.toUpperCase() ?? '?'}
            </div>
            <div className="reviewer-info">
              <span className="reviewer-name">{r.author}</span>
              <span className="review-date">{formatDate(r.createdAt)}</span>
            </div>
            <StarRating value={r.rating} readOnly />
          </div>
          <p className="review-content">{r.content}</p>
        </div>
      ))}
    </div>
  );
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
