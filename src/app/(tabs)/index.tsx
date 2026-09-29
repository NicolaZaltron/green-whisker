import React, { useState, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  Keyboard
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Recipe } from '../../types/recipe';
import { RecipeCard } from '../../components/RecipeCard';
import { RecipeModal } from '../../components/RecipeModal';
import { PantryView } from '../../components/PantryView';
import { useResponsiveDimensions } from '../../hooks/useResponsiveDimensions';
import { useDebounce } from '../../hooks/useDebounce';
import { searchRecipes } from '../../services/searchService';

const rawRecipes = require('../../../assets/ricette.json') as Recipe[];

const CATEGORIES = [
  'Tutte',
  'Primi piatti',
  'Secondi piatti',
  'Dolci',
  'Contorni e insalate',
  'Lievitati, pane e pizze',
  'Salse e condimenti',
  'Antipasti e snack',
  'Zuppe e vellutate',
  'Colazione e merende',
  'Piatti unici e bowl',
  'Bevande e frullati',
];

const QUICK_TAGS = ['< 30 min', 'Senza Glutine', 'Al forno', 'Senza cottura', 'Facile'];

export default function ExploreScreen() {
  const { width } = useResponsiveDimensions();
  const [viewMode, setViewMode] = useState<'catalog' | 'pantry'>('catalog');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Tutte');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);

  // Debounced search query for butter-smooth typing on mobile
  const debouncedQuery = useDebounce(searchQuery, 150);

  // Filter recipes using Fuse.js fuzzy engine + category + quick tags
  const filteredRecipes = useMemo(() => {
    return searchRecipes(debouncedQuery, selectedCategory, selectedTag);
  }, [debouncedQuery, selectedCategory, selectedTag]);

  // Responsive column count calculation
  const numColumns = useMemo(() => {
    if (width >= 1024) return 3;
    if (width >= 600) return 2;
    return 1;
  }, [width]);

  const toggleTag = (tag: string) => {
    setSelectedTag(prev => (prev === tag ? null : tag));
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.mainWrapper}>
        {/* Header Green-Whisker */}
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <View style={styles.logoBadge}>
              <Image
                source={require('../../../assets/logo.png')}
                style={styles.logoImage}
                contentFit="contain"
              />
            </View>
            <View>
              <Text style={styles.brandTitle}>Green-Whisker</Text>
            </View>
          </View>

          {/* Mode Switcher: Catalogo vs Svuotafrigo */}
          <View style={styles.modeToggleContainer}>
            <TouchableOpacity
              style={[styles.modeToggleBtn, viewMode === 'catalog' && styles.modeToggleBtnActive]}
              onPress={() => setViewMode('catalog')}
              activeOpacity={0.85}
            >
              <Ionicons
                name="book-outline"
                size={14}
                color={viewMode === 'catalog' ? '#FFFFFF' : '#5E6D60'}
                style={{ marginRight: 6 }}
              />
              <Text style={[styles.modeToggleText, viewMode === 'catalog' && styles.modeToggleTextActive]}>
                Tutte le Ricette
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.modeToggleBtn, viewMode === 'pantry' && styles.modeToggleBtnActive]}
              onPress={() => setViewMode('pantry')}
              activeOpacity={0.85}
            >
              <Ionicons
                name="restaurant-outline"
                size={14}
                color={viewMode === 'pantry' ? '#FFFFFF' : '#5E6D60'}
                style={{ marginRight: 6 }}
              />
              <Text style={[styles.modeToggleText, viewMode === 'pantry' && styles.modeToggleTextActive]}>
                Svuotafrigo
              </Text>
            </TouchableOpacity>
          </View>

          {viewMode === 'catalog' && (
            <View style={styles.searchBar}>
              <Ionicons name="search" size={18} color="#7E8B80" style={{ marginRight: 8 }} />
              <TextInput
                style={styles.searchInput}
                placeholder="Cerca per ricetta o ingrediente (es. zucca, pasta)..."
                placeholderTextColor="#8C988F"
                value={searchQuery}
                onChangeText={setSearchQuery}
                returnKeyType="search"
                clearButtonMode="while-editing"
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Ionicons name="close-circle" size={18} color="#7E8B80" />
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        {viewMode === 'catalog' ? (
          <>
            {/* Categories Horizontal Carousel */}
            <View style={styles.categoriesSection}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.categoriesContainer}
              >
                {CATEGORIES.map(cat => {
                  const isSelected = selectedCategory === cat;
                  return (
                    <TouchableOpacity
                      key={cat}
                      style={[styles.categoryChip, isSelected && styles.categoryChipSelected]}
                      onPress={() => setSelectedCategory(cat)}
                      activeOpacity={0.8}
                    >
                      <Text
                        style={[styles.categoryChipText, isSelected && styles.categoryChipTextSelected]}
                      >
                        {cat}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            {/* Quick Tag Filters */}
            <View style={styles.tagsBar}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tagsContainer}>
                {QUICK_TAGS.map(tag => {
                  const isSelected = selectedTag === tag;
                  return (
                    <TouchableOpacity
                      key={tag}
                      style={[styles.tagPill, isSelected && styles.tagPillSelected]}
                      onPress={() => toggleTag(tag)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.tagPillText, isSelected && styles.tagPillTextSelected]}>
                        {tag}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            {/* Results Counter */}
            <View style={styles.counterRow}>
              <Text style={styles.counterText}>
                {filteredRecipes.length} {filteredRecipes.length === 1 ? 'ricetta trovata' : 'ricette trovate'}
              </Text>
            </View>

            {/* Recipes Grid */}
            <FlatList
              key={`grid-cols-${numColumns}`}
              data={filteredRecipes}
              keyExtractor={item => item.id}
              numColumns={numColumns}
              columnWrapperStyle={numColumns > 1 ? styles.columnWrapper : undefined}
              contentContainerStyle={styles.listContent}
              keyboardShouldPersistTaps="handled"
              onScrollBeginDrag={Keyboard.dismiss}
              initialNumToRender={8}
              maxToRenderPerBatch={10}
              windowSize={7}
              removeClippedSubviews={true}
              renderItem={({ item }) => (
                <View style={numColumns > 1 ? styles.gridItem : styles.fullWidthItem}>
                  <RecipeCard
                    recipe={item}
                    onPress={() => setSelectedRecipe(item)}
                  />
                </View>
              )}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Ionicons name="search-outline" size={48} color="#A3B2A6" />
                  <Text style={styles.emptyTitle}>Nessuna ricetta trovata</Text>
                  <Text style={styles.emptySubtitle}>
                    Prova a cercare con un altro ingrediente o rimuovi i filtri selezionati.
                  </Text>
                </View>
              }
            />
          </>
        ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 60 }}
          >
            <PantryView onSelectRecipe={setSelectedRecipe} />
          </ScrollView>
        )}

        {/* Modal Dettaglio Ricetta */}
        <RecipeModal
          recipe={selectedRecipe}
          visible={!!selectedRecipe}
          onClose={() => setSelectedRecipe(null)}
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
    maxWidth: 1200,
    alignSelf: 'center',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    gap: 12,
  },
  logoBadge: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#EAF0EB',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 5,
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  brandTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#243328',
    letterSpacing: -0.5,
  },
  brandSubtitle: {
    fontSize: 12,
    fontWeight: '500',
    color: '#718073',
  },
  modeToggleContainer: {
    flexDirection: 'row',
    backgroundColor: '#ECE7DF',
    borderRadius: 14,
    padding: 3,
    marginBottom: 12,
  },
  modeToggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 11,
  },
  modeToggleBtnActive: {
    backgroundColor: '#34523C',
    shadowColor: '#1A2E1F',
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 2,
  },
  modeToggleText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#556658',
  },
  modeToggleTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 46,
    borderWidth: 1,
    borderColor: '#ECE7DF',
    shadowColor: '#1A2E1F',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 5,
    elevation: 2,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#2B332B',
  },
  categoriesSection: {
    marginTop: 6,
    marginBottom: 4,
  },
  categoriesContainer: {
    paddingHorizontal: 20,
    gap: 8,
    paddingVertical: 4,
  },
  categoryChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EFEBE4',
  },
  categoryChipSelected: {
    backgroundColor: '#4A6B53',
    borderColor: '#4A6B53',
  },
  categoryChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#657367',
  },
  categoryChipTextSelected: {
    color: '#FFFFFF',
  },
  tagsBar: {
    marginBottom: 6,
  },
  tagsContainer: {
    paddingHorizontal: 20,
    gap: 6,
    paddingVertical: 4,
  },
  tagPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#F3EFE8',
  },
  tagPillSelected: {
    backgroundColor: '#D97757',
  },
  tagPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6E786F',
  },
  tagPillTextSelected: {
    color: '#FFFFFF',
  },
  counterRow: {
    paddingHorizontal: 20,
    paddingVertical: 6,
  },
  counterText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8A998D',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  columnWrapper: {
    gap: 16,
  },
  gridItem: {
    flex: 1,
  },
  fullWidthItem: {
    width: '100%',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#2B332B',
    marginTop: 14,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#7E8B80',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },
});
