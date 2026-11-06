import React, { useState } from 'react';
import { Modal, View, Text, TouchableOpacity, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { RecipeBookModal } from './RecipeBookModal';
import { AISettingsModal } from './AISettingsModal';

type Panel = 'recipeBook' | 'aiSettings' | null;

interface HeaderMenuProps {
  onRecipesChanged: () => void;
}

export function HeaderMenu({ onRecipesChanged }: HeaderMenuProps) {
  const { t, i18n } = useTranslation();
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
        <MaterialCommunityIcons name="chef-hat" size={20} color="#34523C" />
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
                    onPress={() => i18n.changeLanguage(lng)}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.langText, active && styles.langTextActive]}>
                      {lng === 'en' ? '🇬🇧 EN' : '🇮🇹 IT'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.divider} />

            <MenuItem icon="book-outline" label={t('menu.recipeBook')} onPress={() => openPanel('recipeBook')} />
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
  return (
    <TouchableOpacity style={styles.menuItem} onPress={onPress} activeOpacity={0.7}>
      <Ionicons name={icon} size={18} color="#34523C" style={styles.menuItemIcon} />
      <Text style={styles.menuItemText}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  menuBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EAF0EB',
    borderWidth: 1,
    borderColor: '#D4DDD6',
  },
  backdrop: { flex: 1, backgroundColor: 'rgba(26, 46, 31, 0.15)' },
  popup: {
    position: 'absolute',
    width: 240,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    shadowColor: '#1A2E1F',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  sectionLabel: { fontSize: 12, fontWeight: '700', color: '#5E6D60', marginBottom: 8 },
  langRow: { flexDirection: 'row', gap: 8 },
  langBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#EAF0EB',
    borderWidth: 1,
    borderColor: '#D4DDD6',
  },
  langBtnActive: { backgroundColor: '#34523C', borderColor: '#34523C' },
  langText: { fontSize: 13, fontWeight: '700', color: '#34523C' },
  langTextActive: { color: '#FFFFFF' },
  divider: { height: 1, backgroundColor: '#EAF0EB', marginVertical: 12 },
  menuItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  menuItemIcon: { marginRight: 10 },
  menuItemText: { fontSize: 15, fontWeight: '600', color: '#1A2E1F' },
});
