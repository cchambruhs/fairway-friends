// @polsia:user-owned — brand identity. Edit freely. `site.ts` re-exports
// siteName/siteDescription; `manifest.ts` + `opengraph-image.tsx` read `brandVisual`.

export const siteName = 'Fairway Friends';
export const siteDescription =
  'Fairway Friends is a disc golf clubhouse with personal player profiles. Add your home course and favorite discs, then open the clubhouse.';

// PWA + social-share colors. HEX only (CSS variables aren't readable here) — set
// them to match the theme you define in src/app/brand-theme.css. The starter
// values are achromatic placeholders, not a palette.
export const brandVisual = {
  /** PWA browser-UI / status-bar color — usually your background or primary. */
  themeColor: '#0b120e',
  /** PWA splash + install background. */
  backgroundColor: '#0b120e',
  /** Social-share (OG/Twitter) image. */
  og: {
    background: '#0b120e',
    foreground: '#f2f2e9',
    /** Second line under the site name; '' hides it. */
    tagline: 'Disc golf is better with friends.',
    /** Optional https PNG/JPEG background photo; '' keeps the plain-color card. */
    image: '',
  },
} as const;
