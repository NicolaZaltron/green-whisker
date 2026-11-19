// Colors of the meal slots, per theme. Not part of the app palette (D-UI6).
export type MealColorSlot = 'colazione' | 'spuntino_mattina' | 'pranzo' | 'spuntino_pomeriggio' | 'cena';

export interface MealColor {
  color: string; // icon and text
  bgColor: string; // soft background
}

export const MEAL_COLORS_LIGHT: Record<MealColorSlot, MealColor> = {
  colazione: { color: '#C07A3A', bgColor: '#FDF5EC' },
  spuntino_mattina: { color: '#7B6FA3', bgColor: '#F2F0FA' },
  pranzo: { color: '#4A6B53', bgColor: '#EAF0EB' },
  spuntino_pomeriggio: { color: '#3A8C7E', bgColor: '#E6F4F1' },
  cena: { color: '#D97757', bgColor: '#FDF0EE' },
};

export const MEAL_COLORS_DARK: Record<MealColorSlot, MealColor> = {
  colazione: { color: '#E09A5C', bgColor: '#35291E' },
  spuntino_mattina: { color: '#A597D1', bgColor: '#2A2638' },
  pranzo: { color: '#9CCBA8', bgColor: '#2A3D2E' },
  spuntino_pomeriggio: { color: '#5FB8A8', bgColor: '#1F3530' },
  cena: { color: '#E8957A', bgColor: '#3A2622' },
};
