import { SheetModal } from './SheetModal';
import React, { useMemo, useState } from 'react';
import {
  StyleSheet,
  Switch,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as Clipboard from 'expo-clipboard';
import { Recipe, RecipeDiet, SlotConsigliato } from '../types/recipe';
import { parseRecipeWithAI } from '../services/aiService';
import { VariantDiet } from '../services/catalogFormat';
import { ingredientItemFromText } from '../utils/servingsScaler';
import { classifyDiet } from '../utils/dietClassifier';
import { knownIngredients, saveCatalogRecipesWithLinks } from '../db/recipeIngredientsDb';
import { buildImportWrite, findUnresolvedRecipeIngredients } from '../services/importPlan';
import type { ImportChoice, KnownIngredient, UnresolvedIngredient } from '../utils/importResolution';
import { UnresolvedIngredientsModal } from './UnresolvedIngredientsModal';
import { refreshCatalog } from '../services/recipeCatalog';
import { MACRO_CATEGORIES, RECIPE_TAXONOMY, MacroCategory } from '../constants/categories';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../context/ThemeContext';
import type { Palette } from '../theme/palette';
import { AppTextField } from './ui/AppTextField';

// Review of a generated recipe (e.g. a variant): the form is the same as the AI import
export interface ReviewRequest {
  recipe: Recipe;
  title: string;
  onConfirm: (recipe: Recipe, choices: ReadonlyMap<string, ImportChoice>) => Promise<void>;
  onDiscard: () => void;
  onRetry: (instructions: string) => Promise<void>;
}

interface MagicRecipeImporterModalProps {
  visible: boolean;
  onClose: () => void;
  // Receives the saved original and the variants to generate (empty if not requested)
  onRecipeSaved: (recipe: Recipe, variantDiets?: VariantDiet[]) => void;
  editingRecipe?: Recipe | null;
  review?: ReviewRequest | null;
  // Link received from sharing: prefills the text field without starting extraction
  initialUrl?: string;
}

const CATEGORIES = [...MACRO_CATEGORIES];

const SLOTS: { label: string; value: SlotConsigliato }[] = [
  { label: 'recipeImporter.slots.lunchDinner', value: 'pranzo_cena' },
  { label: 'recipeImporter.slots.breakfast', value: 'colazione' },
  { label: 'recipeImporter.slots.snack', value: 'spuntino' },
];

interface CapturedPage {
  uri: string;
  base64: string;
  mimeType: string;
}

const VARIANT_SUMMARY: Record<'none' | 'vegetarian' | 'vegan' | 'both', string> = {
  none: 'recipeImporter.variantSummary.none',
  vegetarian: 'recipeImporter.variantSummary.vegetarian',
  vegan: 'recipeImporter.variantSummary.vegan',
  both: 'recipeImporter.variantSummary.both',
};

export function MagicRecipeImporterModal({
  visible,
  onClose,
  onRecipeSaved,
  editingRecipe,
  review,
  initialUrl,
}: MagicRecipeImporterModalProps) {
  const { t } = useTranslation();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);
  const [activeTab, setActiveTab] = useState<'text' | 'photo'>('text');
  
  // Input states
  const [inputText, setInputText] = useState('');
  const [capturedPages, setCapturedPages] = useState<CapturedPage[]>([]);
  // Variants to generate after saving the original: independent of each other
  const [wantVegetarian, setWantVegetarian] = useState(false);
  const [wantVegan, setWantVegan] = useState(false);
  const wantedVariants: VariantDiet[] = [
    ...(wantVegetarian ? ['vegetarian' as const] : []),
    ...(wantVegan ? ['vegan' as const] : []),
  ];
  const variantSummaryKey = wantVegetarian && wantVegan ? 'both' : wantVegan ? 'vegan' : wantVegetarian ? 'vegetarian' : 'none';

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
  const [editDiet, setEditDiet] = useState<RecipeDiet>('omnivore');
  const [retryInstructions, setRetryInstructions] = useState('');
  const [retrying, setRetrying] = useState(false);
  // Save waiting for the user's choices on unknown ingredient names
  const [pendingIngredients, setPendingIngredients] = useState<{ recipe: Recipe; items: UnresolvedIngredient[]; known: KnownIngredient[] } | null>(null);
  // true if the user chose the diet manually: from then on it is no longer recomputed
  const [dietChosenByHand, setDietChosenByHand] = useState(false);
  // Ingredients replaced by the AI (vegetarian/vegan adaptation): for verification only, they are not saved
  const [substitutions, setSubstitutions] = useState<{ from: string; to: string }[]>([]);

  // No API: opens Google Images in the browser, the user copies the photo address and pastes it here
  function openGoogleImageSearch() {
    const query = `${editTitle.trim()} ricetta`;
    Linking.openURL(`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(query)}`);
  }

  async function handlePasteImageUrl() {
    const text = (await Clipboard.getStringAsync()).trim();
    if (!text) return;
    setEditImageUrl(text);
    setImageLoadError(false);
  }

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
      Alert.alert(t('recipeImporter.errorTitle'), t('recipeImporter.galleryError', { message: e.message }));
    }
  }

  async function handleTakePhoto() {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('recipeImporter.cameraPermissionTitle'), t('recipeImporter.cameraPermissionMessage'));
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
      Alert.alert(t('recipeImporter.errorTitle'), t('recipeImporter.cameraError', { message: e.message }));
    }
  }

  function handleRemovePage(index: number) {
    setCapturedPages(prev => prev.filter((_, i) => i !== index));
  }

  async function handleStartParsing() {
    if (activeTab === 'text' && !inputText.trim()) {
      setErrorMsg(t('recipeImporter.enterTextOrLink'));
      return;
    }

    if (activeTab === 'photo' && capturedPages.length === 0) {
      setErrorMsg(t('recipeImporter.addPhotoFirst'));
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setLoadingMessage(
      activeTab === 'photo' && capturedPages.length > 1
        ? t('recipeImporter.analyzingPages', { count: capturedPages.length })
        : t('recipeImporter.analyzing')
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

      loadRecipeIntoForm(recipe, activeTab === 'photo' && capturedPages[0] ? capturedPages[0].uri : '');
    } catch (e: any) {
      setErrorMsg(e.message || t('recipeImporter.extractError'));
    } finally {
      setLoading(false);
    }
  }

  function loadRecipeIntoForm(recipe: Recipe, fallbackImage = '') {
    setParsedRecipe(recipe);
    setEditTitle(recipe.title);
    setEditCategory(recipe.macro_category || 'MACRO_PRIMI_E_CEREALI');
    setEditSubCategory(recipe.subcategory || recipe.category || '');
    setEditSlot((recipe.recommended_slot as any) || 'pranzo_cena');
    setEditServings(String(recipe.servings));
    setEditTotalTime(String(recipe.times?.total_minutes || 30));
    setEditDifficulty(recipe.difficulty === 'hard' || recipe.difficulty === 'Difficile' ? 'Difficile' : recipe.difficulty === 'medium' || recipe.difficulty === 'Media' ? 'Media' : 'Facile');
    setEditImageUrl(recipe.image || fallbackImage);
    setImageLoadError(false);
    setEditIngredients((recipe.ingredients || []).join('\n'));
    setEditInstructions((recipe.instructions || []).join('\n'));
    setEditTips((recipe.tips || []).join('\n'));
    setEditDiet(recipe.diet_source === 'manual' && recipe.diet ? recipe.diet : classifyDiet(recipe));
    setDietChosenByHand(recipe.diet_source === 'manual');
    setSubstitutions(
      ((recipe as Recipe & { substitutions?: { from: string; to: string }[] }).substitutions ?? [])
        .filter(s => typeof s.from === 'string' && typeof s.to === 'string')
    );
  }

  async function handleSaveRecipe() {
    if (!editTitle.trim()) {
      Alert.alert(t('recipeImporter.attentionTitle'), t('recipeImporter.titleEmpty'));
      return;
    }

    const ings = editIngredients
      .split('\n')
      .map(i => i.trim().replace(/^[-*•]\s*|^\d+[\.\)]\s*/, ''))
      .filter(Boolean);

    if (ings.length === 0) {
      Alert.alert(t('recipeImporter.attentionTitle'), t('recipeImporter.ingredientRequired'));
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
      detailed_ingredients: ings.map(item => ingredientItemFromText(item)),
      instructions: steps,
      tips: tips,
      // Keeps the recipe tags, replacing the category one (e.g. after a category change)
      tags: [...(parsedRecipe?.tags ?? []).filter(tag => tag !== '100% Vegetale' && !tag.startsWith('CAT_')), ...(editDiet === 'vegan' ? ['100% Vegetale'] : []), chosenCat],
      diet: editDiet,
      diet_source: dietChosenByHand ? 'manual' : 'auto',
      protein_group: parsedRecipe?.protein_group || 'legumi_interi',
      carb_family: parsedRecipe?.carb_family || 'pasta',
      veggie_color: parsedRecipe?.veggie_color || 'green',
      seasons: parsedRecipe?.seasons || ['inverno', 'primavera', 'estate', 'autunno'],
      is_complete_plate: parsedRecipe?.is_complete_plate ?? true,
    };

    let unresolved: UnresolvedIngredient[];
    try {
      unresolved = await findUnresolvedRecipeIngredients([finalRecipe]);
    } catch (e: any) {
      Alert.alert(t('recipeImporter.saveErrorTitle'), e.message);
      return;
    }
    // Unknown ingredients: the user links or adds them first, in the modal
    if (unresolved.length > 0) {
      setPendingIngredients({ recipe: finalRecipe, items: unresolved, known: await knownIngredients() });
      return;
    }
    await commitRecipe(finalRecipe, new Map());
  }

  async function commitRecipe(finalRecipe: Recipe, choices: ReadonlyMap<string, ImportChoice>) {
    try {
      if (review) {
        await review.onConfirm({ ...finalRecipe, origin: 'ai', modified: false }, choices);
        handleReset();
        onClose();
        return;
      }
      // An edit of an existing recipe keeps origin and creation date
      const now = Date.now();
      // Recipe and links in a single transaction
      const record: Recipe = {
        ...finalRecipe,
        origin: editingRecipe?.origin ?? 'ai',
        modified: !!editingRecipe,
        created_at: editingRecipe?.created_at ?? now,
        updated_at: now,
      };
      const { links, plan } = await buildImportWrite([record], choices);
      await saveCatalogRecipesWithLinks([record], 'overwrite', links, plan);
      await refreshCatalog();
      // First close, then notify: so the receiver can open the variants review
      handleReset();
      onClose();
      onRecipeSaved(finalRecipe, editingRecipe ? [] : wantedVariants);
    } catch (e: any) {
      Alert.alert(t('recipeImporter.saveErrorTitle'), e.message);
    }
  }

  async function handleRetry() {
    if (!review) return;
    setRetrying(true);
    try {
      await review.onRetry(retryInstructions.trim());
      setRetryInstructions('');
    } catch (e: any) {
      Alert.alert(t('recipeImporter.errorTitle'), e.message || t('recipeImporter.retryError'));
    } finally {
      setRetrying(false);
    }
  }

  function discardReview() {
    review?.onDiscard();
    handleReset();
    onClose();
  }

  function handleReset() {
    setParsedRecipe(null);
    setInputText('');
    setCapturedPages([]);
    setEditImageUrl('');
    setImageLoadError(false);
    setErrorMsg(null);
  }

  // Edit or review: prefills the form with the received recipe (once per object)
  const formSource = review?.recipe ?? editingRecipe ?? null;
  const [loadedSource, setLoadedSource] = useState<Recipe | null>(null);
  if (formSource && formSource !== loadedSource) {
    setLoadedSource(formSource);
    loadRecipeIntoForm(formSource);
  }

  // Shared link: switches to the text tab and inserts it once per value
  const [appliedInitialUrl, setAppliedInitialUrl] = useState<string | null>(null);
  if (visible && initialUrl && initialUrl !== appliedInitialUrl) {
    setAppliedInitialUrl(initialUrl);
    setActiveTab('text');
    setInputText(initialUrl);
    setErrorMsg(null);
  }

  return (
    <SheetModal visible={visible} onClose={onClose} fullScreen>
      <View style={styles.safeArea}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <View style={styles.sparkleIcon}>
                <Ionicons name="sparkles" size={18} color={colors.primaryText} />
              </View>
              <View>
                <Text style={styles.headerTitle}>
                  {review ? review.title : editingRecipe ? t('recipeImporter.editTitle') : 'Magic Importer AI'}
                </Text>
                <Text style={styles.headerSubtitle}>
                  {review
                    ? t('recipeImporter.verifyBeforeSave')
                    : editingRecipe ? t('recipeImporter.editSubtitle') : t('recipeImporter.importSubtitle')}
                </Text>
              </View>
            </View>
            <TouchableOpacity style={styles.closeButton} onPress={onClose} activeOpacity={0.7}>
              <Ionicons name="close" size={20} color={colors.textSecondary} />
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
                    color={activeTab === 'text' ? colors.primaryText : colors.textMuted}
                  />
                  <Text style={[styles.tabLabel, activeTab === 'text' && styles.tabLabelActive]}>
                    {t('recipeImporter.tabText')}
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
                    color={activeTab === 'photo' ? colors.primaryText : colors.textMuted}
                  />
                  <Text style={[styles.tabLabel, activeTab === 'photo' && styles.tabLabelActive]}>
                    {t('recipeImporter.tabPhoto')}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Error Box */}
              {errorMsg && (
                <View style={styles.errorBox}>
                  <Ionicons name="alert-circle" size={18} color={colors.danger} />
                  <Text style={styles.errorText}>{errorMsg}</Text>
                </View>
              )}

              {/* TAB 1: TEXT / URL */}
              {activeTab === 'text' && (
                <View style={styles.inputSection}>
                  <View style={styles.inputHeaderRow}>
                    <Text style={styles.sectionTitle}>{t('recipeImporter.pasteTextTitle')}</Text>
                    <TouchableOpacity style={styles.pasteButton} onPress={handlePasteFromClipboard} activeOpacity={0.75}>
                      <Ionicons name="clipboard-outline" size={13} color={colors.primaryText} />
                      <Text style={styles.pasteButtonText}>{t('recipeImporter.paste')}</Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.sectionSubtitle}>
                    {t('recipeImporter.pasteHint')}
                  </Text>
                  <AppTextField
                    style={styles.textAreaField}
                    multiline
                    numberOfLines={8}
                    placeholder={t('recipeImporter.pastePlaceholder')}
                    value={inputText}
                    onChangeText={setInputText}
                  />
                </View>
              )}

              {/* TAB 2: PHOTO / CAMERA */}
              {activeTab === 'photo' && (
                <View style={styles.inputSection}>
                  <View style={styles.inputHeaderRow}>
                    <Text style={styles.sectionTitle}>{t('recipeImporter.bookPagesTitle')}</Text>
                    {capturedPages.length > 0 && (
                      <TouchableOpacity
                        style={styles.clearPagesBtn}
                        onPress={() => setCapturedPages([])}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="trash-outline" size={13} color={colors.danger} />
                        <Text style={styles.clearPagesText}>{t('recipeImporter.removeAll')}</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  <Text style={styles.sectionSubtitle}>
                    {t('recipeImporter.photoHint')}
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
                              <Text style={styles.pageBadgeText}>{t('recipeImporter.pageBadge', { n: index + 1 })}</Text>
                            </View>
                            <TouchableOpacity
                              style={styles.pageDeleteBtn}
                              onPress={() => handleRemovePage(index)}
                              activeOpacity={0.8}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                              <Ionicons name="close" size={14} color={colors.onPrimary} />
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
                            <Ionicons name="camera-outline" size={18} color={colors.primaryText} />
                            <Text style={styles.appendPageBtnText}>{t('recipeImporter.takePageN', { n: capturedPages.length + 1 })}</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={[styles.appendPageBtn, styles.appendPageBtnSecondary]}
                            onPress={handlePickImage}
                            activeOpacity={0.75}
                          >
                            <Ionicons name="images-outline" size={18} color={colors.primaryText} />
                            <Text style={styles.appendPageBtnText}>{t('recipeImporter.pickFromGallery')}</Text>
                          </TouchableOpacity>
                        </View>
                      )}

                      <View style={styles.pagesHintBox}>
                        <View style={styles.bannerIconSlot}>
                          <Ionicons name="information-circle-outline" size={16} color={colors.primaryText} />
                        </View>
                        <Text style={styles.pagesHintText}>
                          {capturedPages.length === 1
                            ? t('recipeImporter.onePageHint')
                            : t('recipeImporter.pagesHint', { count: capturedPages.length })}
                        </Text>
                      </View>
                    </View>
                  ) : (
                    <View style={styles.photoActionsRow}>
                      <TouchableOpacity style={styles.photoActionButton} onPress={handleTakePhoto} activeOpacity={0.75}>
                        <Ionicons name="camera-outline" size={30} color={colors.primaryText} />
                        <Text style={styles.photoActionLabel}>{t('recipeImporter.takeFirstPage')}</Text>
                        <Text style={styles.photoActionSub}>{t('recipeImporter.withCamera')}</Text>
                      </TouchableOpacity>

                      <TouchableOpacity style={styles.photoActionButton} onPress={handlePickImage} activeOpacity={0.75}>
                        <Ionicons name="images-outline" size={30} color={colors.primaryText} />
                        <Text style={styles.photoActionLabel}>{t('recipeImporter.chooseFromGallery')}</Text>
                        <Text style={styles.photoActionSub}>{t('recipeImporter.multiPages')}</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              )}

              {/* VARIANTS: choose which versions to generate after the original */}
              <View style={styles.dietCard}>
                <DietSwitchRow
                  icon={<MaterialCommunityIcons name="food-drumstick-off-outline" size={18} color={wantVegetarian ? colors.onPrimary : colors.primaryText} />}
                  title={t('recipeImporter.vegetarianVersion')}
                  hint={t('recipeImporter.vegetarianHint')}
                  value={wantVegetarian}
                  disabled={loading}
                  onValueChange={setWantVegetarian}
                  styles={styles}
                  colors={colors}
                />
                <View style={styles.dietDivider} />
                <DietSwitchRow
                  icon={<Ionicons name="leaf" size={18} color={wantVegan ? colors.onPrimary : colors.primaryText} />}
                  title={t('recipeImporter.veganVersion')}
                  hint={t('recipeImporter.veganHint')}
                  value={wantVegan}
                  disabled={loading}
                  onValueChange={setWantVegan}
                  styles={styles}
                  colors={colors}
                />
                <View style={styles.dietSummary}>
                  <View style={styles.bannerIconSlot}>
                    <Ionicons name="information-circle-outline" size={16} color={colors.primaryText} />
                  </View>
                  <Text style={styles.dietSummaryText}>{t(VARIANT_SUMMARY[variantSummaryKey])}</Text>
                </View>
              </View>

              {/* SUBMIT BUTTON */}
              <TouchableOpacity
                style={[styles.parseButton, loading && styles.parseButtonDisabled]}
                onPress={handleStartParsing}
                disabled={loading}
                activeOpacity={0.88}
              >
                {loading ? (
                  <View style={styles.loadingRow}>
                    <ActivityIndicator size="small" color={colors.onPrimary} />
                    <Text style={styles.parseButtonText}>{loadingMessage}</Text>
                  </View>
                ) : (
                  <View style={styles.loadingRow}>
                    <Ionicons name="sparkles" size={18} color={colors.onPrimary} />
                    <Text style={styles.parseButtonText}>
                      {activeTab === 'photo' && capturedPages.length > 1
                        ? t('recipeImporter.extractFromPages', { count: capturedPages.length })
                        : t('recipeImporter.extractRecipe')}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            </ScrollView>
          ) : (
            // REVIEW & EDIT PARSED RECIPE SCREEN
            <View style={styles.reviewContainer}>
            <ScrollView style={styles.reviewScroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
              <View style={styles.successBanner}>
                <Ionicons name="checkmark-circle" size={20} color={colors.primaryText} />
                <Text style={styles.successBannerText}>{t('recipeImporter.extractSuccess')}</Text>
              </View>

              {/* Title */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>{t('recipeImporter.fields.title')}</Text>
                <AppTextField
                  value={editTitle}
                  onChangeText={setEditTitle}
                />
              </View>

              {/* Category */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>{t('recipeImporter.fields.category')}</Text>
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

              {/* Subcategory */}
              {RECIPE_TAXONOMY[editCategory as MacroCategory] && (
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>{t('recipeImporter.fields.subcategory')}</Text>
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
                <Text style={styles.fieldLabel}>{t('recipeImporter.fields.plannerSlot')}</Text>
                <SegmentedSelector options={SLOTS.map(s => ({ ...s, label: t(s.label) }))} value={editSlot} onChange={setEditSlot} styles={styles} />
              </View>

              {/* Diet: computed from the ingredients, manually correctable */}
              <View style={styles.fieldGroup}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <Text style={[styles.fieldLabel, { marginBottom: 0 }]}>{t('recipeImporter.fields.diet')}</Text>
                  {dietChosenByHand ? (
                    <Text style={{ fontSize: 11, color: colors.textSecondary }}>{t('recipeImporter.fields.dietByHand')}</Text>
                  ) : null}
                </View>
                <SegmentedSelector
                  options={[
                    { value: 'omnivore' as RecipeDiet, label: t('recipeImporter.diet.omnivore') },
                    { value: 'vegetarian' as RecipeDiet, label: t('recipeImporter.diet.vegetarian') },
                    { value: 'vegan' as RecipeDiet, label: t('recipeImporter.diet.vegan') },
                  ]}
                  value={editDiet}
                  styles={styles}
                  onChange={value => {
                    setEditDiet(value);
                    setDietChosenByHand(true);
                  }}
                />
              </View>

              {/* Row: Servings, Time, Difficulty */}
              <View style={styles.rowThree}>
                <View style={[styles.fieldGroup, { flex: 1 }]}>
                  <Text style={styles.fieldLabel}>{t('recipeImporter.fields.servings')}</Text>
                  <AppTextField
                    value={editServings}
                    onChangeText={setEditServings}
                    keyboardType="number-pad"
                  />
                </View>
                <View style={[styles.fieldGroup, { flex: 1, marginHorizontal: 8 }]}>
                  <Text style={styles.fieldLabel}>{t('recipeImporter.fields.time')}</Text>
                  <AppTextField
                    value={editTotalTime}
                    onChangeText={setEditTotalTime}
                    keyboardType="number-pad"
                  />
                </View>
                <View style={[styles.fieldGroup, { flex: 1 }]}>
                  <Text style={styles.fieldLabel}>{t('recipeImporter.fields.difficulty')}</Text>
                  <SegmentedSelector
                    options={(['Facile', 'Media', 'Difficile'] as const).map(d => ({ value: d, label: t(`recipeImporter.difficultyShort.${d}`) }))}
                    value={editDifficulty}
                    styles={styles}
                    onChange={setEditDifficulty}
                  />
                </View>
              </View>

              {/* Substitutions made by the AI: read-only, for checking them */}
              {substitutions.length > 0 && (
                <View style={styles.substitutionsCard}>
                  <Text style={styles.substitutionsTitle}>{t('recipeImporter.substitutions')}</Text>
                  <Text style={styles.substitutionsNote}>{t('recipeImporter.substitutionsNote')}</Text>
                  {substitutions.map((s, index) => (
                    <View key={`${s.from}-${index}`} style={styles.substitutionRow}>
                      <Text style={styles.substitutionFrom}>{s.from}</Text>
                      <Ionicons name="arrow-forward" size={14} color={colors.primaryText} />
                      <Text style={styles.substitutionTo}>{s.to}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Image URL */}
              <View style={styles.fieldGroup}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <Text style={[styles.fieldLabel, { marginBottom: 0 }]}>{t('recipeImporter.fields.imageLink')}</Text>
                  {editImageUrl ? (
                    <TouchableOpacity
                      onPress={() => {
                        setEditImageUrl('');
                        setImageLoadError(false);
                      }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Text style={{ fontSize: 12, color: colors.danger, fontWeight: '600' }}>{t('recipeImporter.remove')}</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
                <AppTextField
                  placeholder="https://..."
                  value={editImageUrl}
                  onChangeText={(text) => {
                    setEditImageUrl(text);
                    setImageLoadError(false);
                  }}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <View style={styles.imageActionsRow}>
                  <TouchableOpacity style={styles.imageActionBtn} onPress={openGoogleImageSearch} activeOpacity={0.75}>
                    <Ionicons name="search-outline" size={14} color={colors.primaryText} />
                    <Text style={styles.imageActionText}>{t('recipeImporter.searchGoogleImages')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.imageActionBtn} onPress={handlePasteImageUrl} activeOpacity={0.75}>
                    <Ionicons name="clipboard-outline" size={14} color={colors.primaryText} />
                    <Text style={styles.imageActionText}>{t('recipeImporter.pasteLink')}</Text>
                  </TouchableOpacity>
                </View>
                {editImageUrl && !imageLoadError ? (
                  <View style={{ marginTop: 8, height: 180, borderRadius: 10, overflow: 'hidden', backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border }}>
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
                  <View style={{ marginTop: 8, padding: 10, borderRadius: 8, backgroundColor: colors.dangerSoft, borderWidth: 1, borderColor: colors.danger, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Ionicons name="image-outline" size={18} color={colors.danger} />
                    <Text style={{ fontSize: 12, color: colors.danger, flex: 1 }}>
                      {t('recipeImporter.previewUnavailable')}
                    </Text>
                  </View>
                ) : null}
              </View>

              {/* Ingredients */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>{t('recipeImporter.fields.ingredients')}</Text>
                <AppTextField
                  style={{ minHeight: 140 }}
                  multiline
                  value={editIngredients}
                  onChangeText={setEditIngredients}
                />
              </View>

              {/* Instructions */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>{t('recipeImporter.fields.instructions')}</Text>
                <AppTextField
                  style={{ minHeight: 140 }}
                  multiline
                  value={editInstructions}
                  onChangeText={setEditInstructions}
                />
              </View>

              {/* Tips */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>{t('recipeImporter.fields.tips')}</Text>
                <AppTextField
                  style={{ minHeight: 80 }}
                  multiline
                  value={editTips}
                  onChangeText={setEditTips}
                />
              </View>

              {review && (
                <View style={styles.fieldGroup}>
                  {review.recipe.needs_review ? (
                    <Text style={styles.reviewWarning}>
                      {t('recipeImporter.needsReviewWarning')}
                    </Text>
                  ) : null}
                  <View style={styles.retrySection}>
                    <Text style={styles.fieldLabel}>{t('recipeImporter.retryInstructions')}</Text>
                    <AppTextField
                      placeholder={t('recipeImporter.retryPlaceholder')}
                      value={retryInstructions}
                      onChangeText={setRetryInstructions}
                      autoCapitalize="sentences"
                    />
                    <TouchableOpacity
                      style={[styles.retryBtnFull, retrying && styles.disabledBtn]}
                      onPress={handleRetry}
                      disabled={retrying}
                      activeOpacity={0.75}
                    >
                      <Ionicons name="refresh" size={14} color={colors.primaryText} />
                      <Text style={styles.imageActionText}>{retrying ? t('recipeImporter.generating') : t('recipeImporter.retry')}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

            </ScrollView>

              {/* Actions Footer */}
              <View style={styles.actionsFooter}>
                {review ? (
                  <TouchableOpacity style={styles.resetButton} onPress={discardReview} activeOpacity={0.75}>
                    <Ionicons name="trash-outline" size={18} color={colors.textSecondary} />
                    <Text style={styles.resetButtonText}>{t('recipeImporter.discard')}</Text>
                  </TouchableOpacity>
                ) : !editingRecipe && (
                  <TouchableOpacity style={styles.resetButton} onPress={handleReset} activeOpacity={0.75}>
                    <Ionicons name="arrow-back" size={18} color={colors.textSecondary} />
                    <Text style={styles.resetButtonText}>{t('recipeImporter.restart')}</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity style={styles.saveRecipeBtn} onPress={handleSaveRecipe} activeOpacity={0.88}>
                  <Ionicons name="checkmark-circle" size={20} color={colors.onPrimary} />
                  <Text style={styles.saveRecipeBtnText}>
                    {review ? t('recipeImporter.saveVariant') : wantedVariants.length > 0 && !editingRecipe ? t('recipeImporter.saveAndCheckVariants') : t('recipeImporter.saveToRecipeBook')}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </KeyboardAvoidingView>
      </View>
      <UnresolvedIngredientsModal
        visible={pendingIngredients !== null}
        items={pendingIngredients?.items ?? []}
        known={pendingIngredients?.known ?? []}
        onConfirm={choices => {
          const pending = pendingIngredients;
          setPendingIngredients(null);
          if (pending) void commitRecipe(pending.recipe, choices);
        }}
        onCancel={() => setPendingIngredients(null)}
      />
    </SheetModal>
  );
}

const makeStyles = (colors: Palette, isDark: boolean) => StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: colors.surfaceAlt,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
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
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  headerSubtitle: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 1,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    padding: 18,
    paddingBottom: 40,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceMuted,
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
    backgroundColor: colors.surface,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  tabLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
  },
  tabLabelActive: {
    color: colors.primaryText,
    fontWeight: '700',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.dangerSoft,
    borderColor: colors.danger,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    gap: 8,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    color: colors.danger,
    fontWeight: '600',
  },
  inputSection: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 20,
    shadowColor: colors.shadow,
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
    color: colors.text,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
    marginBottom: 14,
  },
  dietHintText: { fontSize: 12, color: colors.textSecondary, marginTop: 6 },
  reviewWarning: { fontSize: 13, fontWeight: '600', color: (isDark ? '#FCD34D' : '#B45309'), backgroundColor: (isDark ? '#3D2E0E' : '#FEF3C7'), borderRadius: 10, padding: 10, marginBottom: 12, lineHeight: 18 },
  retryBtn: { alignSelf: 'flex-start', marginTop: 8 },
  retrySection: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 8,
  },
  retryBtnFull: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  reviewContainer: { flex: 1 },
  reviewScroll: { flex: 1 },
  disabledBtn: { opacity: 0.5 },
  imageActionsRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  imageActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  imageActionText: { fontSize: 12, fontWeight: '700', color: colors.primaryText },
  pasteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
  },
  pasteButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primaryText,
  },
  textAreaField: {
    minHeight: 170,
  },
  photoActionsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  photoActionButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
    borderRadius: 16,
    paddingVertical: 26,
    gap: 8,
  },
  photoActionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  photoActionSub: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: -2,
  },
  clearPagesBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.dangerSoft,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  clearPagesText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.danger,
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
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    position: 'relative',
    shadowColor: colors.shadow,
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
    backgroundColor: `${colors.primary}E6`,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  pageBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.onPrimary,
  },
  pageDeleteBtn: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.overlay,
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
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    paddingVertical: 11,
    borderRadius: 12,
  },
  appendPageBtnSecondary: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
  },
  appendPageBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primaryText,
  },
  // Icon aligned with the first line of text: same height as the line (lineHeight 17)
  bannerIconSlot: {
    height: 17,
    justifyContent: 'center',
  },
  pagesHintBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  pagesHintText: {
    flex: 1,
    fontSize: 12,
    color: colors.text,
    lineHeight: 17,
    fontWeight: '500',
  },
  parseButton: {
    backgroundColor: colors.primary,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  parseButtonDisabled: {
    opacity: 0.7,
  },
  dietCard: {
    marginTop: 16,
    marginBottom: 16,
    padding: 14,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  dietRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  dietDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 12,
  },
  dietIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  dietIconCircleActive: {
    backgroundColor: colors.primary,
  },
  dietTextBox: {
    flex: 1,
  },
  dietTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  dietHint: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 17,
    marginTop: 2,
  },
  dietSummary: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 14,
    padding: 10,
    borderRadius: 12,
    backgroundColor: colors.primarySoft,
  },
  dietSummaryText: {
    flex: 1,
    fontSize: 12,
    color: colors.primaryText,
    lineHeight: 17,
  },
  substitutionsCard: {
    marginBottom: 15,
    padding: 14,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  substitutionsTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  substitutionsNote: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
    marginBottom: 10,
  },
  substitutionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginTop: 6,
    borderRadius: 12,
    backgroundColor: colors.primarySoft,
  },
  substitutionFrom: {
    flex: 1,
    fontSize: 13,
    color: colors.textSecondary,
  },
  substitutionTo: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  parseButtonText: {
    color: colors.onPrimary,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderColor: colors.borderStrong,
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
    color: colors.text,
    lineHeight: 18,
  },
  fieldGroup: {
    marginBottom: 15,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 6,
  },
  chipsScroll: {
    flexDirection: 'row',
  },
  chip: {
    paddingHorizontal: 13,
    paddingVertical: 7,
    backgroundColor: colors.surfaceMuted,
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  chipTextActive: {
    color: colors.onPrimary,
    fontWeight: '700',
  },
  rowThree: {
    flexDirection: 'row',
  },
  diffSelector: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceMuted,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    height: 42,
  },
  diffItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  diffItemActive: {
    backgroundColor: colors.primary,
  },
  diffItemText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  diffItemTextActive: {
    color: colors.onPrimary,
    fontWeight: '700',
  },
  actionsFooter: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  resetButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 14,
    borderRadius: 14,
    gap: 6,
  },
  resetButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  saveRecipeBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: 14,
    gap: 6,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  saveRecipeBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.onPrimary,
  },
});

type Styles = ReturnType<typeof makeStyles>;

// Segmented selector: single style for slot, difficulty and diet
function SegmentedSelector<T extends string>({
  options,
  value,
  onChange,
  styles,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  styles: Styles;
}) {
  return (
    <View style={styles.diffSelector}>
      {options.map(option => {
        const active = option.value === value;
        return (
          <TouchableOpacity
            key={option.value}
            style={[styles.diffItem, active && styles.diffItemActive]}
            onPress={() => onChange(option.value)}
          >
            <Text style={[styles.diffItemText, active && styles.diffItemTextActive]}>{option.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function DietSwitchRow({
  icon,
  title,
  hint,
  value,
  disabled,
  onValueChange,
  styles,
  colors,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
  value: boolean;
  disabled: boolean;
  onValueChange: (value: boolean) => void;
  styles: Styles;
  colors: Palette;
}) {
  return (
    <View style={styles.dietRow}>
      <View style={[styles.dietIconCircle, value && styles.dietIconCircleActive]}>{icon}</View>
      <View style={styles.dietTextBox}>
        <Text style={styles.dietTitle}>{title}</Text>
        <Text style={styles.dietHint}>{hint}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ false: colors.borderStrong, true: colors.primary }}
        thumbColor={colors.onPrimary}
        ios_backgroundColor={colors.borderStrong}
      />
    </View>
  );
}
