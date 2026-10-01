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

export function MagicRecipeImporterModal({
  visible,
  onClose,
  onRecipeSaved,
}: MagicRecipeImporterModalProps) {
  const [activeTab, setActiveTab] = useState<'text' | 'photo'>('text');
  
  // Input states
  const [inputText, setInputText] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [imageMimeType, setImageMimeType] = useState<string>('image/jpeg');
  const [imageBase64, setImageBase64] = useState<string | null>(null);

  // Parsing & Loading state
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Preview / Edit state
  const [parsedRecipe, setParsedRecipe] = useState<Recipe | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editCategory, setEditCategory] = useState<string>('Primi e Cereali');
  const [editSubCategory, setEditSubCategory] = useState<string>('');
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
        allowsEditing: true,
        quality: 0.8,
        base64: true,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        setSelectedImage(asset.uri);
        setImageMimeType(asset.mimeType || 'image/jpeg');
        setImageBase64(asset.base64 || null);
        setErrorMsg(null);
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
        allowsEditing: true,
        quality: 0.8,
        base64: true,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        setSelectedImage(asset.uri);
        setImageMimeType(asset.mimeType || 'image/jpeg');
        setImageBase64(asset.base64 || null);
        setErrorMsg(null);
      }
    } catch (e: any) {
      Alert.alert('Errore', 'Impossibile aprire la fotocamera: ' + e.message);
    }
  }

  async function handleStartParsing() {
    if (activeTab === 'text' && !inputText.trim()) {
      setErrorMsg('Inserisci o incolla il testo o il link della ricetta.');
      return;
    }

    if (activeTab === 'photo' && !imageBase64) {
      setErrorMsg('Seleziona o scatta una foto di una ricetta.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setLoadingMessage('Analisi della ricetta in corso...');

    try {
      let isUrl = false;
      if (activeTab === 'text' && /^https?:\/\//i.test(inputText.trim())) {
        isUrl = true;
      }

      const recipe = await parseRecipeWithAI({
        text: activeTab === 'text' && !isUrl ? inputText : undefined,
        url: activeTab === 'text' && isUrl ? inputText.trim() : undefined,
        imageBase64: activeTab === 'photo' ? imageBase64! : undefined,
        imageMimeType: imageMimeType
      });

      const initialImg = recipe.immagine || (activeTab === 'photo' && selectedImage ? selectedImage : '');

      setParsedRecipe(recipe);
      setEditTitle(recipe.titolo);
      setEditCategory(recipe.macro_categoria || recipe.categoria);
      setEditSubCategory(recipe.sottocategoria || '');
      setEditSlot(recipe.slot_consigliato || 'pranzo_cena');
      setEditServings(String(recipe.porzioni || 4));
      setEditTotalTime(String(recipe.tempi?.tempo_totale_minuti || 30));
      setEditDifficulty(recipe.difficolta || 'Facile');
      setEditImageUrl(initialImg);
      setImageLoadError(false);
      setEditIngredients((recipe.ingredienti || []).join('\n'));
      setEditInstructions((recipe.istruzioni || []).join('\n'));
      setEditTips((recipe.suggerimenti || []).join('\n'));
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

    const finalRecipe: Recipe = {
      ...parsedRecipe!,
      titolo: editTitle.trim(),
      categoria: editCategory,
      macro_categoria: editCategory,
      sottocategoria: editSubCategory || undefined,
      slot_consigliato: editSlot,
      porzioni: porz,
      porzioni_testo: `${porz} porzioni`,
      difficolta: editDifficulty,
      immagine: editImageUrl.trim(),
      tempi: {
        tempo_totale_minuti: totTime,
        tempo_preparazione: `${Math.round(totTime * 0.4)} minuti`,
        tempo_cottura: `${Math.round(totTime * 0.6)} minuti`,
        tempi_display: `Prep: ${Math.round(totTime * 0.4)} min, Cottura: ${Math.round(totTime * 0.6)} min`
      },
      ingredienti: ings,
      ingredienti_per_sezione: [
        {
          sezione: 'Principale',
          ingredienti: ings
        }
      ],
      ingredienti_dettagliati: ings.map(item => ({
        sezione: 'Principale',
        testo: item,
        quantita: null,
        unita: '',
        ingrediente: item
      })),
      istruzioni: steps,
      suggerimenti: tips,
      tags: ['100% Vegetale', editCategory]
    };

    try {
      await saveCustomRecipe(finalRecipe);
      onRecipeSaved(finalRecipe);
      Alert.alert('✨ Ricetta Salvata!', `"${finalRecipe.titolo}" è stata aggiunta con successo al tuo ricettario.`);
      handleReset();
      onClose();
    } catch (e: any) {
      Alert.alert('Errore di salvataggio', e.message);
    }
  }

  function handleReset() {
    setParsedRecipe(null);
    setInputText('');
    setSelectedImage(null);
    setImageBase64(null);
    setEditImageUrl('');
    setImageLoadError(false);
    setErrorMsg(null);
  }

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <View style={styles.sparkleIcon}>
                <Ionicons name="sparkles" size={20} color="#10b981" />
              </View>
              <Text style={styles.headerTitle}>Magic Importer AI</Text>
            </View>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Ionicons name="close" size={24} color="#64748b" />
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
                >
                  <Ionicons
                    name="document-text-outline"
                    size={18}
                    color={activeTab === 'text' ? '#10b981' : '#64748b'}
                  />
                  <Text style={[styles.tabLabel, activeTab === 'text' && styles.tabLabelActive]}>
                    Testo o Link
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.tabItem, activeTab === 'photo' && styles.tabItemActive]}
                  onPress={() => { setActiveTab('photo'); setErrorMsg(null); }}
                >
                  <Ionicons
                    name="camera-outline"
                    size={18}
                    color={activeTab === 'photo' ? '#10b981' : '#64748b'}
                  />
                  <Text style={[styles.tabLabel, activeTab === 'photo' && styles.tabLabelActive]}>
                    Foto Libro
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Error Box */}
              {errorMsg && (
                <View style={styles.errorBox}>
                  <Ionicons name="alert-circle" size={20} color="#ef4444" />
                  <Text style={styles.errorText}>{errorMsg}</Text>
                </View>
              )}

              {/* TAB 1: TEXT / URL */}
              {activeTab === 'text' && (
                <View style={styles.inputSection}>
                  <View style={styles.inputHeaderRow}>
                    <Text style={styles.sectionTitle}>Incolla Testo o Link della Ricetta</Text>
                    <TouchableOpacity style={styles.pasteButton} onPress={handlePasteFromClipboard}>
                      <Ionicons name="clipboard-outline" size={16} color="#10b981" />
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
                    placeholderTextColor="#94a3b8"
                    value={inputText}
                    onChangeText={setInputText}
                    textAlignVertical="top"
                  />
                </View>
              )}

              {/* TAB 2: PHOTO / CAMERA */}
              {activeTab === 'photo' && (
                <View style={styles.inputSection}>
                  <Text style={styles.sectionTitle}>Scansiona da un Libro o Schermata</Text>
                  <Text style={styles.sectionSubtitle}>
                    Scatta una foto a una pagina di ricette o carica uno screenshot. Il modello leggerà il testo e riconoscerà tutti gli ingredienti.
                  </Text>

                  {selectedImage ? (
                    <View style={styles.imagePreviewContainer}>
                      <ExpoImage
                        source={{ uri: selectedImage }}
                        style={styles.imagePreview}
                        contentFit="cover"
                        transition={200}
                      />
                      <TouchableOpacity
                        style={styles.removeImageBtn}
                        onPress={() => {
                          setSelectedImage(null);
                          setImageBase64(null);
                        }}
                      >
                        <Ionicons name="trash-outline" size={18} color="#ffffff" />
                        <Text style={styles.removeImageText}>Rimuovi Foto</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={styles.photoActionsRow}>
                      <TouchableOpacity style={styles.photoActionButton} onPress={handleTakePhoto}>
                        <Ionicons name="camera" size={28} color="#10b981" />
                        <Text style={styles.photoActionLabel}>Scatta Foto</Text>
                      </TouchableOpacity>

                      <TouchableOpacity style={styles.photoActionButton} onPress={handlePickImage}>
                        <Ionicons name="images" size={28} color="#10b981" />
                        <Text style={styles.photoActionLabel}>Scegli da Galleria</Text>
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
              >
                {loading ? (
                  <View style={styles.loadingRow}>
                    <ActivityIndicator size="small" color="#ffffff" />
                    <Text style={styles.parseButtonText}>{loadingMessage}</Text>
                  </View>
                ) : (
                  <View style={styles.loadingRow}>
                    <Ionicons name="sparkles" size={20} color="#ffffff" />
                    <Text style={styles.parseButtonText}>Estrai Ricetta con AI ✨</Text>
                  </View>
                )}
              </TouchableOpacity>
            </ScrollView>
          ) : (
            // REVIEW & EDIT PARSED RECIPE SCREEN
            <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
              <View style={styles.successBanner}>
                <Ionicons name="checkmark-circle" size={22} color="#10b981" />
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
                        setEditSubCategory('');
                      }}
                    >
                      <Text style={[styles.chipText, editCategory === cat && styles.chipTextActive]}>
                        {cat}
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
                          {sub}
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
                <TouchableOpacity style={styles.resetButton} onPress={handleReset}>
                  <Ionicons name="arrow-back" size={18} color="#64748b" />
                  <Text style={styles.resetButtonText}>Ricomincia</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.saveRecipeBtn} onPress={handleSaveRecipe}>
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
    backgroundColor: '#f8fafc',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sparkleIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#ecfdf5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0f172a',
  },
  closeButton: {
    padding: 6,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
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
    borderRadius: 8,
  },
  tabItemActive: {
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  tabLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
  },
  tabLabelActive: {
    color: '#10b981',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    gap: 8,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    color: '#b91c1c',
    fontWeight: '500',
  },
  inputSection: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 20,
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
    color: '#0f172a',
  },
  sectionSubtitle: {
    fontSize: 13,
    color: '#64748b',
    lineHeight: 18,
    marginBottom: 14,
  },
  pasteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ecfdf5',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  pasteButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#10b981',
  },
  textAreaInput: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: '#0f172a',
    minHeight: 160,
    lineHeight: 20,
  },
  singleLineInput: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0f172a',
  },
  photoActionsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  photoActionButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#cbd5e1',
    borderRadius: 14,
    paddingVertical: 28,
    gap: 8,
  },
  photoActionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  imagePreviewContainer: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  imagePreview: {
    width: '100%',
    height: 240,
    backgroundColor: '#000',
  },
  removeImageBtn: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(239, 68, 68, 0.9)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  removeImageText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  parseButton: {
    backgroundColor: '#10b981',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
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
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ecfdf5',
    borderColor: '#a7f3d0',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 10,
    marginBottom: 16,
  },
  successBannerText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#065f46',
  },
  fieldGroup: {
    marginBottom: 14,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 6,
  },
  chipsScroll: {
    flexDirection: 'row',
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#f1f5f9',
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  chipActive: {
    backgroundColor: '#10b981',
    borderColor: '#10b981',
  },
  chipText: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '500',
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
    backgroundColor: '#f1f5f9',
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  slotButtonActive: {
    backgroundColor: '#ecfdf5',
    borderColor: '#10b981',
  },
  slotButtonText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#64748b',
  },
  slotButtonTextActive: {
    color: '#10b981',
    fontWeight: '700',
  },
  rowThree: {
    flexDirection: 'row',
  },
  diffSelector: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    height: 42,
  },
  diffItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  diffItemActive: {
    backgroundColor: '#10b981',
  },
  diffItemText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
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
    backgroundColor: '#f1f5f9',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 6,
  },
  resetButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b',
  },
  saveRecipeBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10b981',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 6,
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  saveRecipeBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#ffffff',
  },
});
