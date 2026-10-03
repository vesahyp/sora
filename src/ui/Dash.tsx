/** The stencil L breaks at its corner and reads as "I.": words with an L get the plain face. */
export function face(word: string): string {
  return /l/i.test(word) ? 'plain' : 'stencil';
}

// The dash parts the screens share: segmented lamps and the small drawn
// glyphs that replace emoji. Inline SVG so they follow currentColor and
// stay crisp at any size, and no image file to cache.

/** A row of lamps, lit to v (0..1). `up` lights a preview past v: what a part or car would add. */
export function Lamps({ v, n = 10, up, tone = 'amber' }: { v: number; n?: number; up?: number; tone?: 'amber' | 'red' | 'bone' }) {
  const lit = Math.round(Math.max(0, Math.min(1, v)) * n);
  const prev = up === undefined ? lit : Math.round(Math.max(0, Math.min(1, up)) * n);
  return (
    <span className={`lamps ${tone}`} aria-hidden>
      {Array.from({ length: n }, (_, i) => (
        <i key={i} className={i < lit ? 'on' : i < prev ? 'up' : ''} />
      ))}
    </span>
  );
}

export function MissileIcon() {
  return (
    <svg className="glyph" viewBox="0 0 24 24" aria-hidden>
      <path d="M3 12l3-3h11l4 3-4 3H6z" fill="currentColor" />
      <path d="M6 9L4 5h3l3 4M6 15l-2 4h3l3-4" fill="currentColor" opacity="0.7" />
    </svg>
  );
}

export function MineIcon() {
  return (
    <svg className="glyph" viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="6.5" fill="currentColor" />
      <path d="M12 2v4M12 18v4M2 12h4M18 12h4M5 5l3 3M16 16l3 3M19 5l-3 3M8 16l-3 3" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="2" fill="var(--soot)" />
    </svg>
  );
}

export function PauseIcon() {
  return (
    <svg className="glyph" viewBox="0 0 24 24" aria-hidden>
      <rect x="6" y="5" width="4" height="14" fill="currentColor" />
      <rect x="14" y="5" width="4" height="14" fill="currentColor" />
    </svg>
  );
}

export function SoundIcon({ off }: { off: boolean }) {
  return (
    <svg className="glyph" viewBox="0 0 24 24" aria-hidden>
      <path d="M3 9h4l5-4v14l-5-4H3z" fill="currentColor" />
      {off ? <path d="M15 9l6 6M21 9l-6 6" stroke="currentColor" strokeWidth="2.2" /> : <path d="M15 8.5c1.6 1.8 1.6 5.2 0 7M18 6c3 3.2 3 8.8 0 12" stroke="currentColor" strokeWidth="2" fill="none" />}
    </svg>
  );
}

/** A three-spoke rally wheel, the 12 o'clock stripe shows how far it has turned. */
export function WheelIcon() {
  return (
    <svg viewBox="0 0 76 76" aria-hidden>
      <circle cx="38" cy="38" r="32" fill="none" stroke="#14110d" strokeWidth="11" />
      <circle cx="38" cy="38" r="32" fill="none" stroke="#2c2721" strokeWidth="7" strokeDasharray="1.2 2.6" />
      <path d="M8 38h18M50 38h18M38 50v18" stroke="#6d675c" strokeWidth="7" />
      <path d="M8 38h18M50 38h18M38 50v18" stroke="#8a8476" strokeWidth="3" />
      <circle cx="38" cy="38" r="12" fill="#1c1915" stroke="#6d675c" strokeWidth="2" />
      <circle cx="38" cy="38" r="4" fill="#c8352a" />
      <rect className="mark" x="35" y="1" width="6" height="12" fill="#e6dcc4" />
    </svg>
  );
}
