import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TouchableOpacity,
  TextInput
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, router } from 'expo-router';
import { ShoppingItem } from '../../types/recipe';
import {
  getShoppingItems,
  toggleShoppingItem,
  deleteShoppingItem,
  clearCheckedShoppingItems,
  clearAllShoppingItems,
  addShoppingItems
} from '../../db/database';
import { cleanShoppingIngredientText } from '../../utils/servingsScaler';

export default function ShoppingScreen() {
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [newItemText, setNewItemText] = useState('');

  const loadItems = async () => {
    const list = await getShoppingItems();
    setItems(list);
  };

  useFocusEffect(
    useCallback(() => {
      loadItems();
    }, [])
  );

  const completedCount = useMemo(() => items.filter(i => i.checked).length, [items]);

  const handleToggle = async (id: string) => {
    await toggleShoppingItem(id);
    loadItems();
  };

  const handleDelete = async (id: string) => {
    await deleteShoppingItem(id);
    loadItems();
  };

  const handleClearCompleted = async () => {
    await clearCheckedShoppingItems();
    loadItems();
  };

  const handleClearAll = async () => {
    await clearAllShoppingItems();
    loadItems();
  };

  const handleAddManual = async () => {
    const trimmed = newItemText.trim();
    if (!trimmed) return;
    await addShoppingItems([
      {
        ingredientText: trimmed,
        name: trimmed,
        category: 'Spesa Libera'
      }
    ]);
    setNewItemText('');
    loadItems();
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.mainWrapper}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <View style={styles.iconBadge}>
              <Ionicons name="cart" size={20} color="#4A6B53" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Lista della Spesa</Text>
              <Text style={styles.subtitle}>
                {items.length === 0
                  ? 'Nessun ingrediente in lista'
                  : `${completedCount} di ${items.length} completati`}
              </Text>
            </View>

            {items.length > 0 && (
              <View style={styles.headerActions}>
                {completedCount > 0 && (
                  <TouchableOpacity
                    style={styles.headerActionBtn}
                    onPress={handleClearCompleted}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="checkbox-outline" size={16} color="#4A6B53" />
                    <Text style={styles.headerActionText}>Rimuovi spuntati</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[styles.headerActionBtn, { borderColor: '#EBDAD5' }]}
                  onPress={handleClearAll}
                  activeOpacity={0.7}
                >
                  <Ionicons name="trash-outline" size={16} color="#D9534F" />
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Quick manual item adder */}
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              placeholder="Aggiungi altro (es. Olio, Pane, Caffè)..."
              placeholderTextColor="#8C988F"
              value={newItemText}
              onChangeText={setNewItemText}
              onSubmitEditing={handleAddManual}
              returnKeyType="done"
            />
            <TouchableOpacity
              style={[styles.addBtn, !newItemText.trim() && styles.addBtnDisabled]}
              onPress={handleAddManual}
              disabled={!newItemText.trim()}
              activeOpacity={0.8}
            >
              <Ionicons name="add" size={20} color="#FFF" />
            </TouchableOpacity>
          </View>
        </View>

        {/* List of items */}
        <FlatList
          data={items}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <View style={[styles.itemCard, item.checked && styles.itemCardChecked]}>
              <TouchableOpacity
                style={styles.checkArea}
                onPress={() => handleToggle(item.id)}
                activeOpacity={0.7}
              >
                <View style={[styles.checkbox, item.checked && styles.checkboxChecked]}>
                  {item.checked && <Ionicons name="checkmark" size={14} color="#FFF" />}
                </View>
                <View style={styles.itemContent}>
                  <Text style={[styles.itemText, item.checked && styles.itemTextChecked]}>
                    {cleanShoppingIngredientText(item.ingredient_text, item.name)}
                  </Text>
                  {item.recipe_title && (
                    <Text style={styles.itemRecipe}>Da: {item.recipe_title}</Text>
                  )}
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.deleteBtn}
                onPress={() => handleDelete(item.id)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                activeOpacity={0.7}
              >
                <Ionicons name="close" size={18} color="#A3B2A6" />
              </TouchableOpacity>
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconCircle}>
                <Ionicons name="basket-outline" size={42} color="#4A6B53" />
              </View>
              <Text style={styles.emptyTitle}>La tua spesa è vuota</Text>
              <Text style={styles.emptySubtitle}>
                Aggiungi ingredienti premendo "Aggiungi alla Spesa" all'interno di qualsiasi ricetta o pianificando i pasti nel Meal Planner.
              </Text>
              <TouchableOpacity
                style={styles.exploreBtn}
                onPress={() => router.push('/(tabs)')}
                activeOpacity={0.8}
              >
                <Ionicons name="compass-outline" size={18} color="#FFF" />
                <Text style={styles.exploreBtnText}>Scegli una ricetta</Text>
              </TouchableOpacity>
            </View>
          }
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FBF9F5',
  },
  mainWrapper: {
    flex: 1,
    width: '100%',
    maxWidth: 900,
    alignSelf: 'center',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  iconBadge: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#EAF0EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#243328',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '500',
    color: '#718073',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  headerActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ECE7DF',
  },
  headerActionText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4A6B53',
  },
  inputRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  input: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 44,
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#ECE7DF',
    color: '#2B332B',
  },
  addBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#4A6B53',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnDisabled: {
    backgroundColor: '#C2CDC4',
    opacity: 0.6,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    paddingTop: 4,
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#EFEBE4',
  },
  itemCardChecked: {
    backgroundColor: '#F8F9F8',
    opacity: 0.6,
  },
  checkArea: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#BDC7BE',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  checkboxChecked: {
    backgroundColor: '#4A6B53',
    borderColor: '#4A6B53',
  },
  itemContent: {
    flex: 1,
  },
  itemText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2B332B',
  },
  itemTextChecked: {
    textDecorationLine: 'line-through',
    color: '#8A998D',
  },
  itemRecipe: {
    fontSize: 11,
    color: '#7E8B80',
    marginTop: 2,
  },
  deleteBtn: {
    padding: 6,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 70,
    paddingHorizontal: 30,
  },
  emptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#EAF0EB',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2B332B',
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#7E8B80',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  exploreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4A6B53',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 14,
    gap: 8,
    shadowColor: '#4A6B53',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  exploreBtnText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
