/** Inline SVG icons (no emoji, no network). */
export const ICON = {
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>',
  cross: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.5"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/></svg>',
  radio: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><rect x="5" y="8" width="14" height="13" rx="2"/><path d="M9 8l6-5M9 14h6"/></svg>',
  star: (filled: boolean) =>
    `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3 6.1 20.6l1.3-6.6L2.5 9.4l6.6-.8z" fill="${filled ? '#fbbf24' : 'none'}" stroke="#fbbf24" stroke-width="1.6"/></svg>`,
  triangle: '<svg viewBox="0 0 30 30" aria-hidden="true"><path d="M15 3l12 23H3z" fill="#dc2626" stroke="#fff" stroke-width="2"/><text x="15" y="23" fill="#fff" font-size="10" font-weight="800" text-anchor="middle" font-family="Inter Variable, sans-serif">2</text></svg>',
  square: '<svg viewBox="0 0 30 30" aria-hidden="true"><rect x="3" y="3" width="24" height="24" fill="#1f9d55" stroke="#fff" stroke-width="2"/><text x="15" y="20" fill="#fff" font-size="11" font-weight="800" text-anchor="middle" font-family="Inter Variable, sans-serif">1</text></svg>',
};
