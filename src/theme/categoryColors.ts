// Colors of the shopping departments, per theme. Not part of the app palette (D-UI6).
import type { ShoppingDepartment } from '../constants/shoppingDepartments';

export interface DepartmentColor {
  bg: string;
  text: string;
  border: string;
}


export const DEPARTMENT_COLORS: Record<ShoppingDepartment, DepartmentColor> = {
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

// Dark theme variants: dark-tinted bg of the same hue, lighter text/border to stay readable.
export const DEPARTMENT_COLORS_DARK: Record<ShoppingDepartment, DepartmentColor> = {
  CAT_SHOPPING_VERDURA: { bg: '#1E2F20', text: '#A4D6AF', border: '#305032' },
  CAT_SHOPPING_BANCO_FRIGO: { bg: '#1E2C2F', text: '#9CD2DE', border: '#304B50' },
  CAT_SHOPPING_PANE_E_PRODOTTI_DA_FORNO: { bg: '#2F281E', text: '#E2C298', border: '#504230' },
  CAT_SHOPPING_PASTA_E_CEREALI: { bg: '#2F291E', text: '#E8CE91', border: '#504630' },
  CAT_SHOPPING_LEGUMI: { bg: '#1E2F23', text: '#A4D5B5', border: '#305039' },
  CAT_SHOPPING_BEVANDE_VEGETALI: { bg: '#292F1E', text: '#BAD4A5', border: '#435030' },
  CAT_SHOPPING_FARINE: { bg: '#2F291E', text: '#D4C3A5', border: '#504530' },
  CAT_SHOPPING_CONSERVE: { bg: '#2F211E', text: '#DEA99B', border: '#503630' },
  CAT_SHOPPING_CONDIMENTI: { bg: '#2F271E', text: '#E8BB91', border: '#503F30' },
  CAT_SHOPPING_SPEZIE_ED_ERBE_AROMATICHE: { bg: '#2F231E', text: '#E3AC97', border: '#503930' },
  CAT_SHOPPING_FRUTTA_SECCA_E_SEMI_OLEOSI: { bg: '#2F281E', text: '#D5BBA5', border: '#504130' },
  CAT_SHOPPING_DOLCIFICANTI: { bg: '#2F1E25', text: '#DA9FBC', border: '#50303F' },
  CAT_SHOPPING_VARIE: { bg: '#262B27', text: '#BCC6BE', border: '#3A423C' },
};

export const DEPARTMENT_FALLBACK_LIGHT: DepartmentColor = { bg: '#EAF0EB', text: '#34523C', border: '#CCE7D4' };
export const DEPARTMENT_FALLBACK_DARK: DepartmentColor = { bg: '#2A3D2E', text: '#9CCBA8', border: '#3C4A3E' };
