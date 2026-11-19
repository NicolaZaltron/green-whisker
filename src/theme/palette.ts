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
  accent: string; // warm accent (terracotta): highlights, small icons
  accentSoft: string; // soft background behind accent
  dangerBorder: string; // border of destructive actions
  warningText: string; // warning text and icons
  warningSoft: string; // warning background
  infoSoft: string; // info panel background
  infoBorder: string; // info panel border
  successSoft: string; // success panel background
  successBorder: string; // success panel border
  neutralStrong: string; // neutral action background (e.g. copy)
  neutralText: string; // text on neutral action rows
  neutralIcon: string; // icons on neutral action rows
  surfaceGlass: string; // translucent surface over content
  surfaceAltGlass: string; // translucent field background over content
  onPrimaryFaint: string; // translucent light layer on primary
  surfaceNeutral: string; // neutral grey badge background
  cautionText: string; // text on caution notices
  cautionSoft: string; // caution notice background
  controlTrack: string; // track behind segmented controls
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
  accent: '#D97757',
  accentSoft: '#FBEFEA',
  dangerBorder: '#E8B4B1',
  warningText: '#995200',
  warningSoft: '#FFF4E5',
  infoSoft: '#F0F8FD',
  infoBorder: '#D1EAF8',
  successSoft: '#F0FAF3',
  successBorder: '#D2F2DD',
  neutralStrong: '#607D8B',
  neutralText: '#37474F',
  neutralIcon: '#607D8B',
  surfaceGlass: 'rgba(255, 255, 255, 0.95)',
  surfaceAltGlass: 'rgba(247, 249, 246, 0.7)',
  onPrimaryFaint: 'rgba(255, 255, 255, 0.25)',
  surfaceNeutral: '#F3F5F3',
  cautionText: '#B45309',
  cautionSoft: '#FEF3C7',
  controlTrack: '#E6EAE6',
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
  accent: '#E8957A',
  accentSoft: '#3A2A22',
  dangerBorder: '#5A3634',
  warningText: '#F2B66D',
  warningSoft: '#3A2E1C',
  infoSoft: '#132630',
  infoBorder: '#1E3A48',
  successSoft: '#13261A',
  successBorder: '#1F3D2A',
  neutralStrong: '#455A64',
  neutralText: '#CFD8DC',
  neutralIcon: '#90A4AE',
  surfaceGlass: 'rgba(27, 35, 28, 0.95)',
  surfaceAltGlass: 'rgba(17, 22, 17, 0.7)',
  onPrimaryFaint: 'rgba(255, 255, 255, 0.25)',
  surfaceNeutral: '#27302A',
  cautionText: '#FCD34D',
  cautionSoft: '#3D2E0E',
  controlTrack: '#222C23',
};
