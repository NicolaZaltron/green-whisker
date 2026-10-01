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
  SLOT_LABELS,
  SLOT_ICONS,
  getRecipesForSlot,
} from '../../services/plannerService';

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
  const [query, setQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'recommended' | 'all'>('recommended');

  const filteredRecipes = useMemo(() => {
    let pool: Recipe[];

    if (targetType === 'side') {
      pool = allRecipes.filter(r =>
        r.categoria === 'Verdure e Contorni' ||
        r.categoria === 'Contorni e insalate' ||
        (r.tags && r.tags.includes('Contorni'))
      );
    } else if (filterMode === 'recommended') {
      const slotRecs = getRecipesForSlot(targetSlot);
      const customSlot = allRecipes.filter(
        r => r.id.startsWith('custom-') &&
        (r.slot_consigliato === targetSlot || r.slot_consigliato === 'pranzo_cena')
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
      r.titolo.toLowerCase().includes(q) ||
      r.categoria.toLowerCase().includes(q) ||
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
      pool = allRecipes.filter(
        r => r.categoria === 'Verdure e Contorni' ||
        r.categoria === 'Contorni e insalate' ||
        (r.tags && r.tags.includes('Contorni'))
      );
    } else {
      const slotRecs = getRecipesForSlot(targetSlot);
      const customSlot = allRecipes.filter(
        r => r.id.startsWith('custom-') &&
        (r.slot_consigliato === targetSlot || r.slot_consigliato === 'pranzo_cena')
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
            <Ionicons name="close" size={24} color="#2B332B" />
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
              color={filterMode === 'recommended' ? '#FFF' : '#4A6B53'}
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
              color={filterMode === 'all' ? '#FFF' : '#7E8B80'}
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
          <Ionicons name="search" size={18} color="#7E8B80" style={{ marginRight: 8 }} />
          <TextInput
            style={styles.pickerInput}
            placeholder={
              targetType === 'side'
                ? t('planner.pickerModal.searchSidePlaceholder')
                : t('planner.pickerModal.searchSlotPlaceholder', { slot: t(`planner.slots.${targetSlot}`).toLowerCase() })
            }
            placeholderTextColor="#8C988F"
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
              {item.immagine ? (
                <Image
                  source={{ uri: item.immagine }}
                  style={styles.pickerThumb}
                  contentFit="cover"
                  cachePolicy="disk"
                />
              ) : (
                <View style={[styles.pickerThumb, { backgroundColor: '#EAE5DC' }]} />
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.pickerItemCat}>{item.categoria}</Text>
                <Text style={styles.pickerItemTitle} numberOfLines={2}>{item.titolo}</Text>
                <Text style={styles.pickerItemMeta}>
                  {item.tempi?.tempo_totale_minuti || 30} min • {t('common.servings', { count: item.porzioni || 4 })}
                </Text>
              </View>
              <Ionicons name="add-circle" size={24} color="#4A6B53" />
            </TouchableOpacity>
          )}
        />
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  pickerSafeArea: {
    flex: 1,
    backgroundColor: '#FBF9F5',
  },
  pickerHeader: {
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#ECE7DF',
  },
  pickerCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#EAE5DC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerHeaderTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2B332B',
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
    backgroundColor: '#EFECE6',
    borderWidth: 1,
    borderColor: '#ECE7DF',
  },
  pickerFilterChipActive: {
    backgroundColor: '#4A6B53',
    borderColor: '#4A6B53',
  },
  pickerFilterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#657367',
  },
  pickerFilterChipTextActive: {
    color: '#FFF',
    fontWeight: '700',
  },
  pickerSearch: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginVertical: 12,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
    borderWidth: 1,
    borderColor: '#ECE7DF',
  },
  pickerInput: {
    flex: 1,
    fontSize: 14,
    color: '#2B332B',
  },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#ECE7DF',
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
    color: '#4A6B53',
    textTransform: 'uppercase',
  },
  pickerItemTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2B332B',
    marginTop: 1,
  },
  pickerItemMeta: {
    fontSize: 11,
    color: '#7E8B80',
    marginTop: 2,
  },
});
