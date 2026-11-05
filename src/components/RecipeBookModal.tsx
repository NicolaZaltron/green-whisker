import React, { useEffect, useMemo, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, ActivityIndicator, FlatList, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Recipe } from '../types/recipe';
import { getCustomRecipes } from '../db/database';
import { exportRecipeBook, importRecipeBook } from '../services/recipeBookService';
import { catalogRecipes } from '../services/recipeCatalog';

interface RecipeBookModalProps {
  visible: boolean;
  onClose: () => void;
  onChanged: () => void;
}

type Scope = 'all' | 'personal';

export function RecipeBookModal({ visible, onClose, onChanged }: RecipeBookModalProps) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);
  const [scope, setScope] = useState<Scope>('all');
  const [personalRecipes, setPersonalRecipes] = useState<Recipe[]>([]);
  // Copia del catalogo condiviso, aggiornata dopo ogni import (l'array originale cambia sul posto)
  const [allRecipes, setAllRecipes] = useState<Recipe[]>([]);
  // Si memorizzano le deselezionate: per default sono tutte selezionate
  const [deselectedIds, setDeselectedIds] = useState<Set<string>>(new Set());

  const listed = scope === 'all' ? allRecipes : personalRecipes;
  const selected = useMemo(() => listed.filter(r => !deselectedIds.has(r.id)), [listed, deselectedIds]);

  const refreshLists = () => getCustomRecipes().then(personal => {
    setPersonalRecipes(personal);
    setAllRecipes([...catalogRecipes]);
  });

  useEffect(() => {
    if (visible) refreshLists();
  }, [visible]);

  const close = () => {
    setMessage('');
    onClose();
  };

  const showStatus = (text: string, error = false) => {
    setMessage(text);
    setIsError(error);
  };

  const changeScope = (next: Scope) => {
    setScope(next);
    setDeselectedIds(new Set());
  };

  const toggleRecipe = (id: string) => {
    setDeselectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleExport = async () => {
    setBusy(true);
    try {
      const count = await exportRecipeBook(selected);
      showStatus(t('recipeBook.exported', { count }));
    } catch (e) {
      console.warn('Esportazione ricettario fallita', e);
      showStatus(t('common.error'), true);
    } finally {
      setBusy(false);
    }
  };

  const handleImport = async () => {
    setBusy(true);
    try {
      const result = await importRecipeBook();
      if (!result) return;
      showStatus(t('recipeBook.imported', {
        imported: result.imported,
        updated: result.updated,
        invalid: result.invalid,
      }));
      await refreshLists();
      onChanged();
    } catch (e) {
      console.warn('Importazione ricettario fallita', e);
      showStatus(t('recipeBook.invalidFile'), true);
    } finally {
      setBusy(false);
    }
  };

  const renderItem = ({ item }: { item: Recipe }) => {
    const checked = !deselectedIds.has(item.id);
    return (
      <TouchableOpacity style={styles.row} onPress={() => toggleRecipe(item.id)} activeOpacity={0.7}>
        <Ionicons
          name={checked ? 'checkbox' : 'square-outline'}
          size={22}
          color={checked ? '#34523C' : '#8A9A8D'}
        />
        <Text style={styles.rowTitle} numberOfLines={1}>{item.title}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom', 'left', 'right']}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('recipeBook.title')}</Text>
          <TouchableOpacity onPress={close} hitSlop={12} accessibilityLabel={t('common.close')}>
            <Ionicons name="close" size={24} color="#34523C" />
          </TouchableOpacity>
        </View>

        <View style={styles.content}>
          <Text style={styles.description}>{t('recipeBook.description')}</Text>

          <View style={styles.scopeRow}>
            {(['all', 'personal'] as const).map(value => {
              const active = scope === value;
              return (
                <TouchableOpacity
                  key={value}
                  style={[styles.scopeBtn, active && styles.scopeBtnActive]}
                  onPress={() => changeScope(value)}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.scopeText, active && styles.scopeTextActive]}>
                    {value === 'all' ? t('recipeBook.scopeAll') : t('recipeBook.scopePersonal')}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.selectionRow}>
            <Text style={styles.selectionCount}>
              {t('recipeBook.selectedCount', { selected: selected.length, total: listed.length })}
            </Text>
            <TouchableOpacity
              onPress={() => setDeselectedIds(deselectedIds.size === 0 ? new Set(listed.map(r => r.id)) : new Set())}
              hitSlop={8}
            >
              <Text style={styles.selectionToggle}>
                {deselectedIds.size === 0 ? t('recipeBook.deselectAll') : t('recipeBook.selectAll')}
              </Text>
            </TouchableOpacity>
          </View>

          <FlatList
            style={styles.list}
            data={listed}
            keyExtractor={item => item.id}
            renderItem={renderItem}
            initialNumToRender={20}
            ListEmptyComponent={
              scope === 'personal' ? <Text style={styles.empty}>{t('recipeBook.noPersonal')}</Text> : null
            }
          />

          <TouchableOpacity
            style={[styles.primaryBtn, (busy || selected.length === 0) && styles.disabledBtn]}
            onPress={handleExport}
            disabled={busy || selected.length === 0}
            activeOpacity={0.85}
          >
            <Ionicons name="share-outline" size={18} color="#FFFFFF" style={styles.btnIcon} />
            <Text style={styles.primaryBtnText}>{t('recipeBook.exportSelected', { count: selected.length })}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryBtn} onPress={handleImport} disabled={busy} activeOpacity={0.85}>
            <Ionicons name="folder-open-outline" size={18} color="#34523C" style={styles.btnIcon} />
            <Text style={styles.secondaryBtnText}>{t('recipeBook.import')}</Text>
          </TouchableOpacity>

          {busy ? <ActivityIndicator color="#34523C" style={styles.busy} /> : null}
          {message ? (
            <Text style={[styles.message, isError && styles.messageError]}>{message}</Text>
          ) : null}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F7F9F6' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  title: { fontSize: 20, fontWeight: '800', color: '#1A2E1F' },
  content: { flex: 1, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
  description: { fontSize: 14, color: '#5E6D60', lineHeight: 20, marginBottom: 16 },
  scopeRow: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: 14,
    backgroundColor: '#EAF0EB',
  },
  scopeBtn: { flex: 1, paddingVertical: 8, borderRadius: 11, alignItems: 'center' },
  scopeBtnActive: { backgroundColor: '#FFFFFF' },
  scopeText: { fontSize: 13, fontWeight: '700', color: '#5E6D60' },
  scopeTextActive: { color: '#34523C' },
  selectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    marginBottom: 6,
  },
  selectionCount: { fontSize: 13, color: '#5E6D60' },
  selectionToggle: { fontSize: 13, fontWeight: '700', color: '#34523C' },
  list: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 1, borderColor: '#E3EAE4' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF3EF',
  },
  rowTitle: { flex: 1, fontSize: 14, color: '#1A2E1F' },
  empty: { padding: 16, fontSize: 13, color: '#5E6D60', textAlign: 'center' },
  btnIcon: { marginRight: 8 },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
    backgroundColor: '#34523C',
    borderRadius: 14,
    paddingVertical: 14,
  },
  disabledBtn: { opacity: 0.5 },
  primaryBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    backgroundColor: '#EAF0EB',
    borderWidth: 1,
    borderColor: '#D4DDD6',
    borderRadius: 14,
    paddingVertical: 14,
  },
  secondaryBtnText: { color: '#34523C', fontSize: 15, fontWeight: '800' },
  busy: { marginTop: 12 },
  message: { fontSize: 14, fontWeight: '600', color: '#34523C', marginTop: 12, lineHeight: 20 },
  messageError: { color: '#D9534F' },
});
