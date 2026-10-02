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

export const DEPARTMENT_COLORS: Record<ShoppingDepartment, { bg: string; text: string; border: string }> = {
  CAT_SHOPPING_VERDURA: { bg: '#EAF3EB', text: '#2E663B', border: '#CDE5CF' },
  CAT_SHOPPING_BANCO_FRIGO: { bg: '#EBF4F6', text: '#2A6F7E', border: '#D0E6EA' },
  CAT_SHOPPING_PANE_E_PRODOTTI_DA_FORNO: { bg: '#FBF3E8', text: '#8D6228', border: '#F5DEBE' },
  CAT_SHOPPING_PASTA_E_CEREALI: { bg: '#FFF9ED', text: '#926F1E', border: '#FDE9BE' },
  CAT_SHOPPING_LEGUMI: { bg: '#EBF5EE', text: '#316B45', border: '#CCE7D4' },
  CAT_SHOPPING_BEVANDE_VEGETALI: { bg: '#F2F5EC', text: '#556E41', border: '#DFE7D3' },
  CAT_SHOPPING_FARINE: { bg: '#F9F5EC', text: '#7E6842', border: '#EDE2CC' },
  CAT_SHOPPING_CONSERVE: { bg: '#FBF0ED', text: '#A24B35', border: '#F5D3CA' },
  CAT_SHOPPING_CONDIMENTI: { bg: '#FFF4E8', text: '#9B5B20', border: '#FCDCC0' },
  CAT_SHOPPING_SPEZIE_ED_ERBE_AROMATICHE: { bg: '#FDF1EC', text: '#A64F2D', border: '#F9D8CB' },
  CAT_SHOPPING_FRUTTA_SECCA_E_SEMI_OLEOSI: { bg: '#F7F2EB', text: '#755437', border: '#E7D8C6' },
  CAT_SHOPPING_DOLCIFICANTI: { bg: '#FDF2F7', text: '#973A68', border: '#F8D8E7' },
  CAT_SHOPPING_VARIE: { bg: '#F2F3F2', text: '#5B665D', border: '#E0E3DF' },
};
