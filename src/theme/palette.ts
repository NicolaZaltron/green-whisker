// App palette: each color has a role. Light and dark must have the same names.
export interface Palette {
  background: string; // screen background
  surface: string; // cards, panels, sheets
  surfaceAlt: string; // fields, unselected chips, secondary backgrounds
  surfaceMuted: string; // soft backgrounds (beige)
  border: string; // light borders
  borderStrong: string; // stronger borders
  text: string; // main text
  textSecondary: string; // supporting text
  textMuted: string; // fainter text and secondary icons
  primary: string; // solid buttons and accents
  onPrimary: string; // text and icons on primary
  primarySoft: string; // light green pills and backgrounds
  primaryText: string; // green text and icons on light background
  danger: string; // destructive actions
  dangerSoft: string; // background of destructive actions
  overlay: string; // scrim behind modals and sheets
  shadow: string; // shadows
}

export const lightPalette: Palette = {
  background: '#FBF9F5',
  surface: '#FFFFFF',
  surfaceAlt: '#F7F9F6',
  surfaceMuted: '#F3EFEA',
  border: '#ECE7DF',
  borderStrong: '#D4DDD6',
  text: '#2B332B',
  textSecondary: '#5E6D60',
  textMuted: '#7E8B80',
  primary: '#34523C',
  onPrimary: '#FFFFFF',
  primarySoft: '#EAF0EB',
  primaryText: '#34523C',
  danger: '#D9534F',
  dangerSoft: '#FDF0EE',
  overlay: 'rgba(0, 0, 0, 0.45)',
  shadow: '#1A2E1F',
};

export const darkPalette: Palette = {
  background: '#111611',
  surface: '#1B231C',
  surfaceAlt: '#222C23',
  surfaceMuted: '#263128',
  border: '#2E3A2F',
  borderStrong: '#3C4A3E',
  text: '#E6ECE6',
  textSecondary: '#B3C0B5',
  textMuted: '#8A9A8D',
  primary: '#5B8A67',
  onPrimary: '#FFFFFF',
  primarySoft: '#2A3D2E',
  primaryText: '#9CCBA8',
  danger: '#E06A66',
  dangerSoft: '#3A2423',
  overlay: 'rgba(0, 0, 0, 0.6)',
  shadow: '#000000',
};
