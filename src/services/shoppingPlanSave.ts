export type ShoppingSelectionRow = {
  name: string;
  unit: string;
  amount: number | null;
  sourceLabel?: string;
};

export type ShoppingInput = {
  recipeId?: string;
  recipeTitle?: string;
  ingredientText: string;
  name: string;
  amount: number | null;
  unit: string;
};

/** Pure: validates the selection and builds the exact items passed to addShoppingItems. */
export function buildShoppingInputs(selection: ShoppingSelectionRow[]): ShoppingInput[] {
  const seen = new Set<string>();
  const out: ShoppingInput[] = [];
  for (const row of selection) {
    const name = (row.name ?? '').trim();
    const amount = row.amount;
    if (amount !== null && (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0)) {
      throw new Error(`invalid_amount: ${name || String(row.name)}`);
    }
    if (!name || amount === 0) continue;
    const unit = (row.unit ?? '').trim();
    const key = `${name.toLowerCase()}|${unit.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const ingredientText = (amount === null ? name : `${amount} ${unit} ${name}`)
      .replace(/\s+/g, ' ')
      .trim();
    const label = row.sourceLabel?.trim();
    out.push({
      recipeId: undefined,
      recipeTitle: label ? label : undefined,
      ingredientText,
      name,
      amount,
      unit,
    });
  }
  return out;
}

export async function saveShoppingSelection(selection: ShoppingSelectionRow[]): Promise<number> {
  const inputs = buildShoppingInputs(selection);
  if (inputs.length === 0) return 0;
  const { addShoppingItems } = await import('../db/database');
  await addShoppingItems(inputs);
  return inputs.length;
}
