import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  Modal,
  ScrollView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as Clipboard from 'expo-clipboard';
import { Recipe, SlotConsigliato } from '../types/recipe';
import { parseRecipeWithAI } from '../services/aiService';
import { saveCustomRecipe } from '../db/database';
import { MACRO_CATEGORIES, RECIPE_TAXONOMY, MacroCategory } from '../constants/categories';
import { useTranslation } from 'react-i18next';

interface MagicRecipeImporterModalProps {
  visible: boolean;
  onClose: () => void;
  onRecipeSaved: (recipe: Recipe) => void;
}

const CATEGORIES = [...MACRO_CATEGORIES];

const SLOTS: { label: string; value: SlotConsigliato }[] = [
  { label: 'Pranzo / Cena', value: 'pranzo_cena' },
  { label: 'Colazione', value: 'colazione' },
  { label: 'Spuntino', value: 'spuntino' },
];

interface CapturedPage {
  uri: string;
  base64: string;
  mimeType: string;
}

export function MagicRecipeImporterModal({
  visible,
  onClose,
  onRecipeSaved,
}: MagicRecipeImporterModalProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'text' | 'photo'>('text');
  
  // Input states
  const [inputText, setInputText] = useState('');
  const [capturedPages, setCapturedPages] = useState<CapturedPage[]>([]);

  // Parsing & Loading state
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Preview / Edit state
  const [parsedRecipe, setParsedRecipe] = useState<Recipe | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editCategory, setEditCategory] = useState<string>('MACRO_PRIMI_E_CEREALI');
  const [editSubCategory, setEditSubCategory] = useState<string>('CAT_PRIMI_PIATTI');
  const [editSlot, setEditSlot] = useState<SlotConsigliato>('pranzo_cena');
  const [editServings, setEditServings] = useState('4');
  const [editTotalTime, setEditTotalTime] = useState('30');
  const [editDifficulty, setEditDifficulty] = useState<'Facile' | 'Media' | 'Difficile'>('Facile');
  const [editImageUrl, setEditImageUrl] = useState('');
  const [imageLoadError, setImageLoadError] = useState(false);
  const [editIngredients, setEditIngredients] = useState('');
  const [editInstructions, setEditInstructions] = useState('');
  const [editTips, setEditTips] = useState('');

  async function handlePasteFromClipboard() {
    try {
      const text = await Clipboard.getStringAsync();
      if (text) {
        setInputText(text);
      }
    } catch {
      // ignore
    }
  }

  async function handlePickImage() {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        selectionLimit: 5,
        quality: 0.6,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const newPages: CapturedPage[] = [];
        for (const asset of result.assets) {
          if (asset.base64) {
            newPages.push({
              uri: asset.uri,
              base64: asset.base64,
              mimeType: asset.mimeType || 'image/jpeg',
            });
          }
        }
        if (newPages.length > 0) {
          setCapturedPages(prev => [...prev, ...newPages].slice(0, 5));
          setErrorMsg(null);
        }
      }
    } catch (e: any) {
      Alert.alert('Errore', 'Impossibile accedere alla galleria: ' + e.message);
    }
  }

  async function handleTakePhoto() {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permesso negato', 'Abilita i permessi della fotocamera per scattare foto.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: false,
        quality: 0.6,
        base64: true,
      });

      if (!result.canceled && result.assets[0]?.base64) {
        const asset = result.assets[0];
        const newPage: CapturedPage = {
          uri: asset.uri,
          base64: asset.base64!,
          mimeType: asset.mimeType || 'image/jpeg',
        };
        setCapturedPages(prev => [...prev, newPage].slice(0, 5));
        setErrorMsg(null);
      }
    } catch (e: any) {
      Alert.alert('Errore', 'Impossibile aprire la fotocamera: ' + e.message);
    }
  }

  function handleRemovePage(index: number) {
    setCapturedPages(prev => prev.filter((_, i) => i !== index));
  }

  async function handleStartParsing() {
    if (activeTab === 'text' && !inputText.trim()) {
      setErrorMsg('Inserisci o incolla il testo o il link della ricetta.');
      return;
    }

    if (activeTab === 'photo' && capturedPages.length === 0) {
      setErrorMsg('Scatta o seleziona almeno una pagina o foto della ricetta.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setLoadingMessage(
      activeTab === 'photo' && capturedPages.length > 1
        ? `Analisi di ${capturedPages.length} pagine del libro con AI...`
        : 'Analisi della ricetta in corso...'
    );

    try {
      let isUrl = false;
      if (activeTab === 'text' && /^https?:\/\//i.test(inputText.trim())) {
        isUrl = true;
      }

      const recipe = await parseRecipeWithAI({
        text: activeTab === 'text' && !isUrl ? inputText : undefined,
        url: activeTab === 'text' && isUrl ? inputText.trim() : undefined,
        images: activeTab === 'photo' && capturedPages.length > 0
          ? capturedPages.map(p => ({
              base64: p.base64,
              mimeType: p.mimeType,
              uri: p.uri
            }))
          : undefined,
      });

      const initialImg = recipe.image || (activeTab === 'photo' && capturedPages[0] ? capturedPages[0].uri : '');

      setParsedRecipe(recipe);
      setEditTitle(recipe.title);
      setEditCategory(recipe.macro_category || 'MACRO_PRIMI_E_CEREALI');
      setEditSubCategory(recipe.subcategory || recipe.category || '');
      setEditSlot((recipe.recommended_slot as any) || 'pranzo_cena');
      setEditServings(String(recipe.servings || 4));
      setEditTotalTime(String(recipe.times?.total_minutes || 30));
      setEditDifficulty(recipe.difficulty === 'hard' || recipe.difficulty === 'Difficile' ? 'Difficile' : recipe.difficulty === 'medium' || recipe.difficulty === 'Media' ? 'Media' : 'Facile');
      setEditImageUrl(initialImg);
      setImageLoadError(false);
      setEditIngredients((recipe.ingredients || []).join('\n'));
      setEditInstructions((recipe.instructions || []).join('\n'));
      setEditTips((recipe.tips || []).join('\n'));
    } catch (e: any) {
      setErrorMsg(e.message || 'Errore durante l\'estrazione della ricetta.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveRecipe() {
    if (!editTitle.trim()) {
      Alert.alert('Attenzione', 'Il titolo non può essere vuoto.');
      return;
    }

    const ings = editIngredients
      .split('\n')
      .map(i => i.trim().replace(/^[-*•]\s*|^\d+[\.\)]\s*/, ''))
      .filter(Boolean);

    if (ings.length === 0) {
      Alert.alert('Attenzione', 'Inserisci almeno un ingrediente.');
      return;
    }

    const steps = editInstructions
      .split('\n')
      .map(s => s.trim().replace(/^[-*•]\s*|^\d+[\.\)]\s*/, ''))
      .filter(Boolean);

    const tips = editTips
      .split('\n')
      .map(t => t.trim().replace(/^[-*•]\s*|^\d+[\.\)]\s*/, ''))
      .filter(Boolean);

    const porz = parseInt(editServings, 10) || 4;
    const totTime = parseInt(editTotalTime, 10) || 30;

    const chosenMacro = (editCategory as MacroCategory) || 'MACRO_PRIMI_E_CEREALI';
    const chosenCat = editSubCategory || (RECIPE_TAXONOMY[chosenMacro]?.[0] || 'CAT_PRIMI_PIATTI');

    const finalRecipe: Recipe = {
      ...parsedRecipe!,
      title: editTitle.trim(),
      category: chosenCat,
      macro_category: chosenMacro,
      subcategory: chosenCat,
      recommended_slot: editSlot as any,
      servings: porz,
      servings_text: `${porz} porzioni`,
      difficulty: editDifficulty,
      image: editImageUrl.trim(),
      times: {
        total_minutes: totTime,
        prep_time: `${Math.round(totTime * 0.4)} minuti`,
        cook_time: `${Math.round(totTime * 0.6)} minuti`,
        display_time: `Prep: ${Math.round(totTime * 0.4)} min, Cottura: ${Math.round(totTime * 0.6)} min`
      },
      ingredients: ings,
      ingredients_by_section: [
        {
          section: 'Principale',
          ingredients: ings
        }
      ],
      detailed_ingredients: ings.map(item => ({
        section: 'Principale',
        text: item,
        amount: null,
        unit: '',
        ingredient: item
      })),
      instructions: steps,
      tips: tips,
      tags: ['100% Vegetale', chosenCat],
      protein_group: parsedRecipe?.protein_group || 'legumi_interi',
      carb_family: parsedRecipe?.carb_family || 'pasta',
      veggie_color: parsedRecipe?.veggie_color || 'green',
      seasons: parsedRecipe?.seasons || ['inverno', 'primavera', 'estate', 'autunno'],
      is_complete_plate: parsedRecipe?.is_complete_plate ?? true,
    };

    try {
      await saveCustomRecipe(finalRecipe);
      onRecipeSaved(finalRecipe);
      handleReset();
      onClose();
    } catch (e: any) {
      Alert.alert('Errore di salvataggio', e.message);
    }
  }

  function handleReset() {
    setParsedRecipe(null);
    setInputText('');
    setCapturedPages([]);
    setEditImageUrl('');
    setImageLoadError(false);
    setErrorMsg(null);
  }

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom', 'left', 'right']}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <View style={styles.sparkleIcon}>
                <Ionicons name="sparkles" size={18} color="#34523C" />
              </View>
              <View>
                <Text style={styles.headerTitle}>Magic Importer AI</Text>
                <Text style={styles.headerSubtitle}>Importa da link web, testo o foto</Text>
              </View>
            </View>
            <TouchableOpacity style={styles.closeButton} onPress={onClose} activeOpacity={0.7}>
              <Ionicons name="close" size={20} color="#4A584D" />
            </TouchableOpacity>
          </View>

          {!parsedRecipe ? (
            // INPUT SCREEN
            <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
              {/* Tab Selector */}
              <View style={styles.tabBar}>
                <TouchableOpacity
                  style={[styles.tabItem, activeTab === 'text' && styles.tabItemActive]}
                  onPress={() => { setActiveTab('text'); setErrorMsg(null); }}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name="document-text"
                    size={17}
                    color={activeTab === 'text' ? '#34523C' : '#7A8A7E'}
                  />
                  <Text style={[styles.tabLabel, activeTab === 'text' && styles.tabLabelActive]}>
                    Testo o Link
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.tabItem, activeTab === 'photo' && styles.tabItemActive]}
                  onPress={() => { setActiveTab('photo'); setErrorMsg(null); }}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name="camera"
                    size={17}
                    color={activeTab === 'photo' ? '#34523C' : '#7A8A7E'}
                  />
                  <Text style={[styles.tabLabel, activeTab === 'photo' && styles.tabLabelActive]}>
                    Foto Libro
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Error Box */}
              {errorMsg && (
                <View style={styles.errorBox}>
                  <Ionicons name="alert-circle" size={18} color="#C0392B" />
                  <Text style={styles.errorText}>{errorMsg}</Text>
                </View>
              )}

              {/* TAB 1: TEXT / URL */}
              {activeTab === 'text' && (
                <View style={styles.inputSection}>
                  <View style={styles.inputHeaderRow}>
                    <Text style={styles.sectionTitle}>Incolla Testo o Link della Ricetta</Text>
                    <TouchableOpacity style={styles.pasteButton} onPress={handlePasteFromClipboard} activeOpacity={0.75}>
                      <Ionicons name="clipboard-outline" size={13} color="#34523C" />
                      <Text style={styles.pasteButtonText}>Incolla</Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.sectionSubtitle}>
                    Incolla link di blog (GialloZafferano, Vegolosi, ecc.), trascrizioni di reel, o testi disordinati inviati in chat.
                  </Text>
                  <TextInput
                    style={styles.textAreaInput}
                    multiline
                    numberOfLines={8}
                    placeholder="Es. https://blogcucina.it/ricetta-tofu o incollami ingredienti e procedimento..."
                    placeholderTextColor="#9CA89E"
                    value={inputText}
                    onChangeText={setInputText}
                    textAlignVertical="top"
                  />
                </View>
              )}

              {/* TAB 2: PHOTO / CAMERA */}
              {activeTab === 'photo' && (
                <View style={styles.inputSection}>
                  <View style={styles.inputHeaderRow}>
                    <Text style={styles.sectionTitle}>Pagine del Libro o Ricettario</Text>
                    {capturedPages.length > 0 && (
                      <TouchableOpacity
                        style={styles.clearPagesBtn}
                        onPress={() => setCapturedPages([])}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="trash-outline" size={13} color="#C0392B" />
                        <Text style={styles.clearPagesText}>Rimuovi tutte</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  <Text style={styles.sectionSubtitle}>
                    Scatta o carica le pagine del libro. Se la ricetta occupa più di una facciata (es. ingredienti su una e procedimento sull'altra), puoi aggiungere fino a 5 pagine consecutive!
                  </Text>

                  {capturedPages.length > 0 ? (
                    <View style={styles.pagesContainer}>
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.pagesScrollList}
                      >
                        {capturedPages.map((page, index) => (
                          <View key={page.uri + index} style={styles.pageCard}>
                            <ExpoImage
                              source={{ uri: page.uri }}
                              style={styles.pageThumbnail}
                              contentFit="cover"
                              transition={200}
                            />
                            <View style={styles.pageBadge}>
                              <Text style={styles.pageBadgeText}>Pagina {index + 1}</Text>
                            </View>
                            <TouchableOpacity
                              style={styles.pageDeleteBtn}
                              onPress={() => handleRemovePage(index)}
                              activeOpacity={0.8}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                              <Ionicons name="close" size={14} color="#FFF" />
                            </TouchableOpacity>
                          </View>
                        ))}
                      </ScrollView>

                      {/* Add more pages actions */}
                      {capturedPages.length < 5 && (
                        <View style={styles.appendPageRow}>
                          <TouchableOpacity
                            style={styles.appendPageBtn}
                            onPress={handleTakePhoto}
                            activeOpacity={0.75}
                          >
                            <Ionicons name="camera-outline" size={18} color="#34523C" />
                            <Text style={styles.appendPageBtnText}>+ Scatta Pag. {capturedPages.length + 1}</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={[styles.appendPageBtn, styles.appendPageBtnSecondary]}
                            onPress={handlePickImage}
                            activeOpacity={0.75}
                          >
                            <Ionicons name="images-outline" size={18} color="#34523C" />
                            <Text style={styles.appendPageBtnText}>+ Dalla Galleria</Text>
                          </TouchableOpacity>
                        </View>
                      )}

                      <View style={styles.pagesHintBox}>
                        <Ionicons name="information-circle-outline" size={16} color="#4A6B53" />
                        <Text style={styles.pagesHintText}>
                          {capturedPages.length === 1
                            ? '1 pagina acquisita. Se la ricetta continua, tocca "+ Scatta Pag. 2" per aggiungere la continuazione!'
                            : `${capturedPages.length} pagine acquisite. L'AI leggerà tutte le pagine insieme unificando ingredienti e procedimento.`}
                        </Text>
                      </View>
                    </View>
                  ) : (
                    <View style={styles.photoActionsRow}>
                      <TouchableOpacity style={styles.photoActionButton} onPress={handleTakePhoto} activeOpacity={0.75}>
                        <Ionicons name="camera-outline" size={30} color="#34523C" />
                        <Text style={styles.photoActionLabel}>Scatta 1ª Pagina</Text>
                        <Text style={styles.photoActionSub}>con fotocamera</Text>
                      </TouchableOpacity>

                      <TouchableOpacity style={styles.photoActionButton} onPress={handlePickImage} activeOpacity={0.75}>
                        <Ionicons name="images-outline" size={30} color="#34523C" />
                        <Text style={styles.photoActionLabel}>Scegli da Galleria</Text>
                        <Text style={styles.photoActionSub}>anche pagine multiple</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              )}

              {/* SUBMIT BUTTON */}
              <TouchableOpacity
                style={[styles.parseButton, loading && styles.parseButtonDisabled]}
                onPress={handleStartParsing}
                disabled={loading}
                activeOpacity={0.88}
              >
                {loading ? (
                  <View style={styles.loadingRow}>
                    <ActivityIndicator size="small" color="#FFFFFF" />
                    <Text style={styles.parseButtonText}>{loadingMessage}</Text>
                  </View>
                ) : (
                  <View style={styles.loadingRow}>
                    <Ionicons name="sparkles" size={18} color="#FFFFFF" />
                    <Text style={styles.parseButtonText}>
                      {activeTab === 'photo' && capturedPages.length > 1
                        ? `Estrai Ricetta da ${capturedPages.length} Pagine con AI`
                        : 'Estrai Ricetta con AI'}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            </ScrollView>
          ) : (
            // REVIEW & EDIT PARSED RECIPE SCREEN
            <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
              <View style={styles.successBanner}>
                <Ionicons name="checkmark-circle" size={20} color="#34523C" />
                <Text style={styles.successBannerText}>Ricetta estratta con successo! Rivedi o modifica prima di salvare.</Text>
              </View>

              {/* Titolo */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Titolo</Text>
                <TextInput
                  style={styles.singleLineInput}
                  value={editTitle}
                  onChangeText={setEditTitle}
                />
              </View>

              {/* Categoria */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Categoria</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll}>
                  {CATEGORIES.map(cat => (
                    <TouchableOpacity
                      key={cat}
                      style={[styles.chip, editCategory === cat && styles.chipActive]}
                      onPress={() => {
                        setEditCategory(cat);
                        const firstSub = RECIPE_TAXONOMY[cat as MacroCategory]?.[0] || '';
                        setEditSubCategory(firstSub);
                      }}
                    >
                      <Text style={[styles.chipText, editCategory === cat && styles.chipTextActive]}>
                        {t('categories.' + cat, { defaultValue: cat })}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              {/* Sottocategoria */}
              {RECIPE_TAXONOMY[editCategory as MacroCategory] && (
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Sottocategoria</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll}>
                    {RECIPE_TAXONOMY[editCategory as MacroCategory].map(sub => (
                      <TouchableOpacity
                        key={sub}
                        style={[styles.chip, editSubCategory === sub && styles.chipActive]}
                        onPress={() => setEditSubCategory(sub)}
                      >
                        <Text style={[styles.chipText, editSubCategory === sub && styles.chipTextActive]}>
                          {t('categories.' + sub, { defaultValue: sub })}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}

              {/* Slot Planner */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Slot Consigliato nel Planner</Text>
                <View style={styles.slotsRow}>
                  {SLOTS.map(s => (
                    <TouchableOpacity
                      key={s.value}
                      style={[styles.slotButton, editSlot === s.value && styles.slotButtonActive]}
                      onPress={() => setEditSlot(s.value)}
                    >
                      <Text style={[styles.slotButtonText, editSlot === s.value && styles.slotButtonTextActive]}>
                        {s.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Row: Porzioni, Tempo, Difficoltà */}
              <View style={styles.rowThree}>
                <View style={[styles.fieldGroup, { flex: 1 }]}>
                  <Text style={styles.fieldLabel}>Porzioni</Text>
                  <TextInput
                    style={styles.singleLineInput}
                    value={editServings}
                    onChangeText={setEditServings}
                    keyboardType="number-pad"
                  />
                </View>
                <View style={[styles.fieldGroup, { flex: 1, marginHorizontal: 8 }]}>
                  <Text style={styles.fieldLabel}>Tempo (min)</Text>
                  <TextInput
                    style={styles.singleLineInput}
                    value={editTotalTime}
                    onChangeText={setEditTotalTime}
                    keyboardType="number-pad"
                  />
                </View>
                <View style={[styles.fieldGroup, { flex: 1 }]}>
                  <Text style={styles.fieldLabel}>Difficoltà</Text>
                  <View style={styles.diffSelector}>
                    {(['Facile', 'Media', 'Difficile'] as const).map(d => (
                      <TouchableOpacity
                        key={d}
                        style={[styles.diffItem, editDifficulty === d && styles.diffItemActive]}
                        onPress={() => setEditDifficulty(d)}
                      >
                        <Text style={[styles.diffItemText, editDifficulty === d && styles.diffItemTextActive]}>
                          {d[0]}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </View>

              {/* Immagine URL */}
              <View style={styles.fieldGroup}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <Text style={[styles.fieldLabel, { marginBottom: 0 }]}>Link Immagine (opzionale)</Text>
                  {editImageUrl ? (
                    <TouchableOpacity
                      onPress={() => {
                        setEditImageUrl('');
                        setImageLoadError(false);
                      }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Text style={{ fontSize: 12, color: '#ef4444', fontWeight: '600' }}>Rimuovi</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
                <TextInput
                  style={styles.singleLineInput}
                  placeholder="https://..."
                  placeholderTextColor="#94a3b8"
                  value={editImageUrl}
                  onChangeText={(text) => {
                    setEditImageUrl(text);
                    setImageLoadError(false);
                  }}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {editImageUrl && !imageLoadError ? (
                  <View style={{ marginTop: 8, height: 180, borderRadius: 10, overflow: 'hidden', backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#e2e8f0' }}>
                    <ExpoImage
                      source={{ uri: editImageUrl }}
                      style={{ width: '100%', height: '100%' }}
                      contentFit="cover"
                      transition={250}
                      cachePolicy="disk"
                      onError={() => setImageLoadError(true)}
                    />
                  </View>
                ) : editImageUrl && imageLoadError ? (
                  <View style={{ marginTop: 8, padding: 10, borderRadius: 8, backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Ionicons name="image-outline" size={18} color="#ef4444" />
                    <Text style={{ fontSize: 12, color: '#b91c1c', flex: 1 }}>
                      Anteprima non disponibile per questo link.
                    </Text>
                  </View>
                ) : null}
              </View>

              {/* Ingredienti */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Ingredienti (uno per riga)</Text>
                <TextInput
                  style={[styles.textAreaInput, { minHeight: 140 }]}
                  multiline
                  value={editIngredients}
                  onChangeText={setEditIngredients}
                  textAlignVertical="top"
                />
              </View>

              {/* Istruzioni */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Istruzioni (un passaggio per riga)</Text>
                <TextInput
                  style={[styles.textAreaInput, { minHeight: 140 }]}
                  multiline
                  value={editInstructions}
                  onChangeText={setEditInstructions}
                  textAlignVertical="top"
                />
              </View>

              {/* Consigli */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Consigli / Suggerimenti Chef</Text>
                <TextInput
                  style={[styles.textAreaInput, { minHeight: 80 }]}
                  multiline
                  value={editTips}
                  onChangeText={setEditTips}
                  textAlignVertical="top"
                />
              </View>

              {/* Actions Footer */}
              <View style={styles.actionsFooter}>
                <TouchableOpacity style={styles.resetButton} onPress={handleReset} activeOpacity={0.75}>
                  <Ionicons name="arrow-back" size={18} color="#556459" />
                  <Text style={styles.resetButtonText}>Ricomincia</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.saveRecipeBtn} onPress={handleSaveRecipe} activeOpacity={0.88}>
                  <Ionicons name="checkmark-circle" size={20} color="#ffffff" />
                  <Text style={styles.saveRecipeBtnText}>Salva nel Ricettario</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FBF9F5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: '#FAF8F5',
    borderBottomWidth: 1,
    borderBottomColor: '#ECE7DF',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  sparkleIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#EAF0EB',
    borderWidth: 1,
    borderColor: '#D4E2D8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2B332B',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#7A8A7E',
    marginTop: 1,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#EFEAE2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    padding: 18,
    paddingBottom: 40,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#EFEAE2',
    borderRadius: 14,
    padding: 4,
    marginBottom: 16,
  },
  tabItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    gap: 6,
    borderRadius: 10,
  },
  tabItemActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#2B332B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  tabLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#7A8A7E',
  },
  tabLabelActive: {
    color: '#34523C',
    fontWeight: '700',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FDF2EE',
    borderColor: '#F6D3C7',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    gap: 8,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    color: '#C0392B',
    fontWeight: '600',
  },
  inputSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: '#ECE7DF',
    marginBottom: 20,
    shadowColor: '#2B332B',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  inputHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2B332B',
  },
  sectionSubtitle: {
    fontSize: 13,
    color: '#6E7E72',
    lineHeight: 18,
    marginBottom: 14,
  },
  pasteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#EAF0EB',
    borderWidth: 1,
    borderColor: '#D4E2D8',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
  },
  pasteButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#34523C',
  },
  textAreaInput: {
    backgroundColor: '#FAF8F5',
    borderWidth: 1,
    borderColor: '#E3DCD2',
    borderRadius: 14,
    padding: 14,
    fontSize: 14,
    color: '#2B332B',
    minHeight: 170,
    lineHeight: 21,
  },
  singleLineInput: {
    backgroundColor: '#FAF8F5',
    borderWidth: 1,
    borderColor: '#E3DCD2',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 14,
    color: '#2B332B',
  },
  photoActionsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  photoActionButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FAF8F5',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#C8DACD',
    borderRadius: 16,
    paddingVertical: 26,
    gap: 8,
  },
  photoActionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2B332B',
  },
  photoActionSub: {
    fontSize: 11,
    color: '#7A8A7E',
    marginTop: -2,
  },
  clearPagesBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FDF2EE',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  clearPagesText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#C0392B',
  },
  pagesContainer: {
    gap: 12,
  },
  pagesScrollList: {
    flexDirection: 'row',
    paddingVertical: 4,
    gap: 12,
  },
  pageCard: {
    width: 140,
    height: 180,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#FAF8F5',
    borderWidth: 1,
    borderColor: '#ECE7DF',
    position: 'relative',
    shadowColor: '#2B332B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  pageThumbnail: {
    width: '100%',
    height: '100%',
  },
  pageBadge: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    backgroundColor: 'rgba(52, 82, 60, 0.9)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  pageBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  pageDeleteBtn: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  appendPageRow: {
    flexDirection: 'row',
    gap: 10,
  },
  appendPageBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#EAF0EB',
    borderWidth: 1,
    borderColor: '#D4E2D8',
    paddingVertical: 11,
    borderRadius: 12,
  },
  appendPageBtnSecondary: {
    backgroundColor: '#FAF8F5',
    borderColor: '#ECE7DF',
  },
  appendPageBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#34523C',
  },
  pagesHintBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#EAF0EB',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  pagesHintText: {
    flex: 1,
    fontSize: 12,
    color: '#26422E',
    lineHeight: 16,
    fontWeight: '500',
  },
  parseButton: {
    backgroundColor: '#34523C',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#34523C',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  parseButtonDisabled: {
    opacity: 0.7,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  parseButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EAF0EB',
    borderColor: '#C8DACD',
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 10,
    marginBottom: 18,
  },
  successBannerText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#26422E',
    lineHeight: 18,
  },
  fieldGroup: {
    marginBottom: 15,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#3B483E',
    marginBottom: 6,
  },
  chipsScroll: {
    flexDirection: 'row',
  },
  chip: {
    paddingHorizontal: 13,
    paddingVertical: 7,
    backgroundColor: '#EFEAE2',
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#E3DCD2',
  },
  chipActive: {
    backgroundColor: '#34523C',
    borderColor: '#34523C',
  },
  chipText: {
    fontSize: 12,
    color: '#556459',
    fontWeight: '600',
  },
  chipTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  slotsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  slotButton: {
    flex: 1,
    backgroundColor: '#FAF8F5',
    paddingVertical: 11,
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E3DCD2',
  },
  slotButtonActive: {
    backgroundColor: '#EAF0EB',
    borderColor: '#34523C',
  },
  slotButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6E7E72',
  },
  slotButtonTextActive: {
    color: '#34523C',
    fontWeight: '700',
  },
  rowThree: {
    flexDirection: 'row',
  },
  diffSelector: {
    flexDirection: 'row',
    backgroundColor: '#EFEAE2',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E3DCD2',
    height: 42,
  },
  diffItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  diffItemActive: {
    backgroundColor: '#34523C',
  },
  diffItemText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6E7E72',
  },
  diffItemTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  actionsFooter: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  resetButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EFEAE2',
    borderWidth: 1,
    borderColor: '#E3DCD2',
    paddingVertical: 14,
    borderRadius: 14,
    gap: 6,
  },
  resetButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#556459',
  },
  saveRecipeBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#34523C',
    paddingVertical: 14,
    borderRadius: 14,
    gap: 6,
    shadowColor: '#34523C',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  saveRecipeBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#ffffff',
  },
});
