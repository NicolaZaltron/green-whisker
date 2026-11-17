import React, { useMemo, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../context/ThemeContext';
import { saveLanguage } from '../services/preferencesService';
import { clearAISettings } from '../services/settingsService';
import { resetAllData } from '../db/database';
import type { Palette } from '../theme/palette';
import { RecipeBookModal } from './RecipeBookModal';
import { AISettingsModal } from './AISettingsModal';
import { ConfirmModal } from './ui/ConfirmModal';
import IngredientsModal from './IngredientsModal';

type Panel = 'recipeBook' | 'aiSettings' | 'ingredients' | null;

interface HeaderMenuProps {
  onRecipesChanged: () => void;
}

export function HeaderMenu({ onRecipesChanged }: HeaderMenuProps) {
  const { t, i18n } = useTranslation();
  const { mode: themeMode, setMode: setThemeMode, colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  // Same 1200px central column as the rest of the app: the popup stays inside it even on web
  const { width } = useWindowDimensions();
  const popupRight = Math.max((width - 1200) / 2, 0) + 16;
  const [menuOpen, setMenuOpen] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const isEnglish = i18n.language?.startsWith('en');

  const openPanel = (next: Exclude<Panel, null>) => {
    setMenuOpen(false);
    setPanel(next);
  };

  // Deletion of all data (to start over): explicit confirmation, then manual restart
  const [resetState, setResetState] = useState<'confirm' | 'done' | 'error' | null>(null);
  const confirmReset = () => {
    setMenuOpen(false);
    setResetState('confirm');
  };

  const runReset = async () => {
    try {
      await resetAllData();
      await clearAISettings();
      setResetState('done');
    } catch (e) {
      console.error('resetAllData error', e);
      setResetState('error');
    }
  };

  return (
    <>
      {/* Easter egg: chef hat, since it is a recipe app */}
      <TouchableOpacity
        style={styles.menuBtn}
        onPress={() => setMenuOpen(true)}
        activeOpacity={0.8}
        accessibilityLabel={t('menu.open')}
      >
        <MaterialCommunityIcons name="chef-hat" size={22} color={colors.text} />
      </TouchableOpacity>

      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <View style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setMenuOpen(false)} />
          <View style={[styles.popup, { top: insets.top + 56, right: popupRight }]}>
            <Text style={styles.sectionLabel}>{t('menu.language')}</Text>
            <View style={styles.langRow}>
              {(['it', 'en'] as const).map(lng => {
                const active = (lng === 'en') === !!isEnglish;
                return (
                  <TouchableOpacity
                    key={lng}
                    style={[styles.langBtn, active && styles.langBtnActive]}
                    onPress={() => {
                      i18n.changeLanguage(lng);
                      saveLanguage(lng).catch(e => console.warn('Impossibile salvare la lingua', e));
                    }}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.langText, active && styles.langTextActive]}>
                      {lng === 'en' ? '🇬🇧 EN' : '🇮🇹 IT'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.sectionLabel}>{t('menu.theme')}</Text>
            <View style={styles.langRow}>
              {(['light', 'dark', 'system'] as const).map(option => {
                const active = themeMode === option;
                return (
                  <TouchableOpacity
                    key={option}
                    style={[styles.langBtn, active && styles.langBtnActive]}
                    onPress={() => setThemeMode(option)}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.langText, active && styles.langTextActive]}>
                      {t(`menu.theme_${option}`)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.divider} />

            <MenuItem icon="book-outline" label={t('menu.recipeBook')} onPress={() => openPanel('recipeBook')} />
            <MenuItem icon="nutrition-outline" label={t('ingredients.menuItem')} onPress={() => openPanel('ingredients')} />
            <MenuItem icon="key-outline" label={t('menu.aiSettings')} onPress={() => openPanel('aiSettings')} />
            <MenuItem icon="trash-outline" label={t('menu.resetData')} onPress={confirmReset} danger />
          </View>
        </View>
      </Modal>

      <RecipeBookModal
        visible={panel === 'recipeBook'}
        onClose={() => setPanel(null)}
        onChanged={onRecipesChanged}
      />
      <AISettingsModal visible={panel === 'aiSettings'} onClose={() => setPanel(null)} />

      <ConfirmModal
        visible={resetState === 'confirm'}
        icon="trash-outline"
        title={t('menu.resetDataTitle')}
        body={t('menu.resetDataBody')}
        confirmLabel={t('menu.resetDataConfirm')}
        onConfirm={runReset}
        cancelLabel={t('common.cancel')}
        onCancel={() => setResetState(null)}
      />
      <ConfirmModal
        visible={resetState === 'done' || resetState === 'error'}
        icon={resetState === 'error' ? 'alert-circle-outline' : 'checkmark-circle-outline'}
        title={t('menu.resetDataTitle')}
        body={resetState === 'error' ? t('errors.somethingWentWrong') : t('menu.resetDataDone')}
        confirmLabel={t('common.close')}
        onConfirm={() => setResetState(null)}
        destructive={false}
      />
      <IngredientsModal
        visible={panel === 'ingredients'}
        onClose={() => setPanel(null)}
        onChanged={onRecipesChanged}
      />
    </>
  );
}

function MenuItem({
  icon,
  label,
  onPress,
  danger = false,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  danger?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const color = danger ? colors.danger : colors.primaryText;
  return (
    <TouchableOpacity style={styles.menuItem} onPress={onPress} activeOpacity={0.7}>
      <Ionicons name={icon} size={18} color={color} style={styles.menuItemIcon} />
      <Text style={[styles.menuItemText, danger && { color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  menuBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    // Same shadow as HeaderIconButton (ScreenHeader): the visual edge of the other header buttons
    shadowColor: colors.shadow,
    shadowOpacity: 0.14,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  backdrop: { flex: 1, backgroundColor: colors.overlay },
  popup: {
    position: 'absolute',
    width: 240,
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 14,
    shadowColor: colors.shadow,
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  sectionLabel: { fontSize: 12, fontWeight: '700', color: colors.textSecondary, marginBottom: 8 },
  langRow: { flexDirection: 'row', gap: 8 },
  langBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  langBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  langText: { fontSize: 13, fontWeight: '700', color: colors.primaryText },
  langTextActive: { color: colors.onPrimary },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 12 },
  menuItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  menuItemIcon: { marginRight: 10 },
  menuItemText: { fontSize: 15, fontWeight: '600', color: colors.text },
});
