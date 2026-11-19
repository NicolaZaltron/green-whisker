import React from 'react';
import { SettingsButton } from './ui/SettingsButton';

// Kept for the home header: it now just renders the shared settings button
export function HeaderMenu({ onRecipesChanged }: { onRecipesChanged?: () => void }) {
  return <SettingsButton onRecipesChanged={onRecipesChanged} />;
}
