import {
  DEPARTMENT_COLORS,
  DEPARTMENT_COLORS_DARK,
  DEPARTMENT_FALLBACK_DARK,
  DEPARTMENT_FALLBACK_LIGHT,
  type DepartmentColor,
} from '../theme/categoryColors';

export type { DepartmentColor };

export const SHOPPING_DEPARTMENTS = [
  'CAT_SHOPPING_VERDURA',
  'CAT_SHOPPING_BANCO_FRIGO',
  'CAT_SHOPPING_PANE_E_PRODOTTI_DA_FORNO',
  'CAT_SHOPPING_PASTA_E_CEREALI',
  'CAT_SHOPPING_LEGUMI',
  'CAT_SHOPPING_BEVANDE_VEGETALI',
  'CAT_SHOPPING_FARINE',
  'CAT_SHOPPING_CONSERVE',
  'CAT_SHOPPING_CONDIMENTI',
  'CAT_SHOPPING_SPEZIE_ED_ERBE_AROMATICHE',
  'CAT_SHOPPING_FRUTTA_SECCA_E_SEMI_OLEOSI',
  'CAT_SHOPPING_DOLCIFICANTI',
  'CAT_SHOPPING_VARIE',
] as const;

export type ShoppingDepartment = typeof SHOPPING_DEPARTMENTS[number];

export const DEPARTMENT_ICONS: Record<ShoppingDepartment, string> = {
  CAT_SHOPPING_VERDURA: 'nutrition-outline',
  CAT_SHOPPING_BANCO_FRIGO: 'snow-outline',
  CAT_SHOPPING_PANE_E_PRODOTTI_DA_FORNO: 'restaurant-outline',
  CAT_SHOPPING_PASTA_E_CEREALI: 'reorder-four-outline',
  CAT_SHOPPING_LEGUMI: 'leaf-outline',
  CAT_SHOPPING_BEVANDE_VEGETALI: 'water-outline',
  CAT_SHOPPING_FARINE: 'apps-outline',
  CAT_SHOPPING_CONSERVE: 'archive-outline',
  CAT_SHOPPING_CONDIMENTI: 'color-fill-outline',
  CAT_SHOPPING_SPEZIE_ED_ERBE_AROMATICHE: 'flame-outline',
  CAT_SHOPPING_FRUTTA_SECCA_E_SEMI_OLEOSI: 'ellipse-outline',
  CAT_SHOPPING_DOLCIFICANTI: 'sparkles-outline',
  CAT_SHOPPING_VARIE: 'basket-outline',
};

// Colors of a department in the current theme (light or dark).
export function departmentColors(dept: ShoppingDepartment, isDark: boolean): DepartmentColor {
  const table = isDark ? DEPARTMENT_COLORS_DARK : DEPARTMENT_COLORS;
  return table[dept] ?? (isDark ? DEPARTMENT_FALLBACK_DARK : DEPARTMENT_FALLBACK_LIGHT);
}
