import { useState } from 'react';

export default function StarRating({ value, onChange, readOnly = false, max = 10 }) {
  const [hovered, setHovered] = useState(0);
  const display = hovered || value;

  return (
    <div className={`stars ${readOnly ? 'stars-readonly' : 'stars-interactive'}`}>
      {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          type="button"
          className={`star ${n <= display ? 'star-filled' : 'star-empty'}`}
          onClick={() => !readOnly && onChange?.(n)}
          onMouseEnter={() => !readOnly && setHovered(n)}
          onMouseLeave={() => !readOnly && setHovered(0)}
          disabled={readOnly}
          aria-label={`${n} star${n > 1 ? 's' : ''}`}
        >
          ★
        </button>
      ))}
    </div>
  );
}
