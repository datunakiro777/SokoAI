// Swiss Minimalist tokens: white ground, black ink and rules, pale grey support, red signals.
export const colors = {
  ground: '#ffffff',
  ink: '#000000',
  surface: '#f0f0f0',
  accent: '#c90000',
};

// Host Grotesk, registered under these names in app/_layout.tsx. Android selects
// custom fonts by family name, so each weight has its own family.
export const fonts = {
  regular: 'SwissMinimalistHost',
  italic: 'SwissMinimalistHost-Italic',
  strong: 'SwissMinimalistHost-Bold',
  display: 'SwissMinimalistHost-Display',
  displayItalic: 'SwissMinimalistHost-DisplayItalic',
};

export const type = {
  body: 16,
  label: 12,
  metadata: 14,
  lead: 17,
  itemTitle: 24,
  labelTracking: 12 * 0.12,
  bodyLeading: 1.5,
};

export const rule = 2;

/** Side gutter: clamp(20px, 3.3333% of width, 64px). */
export function gutter(width: number): number {
  return Math.min(64, Math.max(20, width * 0.033333));
}

/** Opening display size: 64px on phones up to 148px on wide layouts. */
export function displaySize(width: number): number {
  return Math.round(Math.min(148, Math.max(64, width * 0.1)));
}

/** At 700px and wider the index rail sits beside its content; below, above it. */
export const RAIL_BREAKPOINT = 700;
