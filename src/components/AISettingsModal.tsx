import { SheetModal } from './SheetModal';
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useTranslation } from 'react-i18next';
import { AIProvider, PROVIDER_DEFAULTS, getEnvAIConfig } from '../services/aiService';
import { AISettings, ProviderSettings, loadAISettings, saveAISettings } from '../services/settingsService';
import { useTheme } from '../context/ThemeContext';
import type { Palette } from '../theme/palette';

const PROVIDER_IDS = Object.keys(PROVIDER_DEFAULTS) as AIProvider[];
const AI_STUDIO_KEYS_URL = 'https://aistudio.google.com/api-keys';
const AI_STUDIO_KEY_NAME = 'Green-Whisker';
const GEMINI_SIMPLE_MODEL = 'gemini-flash-lite-latest';
const GEMINI_COMPLEX_MODEL = 'gemini-flash-latest';
const GEMINI_MODEL_PRESETS = ['gemini-flash-lite-latest', 'gemini-flash-latest'];

// Modelli predefiniti per le due famiglie di operazioni di un provider
function defaultModels(id: AIProvider): { simple: string; complex: string } {
  if (id === 'gemini') return { simple: GEMINI_SIMPLE_MODEL, complex: GEMINI_COMPLEX_MODEL };
  const model = getEnvAIConfig(id).model;
  return { simple: model, complex: model };
}

interface AISettingsModalProps {
  visible: boolean;
  onClose: () => void;
}

export function AISettingsModal({ visible, onClose }: AISettingsModalProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [settings, setSettings] = useState<AISettings>({ providers: {} });
  const [provider, setProvider] = useState<AIProvider>('gemini');
  const [fields, setFields] = useState<ProviderSettings>({});
  const [showKey, setShowKey] = useState(false);
  const [message, setMessage] = useState('');

  const defaults = PROVIDER_DEFAULTS[provider];
  const envConfig = getEnvAIConfig(provider);
  const modelDefaults = defaultModels(provider);
  const savedKey = settings.providers[provider]?.apiKey;

  // I campi modello mostrano sempre un valore: quello salvato, altrimenti quello predefinito.
  // Il vecchio campo "model" fa da ripiego per le operazioni semplici (compatibilità con dati già salvati).
  const showProvider = (id: AIProvider, source: AISettings) => {
    const saved = source.providers[id] ?? {};
    const modelDef = defaultModels(id);
    setProvider(id);
    setFields({
      ...saved,
      simpleModel: saved.simpleModel ?? saved.model ?? modelDef.simple,
      complexModel: saved.complexModel ?? modelDef.complex,
    });
  };

  const close = () => {
    setMessage('');
    setShowKey(false);
    onClose();
  };

  useEffect(() => {
    if (!visible) return;
    (async () => {
      const loaded = await loadAISettings();
      setSettings(loaded);
      showProvider(loaded.provider ?? getEnvAIConfig().provider, loaded);
    })();
  }, [visible]);

  // Si salvano solo i valori diversi dai predefiniti, così un futuro cambio di default si applica da solo
  const persist = async (providerFields: ProviderSettings) => {
    const simpleModel = providerFields.simpleModel?.trim();
    const complexModel = providerFields.complexModel?.trim();
    const baseUrl = providerFields.baseUrl?.trim();
    const next: AISettings = {
      ...settings,
      provider,
      providers: {
        ...settings.providers,
        [provider]: {
          apiKey: providerFields.apiKey?.trim() || undefined,
          simpleModel: simpleModel && simpleModel !== modelDefaults.simple ? simpleModel : undefined,
          complexModel: complexModel && complexModel !== modelDefaults.complex ? complexModel : undefined,
          baseUrl: baseUrl && baseUrl !== envConfig.baseUrl ? baseUrl : undefined,
        },
      },
    };
    await saveAISettings(next);
    setSettings(next);
    showProvider(provider, next);
    setMessage(t('aiSettings.saved'));
  };

  const copyKeyName = async () => {
    await Clipboard.setStringAsync(AI_STUDIO_KEY_NAME);
    setMessage(t('aiSettings.guide.copied'));
  };

  const removeKey = () => {
    const cleared = { ...fields, apiKey: undefined };
    setFields(cleared);
    persist(cleared);
  };

  const keyStatus = savedKey
    ? t('aiSettings.keySavedInApp')
    : envConfig.apiKey
      ? t('aiSettings.keyFromEnv')
      : t('aiSettings.noKey');

  return (
    <SheetModal visible={visible} onClose={close} fullScreen>
      <View style={styles.safeArea}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('aiSettings.title')}</Text>
          <TouchableOpacity onPress={close} hitSlop={12} accessibilityLabel={t('common.close')}>
            <Ionicons name="close" size={24} color={colors.primaryText} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.label}>{t('aiSettings.provider')}</Text>
          <View style={styles.chips}>
            {PROVIDER_IDS.map(id => {
              const active = id === provider;
              return (
                <TouchableOpacity
                  key={id}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => showProvider(id, settings)}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{PROVIDER_DEFAULTS[id].label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {provider === 'gemini' && (
            <View style={styles.guide}>
              <Text style={styles.guideTitle}>{t('aiSettings.guide.title')}</Text>
              <TouchableOpacity style={styles.linkBtn} onPress={() => Linking.openURL(AI_STUDIO_KEYS_URL)} activeOpacity={0.85}>
                <Ionicons name="open-outline" size={16} color={colors.onPrimary} />
                <Text style={styles.linkBtnText}>{t('aiSettings.guide.open')}</Text>
              </TouchableOpacity>

              <GuideStep n={1} colors={colors}><Text style={styles.guideText}>{t('aiSettings.guide.step1')}</Text></GuideStep>
              <GuideStep n={2} colors={colors}><Text style={styles.guideText}>{t('aiSettings.guide.step2')}</Text></GuideStep>
              <GuideStep n={3} colors={colors}>
                <Text style={styles.guideText}>{t('aiSettings.guide.step3')}</Text>
                <TouchableOpacity style={styles.copyNameBtn} onPress={copyKeyName} activeOpacity={0.8}>
                  <Ionicons name="copy-outline" size={15} color={colors.primaryText} />
                  <Text style={styles.copyNameText}>{t('aiSettings.guide.copyName', { name: AI_STUDIO_KEY_NAME })}</Text>
                </TouchableOpacity>
              </GuideStep>
              <GuideStep n={4} colors={colors}><Text style={styles.guideText}>{t('aiSettings.guide.step4')}</Text></GuideStep>
            </View>
          )}

          <Text style={styles.label}>{t('aiSettings.apiKey')}</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={[styles.input, styles.inputFlex]}
              value={fields.apiKey ?? ''}
              onChangeText={apiKey => setFields(f => ({ ...f, apiKey }))}
              secureTextEntry={!showKey}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowKey(s => !s)} hitSlop={8}>
              <Ionicons name={showKey ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
          <Text style={styles.hint}>{keyStatus}</Text>

          <Text style={styles.label}>{t('aiSettings.simpleOps')}</Text>
          <TextInput
            style={styles.input}
            value={fields.simpleModel ?? ''}
            onChangeText={simpleModel => setFields(f => ({ ...f, simpleModel }))}
            placeholder={modelDefaults.simple}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {provider === 'gemini' && (
            <ModelPresetChips
              presets={GEMINI_MODEL_PRESETS}
              selected={fields.simpleModel}
              onSelect={preset => setFields(f => ({ ...f, simpleModel: preset }))}
              colors={colors}
            />
          )}
          <Text style={styles.hint}>{t('aiSettings.simpleOpsHint')}</Text>

          <Text style={styles.label}>{t('aiSettings.complexOps')}</Text>
          <TextInput
            style={styles.input}
            value={fields.complexModel ?? ''}
            onChangeText={complexModel => setFields(f => ({ ...f, complexModel }))}
            placeholder={modelDefaults.complex}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {provider === 'gemini' && (
            <ModelPresetChips
              presets={GEMINI_MODEL_PRESETS}
              selected={fields.complexModel}
              onSelect={preset => setFields(f => ({ ...f, complexModel: preset }))}
              colors={colors}
            />
          )}
          <Text style={styles.hint}>{t('aiSettings.complexOpsHint')}</Text>

          {defaults.baseUrlEditable && (
            <>
              <Text style={styles.label}>{t('aiSettings.baseUrl')}</Text>
              <TextInput
                style={styles.input}
                value={fields.baseUrl ?? ''}
                onChangeText={baseUrl => setFields(f => ({ ...f, baseUrl }))}
                placeholder={envConfig.baseUrl}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
              />
            </>
          )}

          <Text style={styles.privacy}>{t('aiSettings.privacy')}</Text>
          {message ? <Text style={styles.message}>{message}</Text> : null}

          <TouchableOpacity style={styles.primaryBtn} onPress={() => persist(fields)} activeOpacity={0.85}>
            <Text style={styles.primaryBtnText}>{t('aiSettings.save')}</Text>
          </TouchableOpacity>

          {savedKey ? (
            <TouchableOpacity style={styles.secondaryBtn} onPress={removeKey} activeOpacity={0.85}>
              <Text style={styles.secondaryBtnText}>{t('aiSettings.removeKey')}</Text>
            </TouchableOpacity>
          ) : null}
        </ScrollView>
      </View>
    </SheetModal>
  );
}

function ModelPresetChips({
  presets,
  selected,
  onSelect,
  colors,
}: {
  presets: string[];
  selected?: string;
  onSelect: (preset: string) => void;
  colors: Palette;
}) {
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={[styles.chips, styles.presetChips]}>
      {presets.map(preset => {
        const active = selected === preset;
        return (
          <TouchableOpacity
            key={preset}
            style={[styles.chip, active && styles.chipActive]}
            onPress={() => onSelect(preset)}
            activeOpacity={0.85}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>{preset}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function GuideStep({ n, children, colors }: { n: number; children: React.ReactNode; colors: Palette }) {
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.stepRow}>
      <View style={styles.stepBadge}>
        <Text style={styles.stepBadgeText}>{n}</Text>
      </View>
      <View style={styles.stepBody}>{children}</View>
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  guide: {
    marginTop: 18,
    padding: 14,
    borderRadius: 16,
    backgroundColor: colors.primarySoft,
  },
  guideTitle: { fontSize: 14, fontWeight: '800', color: colors.text, marginBottom: 12 },
  guideText: { fontSize: 13, color: colors.text, lineHeight: 18 },
  linkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 10,
    marginBottom: 14,
  },
  linkBtnText: { color: colors.onPrimary, fontSize: 14, fontWeight: '700' },
  stepRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  stepBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  stepBadgeText: { color: colors.onPrimary, fontSize: 12, fontWeight: '800' },
  stepBody: { flex: 1 },
  copyNameBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  copyNameText: { fontSize: 13, fontWeight: '700', color: colors.primaryText },
  safeArea: { flex: 1, backgroundColor: colors.surfaceAlt },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  title: { fontSize: 20, fontWeight: '800', color: colors.text },
  content: { paddingHorizontal: 20, paddingBottom: 40 },
  label: { fontSize: 13, fontWeight: '700', color: colors.textSecondary, marginTop: 18, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  presetChips: { marginTop: 8 },
  chipText: { fontSize: 13, fontWeight: '700', color: colors.primaryText },
  chipTextActive: { color: colors.onPrimary },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text,
  },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  inputFlex: { flex: 1 },
  eyeBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  hint: { fontSize: 12, color: colors.textSecondary, marginTop: 6 },
  privacy: { fontSize: 12, color: colors.textSecondary, marginTop: 22, lineHeight: 18 },
  message: { fontSize: 13, fontWeight: '700', color: colors.primaryText, marginTop: 12 },
  primaryBtn: {
    marginTop: 18,
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryBtnText: { color: colors.onPrimary, fontSize: 15, fontWeight: '800' },
  secondaryBtn: { marginTop: 12, paddingVertical: 12, alignItems: 'center' },
  secondaryBtnText: { color: colors.danger, fontSize: 14, fontWeight: '700' },
});
