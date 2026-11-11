import React, { useMemo, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../context/ThemeContext';
import { saveLanguage } from '../services/preferencesService';
import type { Palette } from '../theme/palette';
import { RecipeBookModal } from './RecipeBookModal';
import { AISettingsModal } from './AISettingsModal';
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
  // Stessa colonna centrale di 1200px del resto dell'app: il popup resta dentro di essa anche su web
  const { width } = useWindowDimensions();
  const popupRight = Math.max((width - 1200) / 2, 0) + 16;
  const [menuOpen, setMenuOpen] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const isEnglish = i18n.language?.startsWith('en');

  const openPanel = (next: Exclude<Panel, null>) => {
    setMenuOpen(false);
    setPanel(next);
  };

  return (
    <>
      {/* Easter egg: cappello da chef, visto che è un'app di ricette */}
      <TouchableOpacity
        style={styles.menuBtn}
        onPress={() => setMenuOpen(true)}
        activeOpacity={0.8}
        accessibilityLabel={t('menu.open')}
      >
        <MaterialCommunityIcons name="chef-hat" size={20} color={colors.primaryText} />
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
          </View>
        </View>
      </Modal>

      <RecipeBookModal
        visible={panel === 'recipeBook'}
        onClose={() => setPanel(null)}
        onChanged={onRecipesChanged}
      />
      <AISettingsModal visible={panel === 'aiSettings'} onClose={() => setPanel(null)} />
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
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <TouchableOpacity style={styles.menuItem} onPress={onPress} activeOpacity={0.7}>
      <Ionicons name={icon} size={18} color={colors.primaryText} style={styles.menuItemIcon} />
      <Text style={styles.menuItemText}>{label}</Text>
    </TouchableOpacity>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  menuBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.borderStrong,
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
