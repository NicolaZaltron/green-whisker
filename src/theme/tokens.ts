import type { Palette } from './palette';

// Shape tokens. Only real controls (buttons, fields, badges, pills) are fully round.
export const radius = {
  full: 999, // fully round controls
  md: 12, // non-clickable containers (sections, info boxes)
  sm: 8, // small containers and inner boxes
};

// Fixed radius for cards (D-UI4): 20, as in the current recipe cards.
export const cardRadius = 20;

// Fixed sizes of controls (D-UI1, D-UI2).
export const size = {
  // Round buttons and badges. L = header settings button, XL = large FAB (former L).
  circle: { S: 34, M: 40, L: 54, XL: 75 },
  field: { M: 40, L: 52 }, // text fields and search bars
  // Segmented control height. M = size.field.M. L = height of the former Recipes/Pantry toggle:
  // 2 * space.xs padding + 2 * 9 button padding + 16 content (icon.sm, about one 13pt text line) = 42
  segmented: { M: 40, L: 42, XL: 54 }, // segmented controls
  pill: { S: 24, M: 32 }, // badges and pills
  buttonMinWidth: { L: 220, XL: "100%" }, // minimum width of large (L) and extra large (XL) buttons
  touchMin: 44, // minimum touch target (text buttons, checkboxes)
};

// Recurring spacing scale (padding, margin, gap).
export const space = {
  none: 0,
  xs: 4,
  sm: 6,
  md: 8,
  lg: 10,
  xl: 12,
  xxl: 14,
  xxxl: 16,
  huge: 20,
};

export type SpaceSize = keyof typeof space;

// Text scale (font sizes), from smallest to largest.
export const text = {
  label: 11, // eyebrows and tiny labels
  caption: 13, // secondary text, notices
  body: 14, // default text
  title: 16, // row and item titles
  heading: 18, // section headings
  page: 22, // page titles
};

export type TextSize = keyof typeof text;

// Icon sizes (Ionicons).
export const icon = {
  xs: 14,
  sm: 16,
  md: 18,
  lg: 20,
  xl: 24,
};

// Display sizes for large decorative icons (error screen, empty states, notices).
export const display = {
  sm: 32,
  md: 40,
  lg: 48,
};

export type Elevation = 1 | 2 | 3;

// Shadow props for a level. The shadow color comes from the theme palette.
export function elevation(level: Elevation, colors: Pick<Palette, 'shadow'>) {
  const spec = {
    1: { height: 1, opacity: 0.04, radius: 3, elevation: 1 },
    2: { height: 2, opacity: 0.12, radius: 5, elevation: 3 },
    3: { height: 4, opacity: 0.2, radius: 10, elevation: 6 },
  }[level];
  return {
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: spec.height },
    shadowOpacity: spec.opacity,
    shadowRadius: spec.radius,
    elevation: spec.elevation,
  };
}
