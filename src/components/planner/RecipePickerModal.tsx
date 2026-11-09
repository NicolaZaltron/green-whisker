import React, { useState, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Modal,
  TextInput,
  FlatList,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Recipe } from '../../types/recipe';
import {
  type MealSlot,
  SLOT_ICONS,
  getRecipesForSlot,
  isAuthenticSideDish,
} from '../../services/plannerService';
import { useTheme } from '../../context/ThemeContext';
import type { Palette } from '../../theme/palette';

export interface RecipePickerModalProps {
  visible: boolean;
  targetSlot: MealSlot;
  targetType: 'main' | 'side';
  allRecipes: Recipe[];
  onSelect: (recipe: Recipe) => void;
  onClose: () => void;
}

/**
 * Filterable drawer modal to pick a main dish or side dish for a meal slot.
 */
export const RecipePickerModal: React.FC<RecipePickerModalProps> = ({
  visible,
  targetSlot,
  targetType,
  allRecipes,
  onSelect,
  onClose,
}) => {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [query, setQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'recommended' | 'all'>('recommended');

  const filteredRecipes = useMemo(() => {
    let pool: Recipe[];

    if (targetType === 'side') {
      pool = allRecipes.filter(isAuthenticSideDish);
    } else if (filterMode === 'recommended') {
      const slotRecs = getRecipesForSlot(targetSlot);
      const customSlot = allRecipes.filter(
        r => r.id.startsWith('custom-') &&
        ((r.recommended_slot as any) === targetSlot || (r.recommended_slot as any) === 'pranzo_cena')
      );
      pool = [...slotRecs, ...customSlot];
    } else {
      pool = allRecipes;
    }

    // Deduplicate by ID to prevent duplicate key errors
    const seen = new Set<string>();
    const uniquePool = pool.filter(r => {
      if (!r || !r.id || seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    });

    if (!query.trim()) return uniquePool;
    const q = query.toLowerCase().trim();
    return uniquePool.filter(r =>
      r.title.toLowerCase().includes(q) ||
      r.category.toLowerCase().includes(q) ||
      (r.tags && r.tags.some(t => t.toLowerCase().includes(q)))
    );
  }, [allRecipes, targetType, filterMode, targetSlot, query]);

  const handleClose = () => {
    setQuery('');
    setFilterMode('recommended');
    onClose();
  };

  const handleSelect = (recipe: Recipe) => {
    setQuery('');
    setFilterMode('recommended');
    onSelect(recipe);
  };

  const recommendedCount = useMemo(() => {
    let pool: Recipe[];
    if (targetType === 'side') {
      pool = allRecipes.filter(isAuthenticSideDish);
    } else {
      const slotRecs = getRecipesForSlot(targetSlot);
      const customSlot = allRecipes.filter(
        r => r.id.startsWith('custom-') &&
        ((r.recommended_slot as any) === targetSlot || (r.recommended_slot as any) === 'pranzo_cena')
      );
      pool = [...slotRecs, ...customSlot];
    }

    const seen = new Set<string>();
    return pool.filter(r => {
      if (!r || !r.id || seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    }).length;
  }, [allRecipes, targetType, targetSlot]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <SafeAreaView style={styles.pickerSafeArea} edges={['top', 'bottom', 'left', 'right']}>
        <View style={styles.pickerHeader}>
          <TouchableOpacity style={styles.pickerCloseBtn} onPress={handleClose}>
            <Ionicons name="close" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.pickerHeaderTitle}>
            {targetType === 'side'
              ? t('planner.pickerModal.chooseSide')
              : t('planner.pickerModal.planForSlot', { slot: t(`planner.slots.${targetSlot}`) })}
          </Text>
          <View style={{ width: 36 }} />
        </View>

        {/* Filter pills: Recommended vs All */}
        <View style={styles.pickerFilterBar}>
          <TouchableOpacity
            style={[
              styles.pickerFilterChip,
              filterMode === 'recommended' && styles.pickerFilterChipActive,
            ]}
            onPress={() => setFilterMode('recommended')}
            activeOpacity={0.7}
          >
            <Ionicons
              name={targetType === 'side' ? 'leaf-outline' : (SLOT_ICONS[targetSlot] as any)}
              size={14}
              color={filterMode === 'recommended' ? colors.onPrimary : colors.primaryText}
              style={{ marginRight: 5 }}
            />
            <Text
              style={[
                styles.pickerFilterChipText,
                filterMode === 'recommended' && styles.pickerFilterChipTextActive,
              ]}
            >
              {t('planner.pickerModal.recommended', { count: recommendedCount })}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.pickerFilterChip,
              filterMode === 'all' && styles.pickerFilterChipActive,
            ]}
            onPress={() => setFilterMode('all')}
            activeOpacity={0.7}
          >
            <Ionicons
              name="restaurant-outline"
              size={14}
              color={filterMode === 'all' ? colors.onPrimary : colors.textMuted}
              style={{ marginRight: 5 }}
            />
            <Text
              style={[
                styles.pickerFilterChipText,
                filterMode === 'all' && styles.pickerFilterChipTextActive,
              ]}
            >
              {t('planner.pickerModal.all', { count: allRecipes.length })}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.pickerSearch}>
          <Ionicons name="search" size={18} color={colors.textMuted} style={{ marginRight: 8 }} />
          <TextInput
            style={styles.pickerInput}
            placeholder={
              targetType === 'side'
                ? t('planner.pickerModal.searchSidePlaceholder')
                : t('planner.pickerModal.searchSlotPlaceholder', { slot: t(`planner.slots.${targetSlot}`).toLowerCase() })
            }
            placeholderTextColor={colors.textMuted}
            value={query}
            onChangeText={setQuery}
            autoFocus
          />
        </View>

        <FlatList
          data={filteredRecipes}
          keyExtractor={(item, index) => `${item.id}-${index}`}
          contentContainerStyle={{ padding: 16 }}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={10}
          maxToRenderPerBatch={12}
          windowSize={5}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.pickerItem}
              onPress={() => handleSelect(item)}
              activeOpacity={0.7}
            >
              {item.image ? (
                <Image
                  source={{ uri: item.image }}
                  style={styles.pickerThumb}
                  contentFit="cover"
                  cachePolicy="disk"
                />
              ) : (
                <View style={[styles.pickerThumb, { backgroundColor: colors.surfaceMuted }]} />
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.pickerItemCat}>{t('categories.' + item.category, { defaultValue: item.category })}</Text>
                <Text style={styles.pickerItemTitle} numberOfLines={2}>{item.title}</Text>
                <Text style={styles.pickerItemMeta}>
                  {item.times?.total_minutes || 30} min • {t('common.servings', { count: item.servings || 4 })}
                </Text>
              </View>
              <Ionicons name="add-circle" size={24} color={colors.primaryText} />
            </TouchableOpacity>
          )}
        />
      </SafeAreaView>
    </Modal>
  );
};

const makeStyles = (colors: Palette) => StyleSheet.create({
  pickerSafeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  pickerHeader: {
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pickerCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerHeaderTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  pickerFilterBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 2,
    gap: 8,
  },
  pickerFilterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pickerFilterChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  pickerFilterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  pickerFilterChipTextActive: {
    color: colors.onPrimary,
    fontWeight: '700',
  },
  pickerSearch: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    marginHorizontal: 16,
    marginVertical: 12,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pickerInput: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
  },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
  },
  pickerThumb: {
    width: 50,
    height: 50,
    borderRadius: 10,
  },
  pickerItemCat: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.primaryText,
    textTransform: 'uppercase',
  },
  pickerItemTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    marginTop: 1,
  },
  pickerItemMeta: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
});
