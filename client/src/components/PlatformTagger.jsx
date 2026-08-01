import { useState, useEffect } from 'react';
import { useFavorites } from '../context/FavoritesContext';
import { isPC, getStorefronts, STORE_META } from '../utils/storefronts';

export default function PlatformTagger({ gameId, gamePlatforms, gameWebsites }) {
  const { getFavorite, updatePlatforms } = useFavorites();
  const fav = getFavorite(gameId);
  const [selected, setSelected] = useState(new Set(fav?.platforms ?? []));
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState(null);

  useEffect(() => {
    setSelected(new Set(fav?.platforms ?? []));
  }, [fav?.platforms?.join(',')]);

  // Build the flat list of all selectable options
  const consolePlatforms = (gamePlatforms ?? []).filter((p) => !isPC(p));
  const hasPCPlatform    = (gamePlatforms ?? []).some((p) => isPC(p));
  const storefronts      = getStorefronts(gameWebsites ?? [], hasPCPlatform);

  // All options in one flat array: console platforms first, then PC storefronts
  const allOptions = [
    ...consolePlatforms.map((p) => ({
      key: p.abbreviation ?? p.name,
      label: p.abbreviation ?? p.name,
      sublabel: p.abbreviation && p.abbreviation !== p.name ? p.name : null,
      type: 'console',
      storeKey: null,
    })),
    ...storefronts.map((sf) => ({
      key: sf,
      label: sf,
      sublabel: null,
      type: 'store',
      storeKey: STORE_META[sf]?.key ?? sf.toLowerCase().replace(/\s+/g, '-'),
    })),
  ];

  function toggle(key) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
    setFlash(null);
  }

  async function save() {
    setSaving(true);
    setFlash(null);
    const result = await updatePlatforms(gameId, [...selected]);
    setSaving(false);
    if (result.ok) {
      setFlash({ type: 'success', msg: '✓ Saved' });
      setTimeout(() => setFlash(null), 2500);
    } else {
      setFlash({ type: 'error', msg: result.error ?? 'Failed to save' });
    }
  }

  const hasChanges =
    JSON.stringify([...selected].sort()) !==
    JSON.stringify([...(fav?.platforms ?? [])].sort());

  if (!allOptions.length) return null;

  return (
    <div className="platform-tagger">
      <p className="tagger-hint">Select the platforms you own this game on:</p>

      <div className="platform-chip-grid">
        {allOptions.map((opt) => {
          const checked = selected.has(opt.key);
          return (
            <button
              key={opt.key}
              type="button"
              className={`platform-chip ${opt.type === 'store' ? 'storefront-chip' : ''} ${checked ? 'selected' : ''}`}
              data-store={opt.storeKey ?? undefined}
              onClick={() => toggle(opt.key)}
              title={opt.sublabel ?? undefined}
            >
              {checked && <span className="chip-check">✓</span>}
              {opt.type === 'store' && <StoreIcon name={opt.label} />}
              <span>{opt.label}</span>
              {opt.sublabel && <span className="chip-fullname">{opt.sublabel}</span>}
            </button>
          );
        })}
      </div>

      <div className="tagger-footer">
        <div className="tagger-summary">
          {selected.size > 0 ? (
            <span className="tagger-selected-list">{[...selected].join(' · ')}</span>
          ) : (
            <span className="tagger-none">Nothing selected yet</span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {flash && (
            <span className={flash.type === 'success' ? 'tagger-success' : 'tagger-error'}>
              {flash.msg}
            </span>
          )}
          <button className="btn-primary" onClick={save} disabled={saving || !hasChanges}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

function StoreIcon({ name }) {
  const icons = {
    'Steam':           <SteamIcon />,
    'Epic Games':      <EpicIcon />,
    'GOG':             <GogIcon />,
    'itch.io':         <span className="store-text-icon" style={{ color: '#fa5c5c' }}>itch</span>,
    'Xbox Store':      <XboxIcon />,
    'Microsoft Store': <MsIcon />,
  };
  return icons[name] ?? null;
}

function SteamIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
      <path d="M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658c.545-.371 1.203-.59 1.912-.59.063 0 .125.004.187.006l2.861-4.142V8.91c0-2.495 2.028-4.524 4.524-4.524 2.494 0 4.524 2.031 4.524 4.527s-2.03 4.525-4.524 4.525h-.105l-4.076 2.911c0 .052.004.105.004.159 0 1.875-1.515 3.396-3.39 3.396-1.635 0-3.016-1.173-3.331-2.727L.436 15.27C1.862 20.307 6.486 24 11.979 24c6.627 0 11.999-5.373 11.999-12S18.606 0 11.979 0z"/>
    </svg>
  );
}

function EpicIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
      <path d="M3 0v24l4.5-4.5V4.5L12 9l4.5-4.5V24L21 24V0H3z"/>
    </svg>
  );
}

function GogIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm0 4c4.411 0 8 3.589 8 8s-3.589 8-8 8-8-3.589-8-8 3.589-8 8-8zm0 2C8.686 6 6 8.686 6 12s2.686 6 6 6 6-2.686 6-6-2.686-6-6-6z"/>
    </svg>
  );
}

function XboxIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
      <path d="M4.102 21.033C6.211 22.881 8.977 24 12 24c3.026 0 5.789-1.119 7.902-2.967 1.877-1.934-4.514-8.127-7.902-10.848-3.388 2.721-9.777 8.914-7.898 10.848zm11.16-14.406c2.5 2.961 7.484 10.313 6.076 12.912C23.002 17.48 24 14.861 24 12c0-3.34-1.365-6.362-3.57-8.536 0 0-2.01 1.35-5.168 3.163zm-6.522 0C5.578 4.814 3.568 3.464 3.568 3.464 1.365 5.638 0 8.66 0 12c0 2.861.998 5.48 2.64 7.539-1.401-2.6 3.579-9.951 6.1-12.912zM12 0C9.18 0 6.67.977 4.693 2.572c.1.085 7.225 4.96 7.307 5.02.082-.06 7.207-4.935 7.307-5.02C17.33.977 14.822 0 12 0z"/>
    </svg>
  );
}

function MsIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
      <path d="M0 0h11.5v11.5H0zm12.5 0H24v11.5H12.5zM0 12.5h11.5V24H0zm12.5 0H24V24H12.5z"/>
    </svg>
  );
}
