import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CircleButton } from './CircleButton';
import { SettingsModal } from './SettingsModal';

// Header gear button that opens the settings page; same button on every screen
export function SettingsButton({ onRecipesChanged }: { onRecipesChanged?: () => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <>
      <CircleButton size="L" variant="plain" icon="settings-outline" onPress={() => setOpen(true)} accessibilityLabel={t('menu.settings')} />
      <SettingsModal visible={open} onClose={() => setOpen(false)} onRecipesChanged={onRecipesChanged} />
    </>
  );
}
