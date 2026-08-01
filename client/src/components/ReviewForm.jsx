import { useState } from 'react';
import StarRating from './StarRating';

export default function ReviewForm({ gameId, onSubmitted }) {
  const [author, setAuthor] = useState('');
  const [rating, setRating] = useState(0);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (!author.trim() || !content.trim() || !rating) {
      setError('Please fill in all fields and select a rating.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/reviews/${gameId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ author, rating, content }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      const review = await res.json();
      setAuthor('');
      setRating(0);
      setContent('');
      onSubmitted?.(review);
    } catch (err) {
      setError(err.message || 'Failed to submit review.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="review-form" onSubmit={handleSubmit}>
      <h3 className="review-form-title">Write a Review</h3>
      {error && <p className="form-error">{error}</p>}
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Your Name</label>
          <input
            type="text"
            className="form-input"
            placeholder="Anonymous Gamer"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            maxLength={60}
          />
        </div>
        <div className="form-group">
          <label className="form-label">Rating {rating > 0 && `— ${rating}/10`}</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <StarRating value={rating} onChange={setRating} />
            <span className="rating-value-label">{rating > 0 ? `${rating}/10` : ''}</span>
          </div>
        </div>
      </div>
      <div className="form-group">
        <label className="form-label">Review</label>
        <textarea
          className="form-textarea"
          placeholder="Share your thoughts about this game…"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={4}
          maxLength={1000}
        />
        <span className="char-count">{content.length}/1000</span>
      </div>
      <button type="submit" className="btn-primary" disabled={loading}>
        {loading ? 'Submitting…' : 'Submit Review'}
      </button>
    </form>
  );
}
