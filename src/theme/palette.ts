// Palette dell'app: ogni colore ha un ruolo. Light e dark devono avere gli stessi nomi.
export interface Palette {
  background: string; // sfondo della schermata
  surface: string; // card, pannelli, schede
  surfaceAlt: string; // campi, chip non selezionati, sfondi secondari
  surfaceMuted: string; // sfondi tenui (beige)
  border: string; // bordi leggeri
  borderStrong: string; // bordi più marcati
  text: string; // testo principale
  textSecondary: string; // testo di supporto
  textMuted: string; // testo più tenue e icone secondarie
  primary: string; // bottoni e accenti pieni
  onPrimary: string; // testo e icone su primary
  primarySoft: string; // pillole e sfondi verdi chiari
  primaryText: string; // testo e icone verdi su sfondo chiaro
  danger: string; // azioni distruttive
  dangerSoft: string; // sfondo di azioni distruttive
  overlay: string; // velo dietro modali e schede
  shadow: string; // ombre
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
