import { SheetModal } from './SheetModal';
import React, { useMemo, useState } from 'react';
import {
  StyleSheet,
  Switch,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
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
import { Button } from './ui/Button';
import { CircleButton } from './ui/CircleButton';
import { ModalHeader } from './ui/ModalHeader';
import { SectionTitle } from './ui/SectionTitle';
import { Pill } from './ui/Pill';
import { text, icon, cardRadius, elevation, radius, size as sizes, space } from '../theme/tokens';
import { SegmentedControl } from './ui/SegmentedControl';
import { Card } from './ui/Card';
import { Divider } from './ui/Divider';
import { InlineNotice } from './ui/InlineNotice';

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
    setEditTitle(recipe.title || t('recipeImporter.defaultTitle'));
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
          <ModalHeader
            title={review ? review.title : editingRecipe ? t('recipeImporter.editTitle') : 'Magic Importer AI'}
            subtitle={
              review
                ? t('recipeImporter.verifyBeforeSave')
                : editingRecipe ? t('recipeImporter.editSubtitle') : t('recipeImporter.importSubtitle')
            }
            onClose={onClose}
            closeLabel={t('common.close')}
          />

          {!parsedRecipe ? (
            // INPUT SCREEN
            <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
              {/* Tab Selector */}
              <View style={styles.tabBar}>
                <SegmentedControl
                  accessibilityLabel={t('recipeImporter.tabsLabel')}
                  options={[
                    { key: 'text', label: t('recipeImporter.tabText'), icon: 'document-text' },
                    { key: 'photo', label: t('recipeImporter.tabPhoto'), icon: 'camera' },
                  ]}
                  value={activeTab}
                  onChange={key => { setActiveTab(key as 'text' | 'photo'); setErrorMsg(null); }}
                />
              </View>

              {/* Error Box */}
              {errorMsg && (
                <View style={styles.errorBox}>
                  <InlineNotice tone="danger" icon="alert-circle" text={errorMsg} />
                </View>
              )}

              {/* TAB 1: TEXT / URL */}
              {activeTab === 'text' && (
                <Card elevation={1} style={styles.inputSection}>
                  <View style={styles.inputHeaderRow}>
                    <View style={styles.sectionTitleWrap}>
                      <SectionTitle title={t('recipeImporter.pasteTextTitle')} subtitle={t('recipeImporter.pasteHint')} />
                    </View>
                    <Button
                      variant="secondary"
                      size="M"
                      icon="clipboard-outline"
                      label={t('recipeImporter.paste')}
                      onPress={handlePasteFromClipboard}
                    />
                  </View>
                  <AppTextField
                    style={styles.textAreaField}
                    multiline
                    numberOfLines={8}
                    placeholder={t('recipeImporter.pastePlaceholder')}
                    value={inputText}
                    onChangeText={setInputText}
                  />
                </Card>
              )}

              {/* TAB 2: PHOTO / CAMERA */}
              {activeTab === 'photo' && (
                <Card elevation={1} style={styles.inputSection}>
                  <View style={styles.inputHeaderRow}>
                    <View style={styles.sectionTitleWrap}>
                      <SectionTitle title={t('recipeImporter.bookPagesTitle')} subtitle={t('recipeImporter.photoHint')} />
                    </View>
                    {capturedPages.length > 0 && (
                      <Button
                        variant="danger"
                        size="M"
                        icon="trash-outline"
                        label={t('recipeImporter.removeAll')}
                        onPress={() => setCapturedPages([])}
                      />
                    )}
                  </View>

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
                              <Pill variant="primary" label={t('recipeImporter.pageBadge', { n: index + 1 })} />
                            </View>
                            <View style={styles.pageDeleteWrap}>
                              <CircleButton
                                size="S"
                                variant="filled"
                                icon="close"
                                accessibilityLabel={t('recipeImporter.remove')}
                                onPress={() => handleRemovePage(index)}
                              />
                            </View>
                          </View>
                        ))}
                      </ScrollView>

                      {/* Add more pages actions */}
                      {capturedPages.length < 5 && (
                        <View style={styles.appendPageRow}>
                          <View style={styles.buttonFill}>
                            <Button
                              variant="secondary"
                              size="M"
                              icon="camera-outline"
                              label={t('recipeImporter.takePageN', { n: capturedPages.length + 1 })}
                              onPress={handleTakePhoto}
                            />
                          </View>

                          <View style={styles.buttonFill}>
                            <Button
                              variant="secondary"
                              size="M"
                              icon="images-outline"
                              label={t('recipeImporter.pickFromGallery')}
                              onPress={handlePickImage}
                            />
                          </View>
                        </View>
                      )}

                      <View style={styles.pagesHintBox}>
                        <View style={styles.bannerIconSlot}>
                          <Ionicons name="information-circle-outline" size={icon.sm} color={colors.primaryText} />
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
                      <View style={styles.photoActionCol}>
                        <Button
                          variant="secondary"
                          size="M"
                          icon="camera-outline"
                          label={t('recipeImporter.takeFirstPage')}
                          onPress={handleTakePhoto}
                        />
                        <Text style={styles.photoActionSub}>{t('recipeImporter.withCamera')}</Text>
                      </View>

                      <View style={styles.photoActionCol}>
                        <Button
                          variant="secondary"
                          size="M"
                          icon="images-outline"
                          label={t('recipeImporter.chooseFromGallery')}
                          onPress={handlePickImage}
                        />
                        <Text style={styles.photoActionSub}>{t('recipeImporter.multiPages')}</Text>
                      </View>
                    </View>
                  )}
                </Card>
              )}

              {/* VARIANTS: choose which versions to generate after the original */}
              <Card elevation={2} padding="xxl" style={styles.dietCard}>
                <DietSwitchRow
                  icon={<MaterialCommunityIcons name="food-drumstick-off-outline" size={icon.md} color={wantVegetarian ? colors.onPrimary : colors.primaryText} />}
                  title={t('recipeImporter.vegetarianVersion')}
                  hint={t('recipeImporter.vegetarianHint')}
                  value={wantVegetarian}
                  disabled={loading}
                  onValueChange={setWantVegetarian}
                  styles={styles}
                  colors={colors}
                />
                <Divider marginVertical="xl" />
                <DietSwitchRow
                  icon={<Ionicons name="leaf" size={icon.md} color={wantVegan ? colors.onPrimary : colors.primaryText} />}
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
                    <Ionicons name="information-circle-outline" size={icon.sm} color={colors.primaryText} />
                  </View>
                  <Text style={styles.dietSummaryText}>{t(VARIANT_SUMMARY[variantSummaryKey])}</Text>
                </View>
              </Card>

              {/* SUBMIT BUTTON */}
              <Button
                variant="primary"
                size="L"
                icon={loading ? undefined : 'sparkles'}
                label={
                  loading
                    ? loadingMessage
                    : activeTab === 'photo' && capturedPages.length > 1
                      ? t('recipeImporter.extractFromPages', { count: capturedPages.length })
                      : t('recipeImporter.extractRecipe')
                }
                onPress={handleStartParsing}
                disabled={loading}
              />
            </ScrollView>
          ) : (
            // REVIEW & EDIT PARSED RECIPE SCREEN
            <View style={styles.reviewContainer}>
            <ScrollView style={styles.reviewScroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
              <View style={styles.successBanner}>
                <Ionicons name="checkmark-circle" size={icon.lg} color={colors.primaryText} />
                <Text style={styles.successBannerText}>{t('recipeImporter.extractSuccess')}</Text>
              </View>

              {/* Title */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>{t('recipeImporter.fields.title')}</Text>
                <AppTextField
                  size="M"
                  value={editTitle}
                  onChangeText={setEditTitle}
                />
              </View>

              {/* Category */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>{t('recipeImporter.fields.category')}</Text>
                <SegmentedControl
                  accessibilityLabel={t('recipeImporter.fields.category')}
                  options={CATEGORIES.map(cat => ({ key: cat, label: t('categories.' + cat, { defaultValue: cat }) }))}
                  value={editCategory}
                  onChange={cat => {
                    setEditCategory(cat);
                    const firstSub = RECIPE_TAXONOMY[cat as MacroCategory]?.[0] || '';
                    setEditSubCategory(firstSub);
                  }}
                />
              </View>

              {/* Subcategory */}
              {RECIPE_TAXONOMY[editCategory as MacroCategory] && (
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>{t('recipeImporter.fields.subcategory')}</Text>
                  <SegmentedControl
                    accessibilityLabel={t('recipeImporter.fields.subcategory')}
                    options={RECIPE_TAXONOMY[editCategory as MacroCategory].map(sub => ({ key: sub, label: t('categories.' + sub, { defaultValue: sub }) }))}
                    value={editSubCategory}
                    onChange={setEditSubCategory}
                  />
                </View>
              )}

              {/* Slot Planner */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>{t('recipeImporter.fields.plannerSlot')}</Text>
                <SegmentedControl
                  accessibilityLabel={t('recipeImporter.fields.plannerSlot')}
                  options={SLOTS.map(s => ({ key: s.value, label: t(s.label) }))}
                  value={editSlot}
                  onChange={key => setEditSlot(key as typeof editSlot)}
                />
              </View>

              {/* Diet: computed from the ingredients, manually correctable */}
              <View style={styles.fieldGroup}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space.sm }}>
                  <Text style={[styles.fieldLabel, { marginBottom: 0 }]}>{t('recipeImporter.fields.diet')}</Text>
                  {dietChosenByHand ? (
                    <Text style={{ fontSize: text.label, color: colors.textSecondary }}>{t('recipeImporter.fields.dietByHand')}</Text>
                  ) : null}
                </View>
                <SegmentedControl
                  accessibilityLabel={t('recipeImporter.fields.diet')}
                  options={(['omnivore', 'vegetarian', 'vegan'] as const).map(d => ({ key: d, label: t(`recipeImporter.diet.${d}`) }))}
                  value={editDiet}
                  onChange={key => {
                    setEditDiet(key as RecipeDiet);
                    setDietChosenByHand(true);
                  }}
                />
              </View>

              {/* Row: Servings, Time, Difficulty */}
              <View style={styles.rowThree}>
                <View style={[styles.fieldGroup, { flex: 1 }]}>
                  <Text style={styles.fieldLabel}>{t('recipeImporter.fields.servings')}</Text>
                  <AppTextField
                    size="M"
                    value={editServings}
                    onChangeText={setEditServings}
                    keyboardType="number-pad"
                  />
                </View>
                <View style={[styles.fieldGroup, { flex: 1, marginHorizontal: space.md }]}>
                  <Text style={styles.fieldLabel}>{t('recipeImporter.fields.time')}</Text>
                  <AppTextField
                    size="M"
                    value={editTotalTime}
                    onChangeText={setEditTotalTime}
                    keyboardType="number-pad"
                  />
                </View>
                <View style={[styles.fieldGroup, { flex: 1 }]}>
                  <Text style={styles.fieldLabel}>{t('recipeImporter.fields.difficulty')}</Text>
                  <SegmentedControl
                    accessibilityLabel={t('recipeImporter.fields.difficulty')}
                    options={(['Facile', 'Media', 'Difficile'] as const).map(d => ({ key: d, label: t(`recipeImporter.difficultyShort.${d}`) }))}
                    value={editDifficulty}
                    onChange={key => setEditDifficulty(key as typeof editDifficulty)}
                  />
                </View>
              </View>

              {/* Substitutions made by the AI: read-only, for checking them */}
              {substitutions.length > 0 && (
                <Card padding="xxl" style={styles.substitutionsCard}>
                  <Text style={styles.substitutionsTitle}>{t('recipeImporter.substitutions')}</Text>
                  <Text style={styles.substitutionsNote}>{t('recipeImporter.substitutionsNote')}</Text>
                  {substitutions.map((s, index) => (
                    <View key={`${s.from}-${index}`} style={styles.substitutionRow}>
                      <Text style={styles.substitutionFrom}>{s.from}</Text>
                      <Ionicons name="arrow-forward" size={icon.xs} color={colors.primaryText} />
                      <Text style={styles.substitutionTo}>{s.to}</Text>
                    </View>
                  ))}
                </Card>
              )}

              {/* Image URL */}
              <View style={styles.fieldGroup}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space.sm }}>
                  <Text style={[styles.fieldLabel, { marginBottom: 0 }]}>{t('recipeImporter.fields.imageLink')}</Text>
                  {editImageUrl ? (
                    <TouchableOpacity
                      onPress={() => {
                        setEditImageUrl('');
                        setImageLoadError(false);
                      }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Text style={{ fontSize: text.caption, color: colors.danger, fontWeight: '600' }}>{t('recipeImporter.remove')}</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
                <AppTextField
                  size="M"
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
                  <View style={styles.buttonFill}>
                    <Button
                      variant="secondary"
                      size="M"
                      icon="search-outline"
                      label={t('recipeImporter.searchGoogleImages')}
                      onPress={openGoogleImageSearch}
                    />
                  </View>
                  <View style={styles.buttonFill}>
                    <Button
                      variant="secondary"
                      size="M"
                      icon="clipboard-outline"
                      label={t('recipeImporter.pasteLink')}
                      onPress={handlePasteImageUrl}
                    />
                  </View>
                </View>
                {editImageUrl && !imageLoadError ? (
                  <View style={{ marginTop: space.md, height: 180, borderRadius: radius.sm, overflow: 'hidden', backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border }}>
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
                  <View style={{ marginTop: space.md }}>
                    <InlineNotice tone="danger" icon="image-outline" text={t('recipeImporter.previewUnavailable')} />
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
                    <View style={styles.reviewWarning}>
                      <InlineNotice tone="caution" text={t('recipeImporter.needsReviewWarning')} />
                    </View>
                  ) : null}
                  <View style={styles.retrySection}>
                    <Text style={styles.fieldLabel}>{t('recipeImporter.retryInstructions')}</Text>
                    <AppTextField
                      size="M"
                      placeholder={t('recipeImporter.retryPlaceholder')}
                      value={retryInstructions}
                      onChangeText={setRetryInstructions}
                      autoCapitalize="sentences"
                    />
                    <Button
                      variant="secondary"
                      size="L"
                      icon="refresh"
                      label={retrying ? t('recipeImporter.generating') : t('recipeImporter.retry')}
                      onPress={handleRetry}
                      disabled={retrying}
                    />
                  </View>
                </View>
              )}

            </ScrollView>

              {/* Actions Footer */}
              <View style={styles.actionsFooter}>
                {review ? (
                  <View style={styles.buttonFill}>
                    <Button
                      variant="secondary"
                      size="M"
                      icon="trash-outline"
                      label={t('recipeImporter.discard')}
                      onPress={discardReview}
                    />
                  </View>
                ) : !editingRecipe && (
                  <View style={styles.buttonFill}>
                    <Button
                      variant="secondary"
                      size="M"
                      icon="arrow-back"
                      label={t('recipeImporter.restart')}
                      onPress={handleReset}
                    />
                  </View>
                )}

                <View style={styles.saveFill}>
                  <Button
                    variant="primary"
                    size="L"
                    icon="checkmark-circle"
                    label={review ? t('recipeImporter.saveVariant') : wantedVariants.length > 0 && !editingRecipe ? t('recipeImporter.saveAndCheckVariants') : t('recipeImporter.saveToRecipeBook')}
                    onPress={handleSaveRecipe}
                  />
                </View>
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

  scrollContent: {
    padding: 18,
    paddingBottom: 40,
  },
  tabBar: {
    marginBottom: space.xxxl,
  },
  errorBox: {
    marginBottom: space.xxxl,
  },
  inputSection: {
    padding: 18,
    marginBottom: space.huge,
  },
  inputHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: space.sm,
  },
  sectionTitleWrap: { flex: 1, marginRight: space.md },
  reviewWarning: { marginBottom: space.xl },
  retrySection: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: cardRadius,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.xxl,
    gap: space.md,
  },
  reviewContainer: { flex: 1 },
  reviewScroll: { flex: 1 },
  imageActionsRow: { flexDirection: 'row', gap: space.md, marginTop: space.md },
  // Makes each Button in a row share the available width
  buttonFill: { flex: 1 },
  textAreaField: {
    minHeight: 170,
  },
  photoActionsRow: {
    flexDirection: 'row',
    gap: space.xl,
  },
  photoActionCol: {
    flex: 1,
    gap: space.sm,
  },
  photoActionSub: {
    fontSize: text.label,
    color: colors.textMuted,
    marginTop: -2,
    textAlign: 'center',
  },
  pagesContainer: {
    gap: space.xl,
  },
  pagesScrollList: {
    flexDirection: 'row',
    paddingVertical: space.xs,
    gap: space.xl,
  },
  pageCard: {
    width: 140,
    height: 180,
    borderRadius: cardRadius,
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    position: 'relative',
    ...elevation(2, colors),
  },
  pageThumbnail: {
    width: '100%',
    height: '100%',
  },
  pageBadge: {
    position: 'absolute',
    bottom: 8,
    left: 8,
  },
  // Positions the round delete button over the thumbnail corner
  pageDeleteWrap: {
    position: 'absolute',
    top: 6,
    right: 6,
  },
  appendPageRow: {
    flexDirection: 'row',
    gap: space.lg,
  },
  // Icon aligned with the first line of text: same height as the line (lineHeight 17)
  bannerIconSlot: {
    height: 17,
    justifyContent: 'center',
  },
  pagesHintBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.md,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: space.xl,
    paddingVertical: space.md,
    borderRadius: radius.sm,
  },
  pagesHintText: {
    flex: 1,
    fontSize: text.caption,
    color: colors.text,
    lineHeight: 17,
    fontWeight: '500',
  },
  dietCard: {
    marginTop: space.xxxl,
    marginBottom: space.xxxl,
  },
  dietRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xl,
  },
  dietIconCircle: {
    width: sizes.circle.S,
    height: sizes.circle.S,
    borderRadius: radius.full,
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
    fontSize: text.title,
    fontWeight: '700',
    color: colors.text,
  },
  dietHint: {
    fontSize: text.caption,
    color: colors.textSecondary,
    lineHeight: 17,
    marginTop: 2,
  },
  dietSummary: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.md,
    marginTop: space.xxl,
    padding: space.lg,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
  },
  dietSummaryText: {
    flex: 1,
    fontSize: text.caption,
    color: colors.primaryText,
    lineHeight: 17,
  },
  substitutionsCard: {
    marginBottom: 15,
  },
  substitutionsTitle: {
    fontSize: text.title,
    fontWeight: '700',
    color: colors.text,
  },
  substitutionsNote: {
    fontSize: text.caption,
    color: colors.textSecondary,
    marginTop: 2,
    marginBottom: space.lg,
  },
  substitutionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.sm,
    paddingHorizontal: space.lg,
    marginTop: space.sm,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
  },
  substitutionFrom: {
    flex: 1,
    fontSize: text.caption,
    color: colors.textSecondary,
  },
  substitutionTo: {
    flex: 1,
    fontSize: text.caption,
    fontWeight: '600',
    color: colors.text,
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderColor: colors.borderStrong,
    borderWidth: 1,
    borderRadius: cardRadius,
    padding: space.xxl,
    gap: space.lg,
    marginBottom: 18,
  },
  successBannerText: {
    flex: 1,
    fontSize: text.caption,
    fontWeight: '600',
    color: colors.text,
    lineHeight: 18,
  },
  fieldGroup: {
    marginBottom: 15,
  },
  fieldLabel: {
    fontSize: text.caption,
    fontWeight: '700',
    color: colors.text,
    marginBottom: space.sm,
  },
  rowThree: {
    flexDirection: 'row',
  },
  actionsFooter: {
    flexDirection: 'row',
    gap: space.xl,
    paddingHorizontal: 18,
    paddingVertical: space.xl,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  // Footer save button takes twice the width of the secondary action
  saveFill: { flex: 2 },
});

type Styles = ReturnType<typeof makeStyles>;

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
