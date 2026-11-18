// Format of the ingredients and out-of-home files: a header with the kind and the version, then the items.
// The recipe book keeps its own format (a plain list of recipes), read by services/catalogFormat.ts.
export const TRANSFER_VERSION = 1;
export const INGREDIENTS_FORMAT = 'green-whisker/ingredients';
export const OUT_OF_HOME_FORMAT = 'green-whisker/out-of-home';
export const READY_MEALS_FORMAT = 'green-whisker/ready-meals';

export interface TransferEnvelope {
  format: string;
  version: number;
  items: unknown[];
}

export function makeEnvelope(format: string, items: unknown[]): TransferEnvelope {
  return { format, version: TRANSFER_VERSION, items };
}

/** Items of a file of the given format. Throws if the text is not JSON or the header does not match. */
export function parseEnvelope(text: string, format: string): unknown[] {
  let data: any;
  try {
    data = JSON.parse(text.replace(/^﻿/, ''));
  } catch {
    throw new Error('transfer_invalid_json');
  }
  if (!data || data.format !== format || data.version !== TRANSFER_VERSION || !Array.isArray(data.items)) {
    throw new Error('transfer_invalid_format');
  }
  return data.items;
}

/** Out-of-home labels: only the non-empty texts, trimmed, without duplicates. */
export function outOfHomeLabelsOf(items: unknown[]): string[] {
  const labels = items
    .filter((item): item is string => typeof item === 'string')
    .map(item => item.trim())
    .filter(Boolean);
  return [...new Set(labels)];
}
