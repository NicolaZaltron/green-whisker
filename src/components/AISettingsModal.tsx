import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Linking } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useTranslation } from 'react-i18next';
import { AIProvider, PROVIDER_DEFAULTS, getEnvAIConfig } from '../services/aiService';
import { AISettings, ProviderSettings, loadAISettings, saveAISettings } from '../services/settingsService';
import { useTheme } from '../context/ThemeContext';
import type { Palette } from '../theme/palette';
import { AppTextField } from './ui/AppTextField';
import { Button } from './ui/Button';
import { CircleButton } from './ui/CircleButton';
import { IconBadge } from './ui/IconBadge';
import { SegmentedControl } from './ui/SegmentedControl';
import { TextButton } from './ui/TextButton';
import { text, cardRadius, space } from '../theme/tokens';

const PROVIDER_IDS = Object.keys(PROVIDER_DEFAULTS) as AIProvider[];
const AI_STUDIO_KEYS_URL = 'https://aistudio.google.com/api-keys';
const AI_STUDIO_KEY_NAME = 'Green-Whisker';
const GEMINI_SIMPLE_MODEL = 'gemini-flash-lite-latest';
const GEMINI_COMPLEX_MODEL = 'gemini-flash-latest';
const GEMINI_MODEL_PRESETS = ['gemini-flash-lite-latest', 'gemini-flash-latest'];

// Default models for the two families of operations of a provider
function defaultModels(id: AIProvider): { simple: string; complex: string } {
  if (id === 'gemini') return { simple: GEMINI_SIMPLE_MODEL, complex: GEMINI_COMPLEX_MODEL };
  const model = getEnvAIConfig(id).model;
  return { simple: model, complex: model };
}

interface AISettingsSectionProps {
  // Reload the saved settings every time this turns true (the settings page opens)
  visible: boolean;
}

// AI provider settings, rendered as a section of the settings page
export function AISettingsSection({ visible }: AISettingsSectionProps) {
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

  // The model fields always show a value: the saved one, otherwise the default one.
  // The old "model" field acts as a fallback for simple operations (compatibility with already saved data).
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

  useEffect(() => {
    if (!visible) return;
    (async () => {
      setMessage('');
      setShowKey(false);
      const loaded = await loadAISettings();
      setSettings(loaded);
      showProvider(loaded.provider ?? getEnvAIConfig().provider, loaded);
    })();
  }, [visible]);

  // Only values different from the defaults are saved, so a future change of default applies by itself
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
    <View>
          <Text style={styles.label}>{t('aiSettings.provider')}</Text>
          <SegmentedControl
            accessibilityLabel={t('aiSettings.provider')}
            options={PROVIDER_IDS.map(id => ({ key: id, label: PROVIDER_DEFAULTS[id].label }))}
            value={provider}
            onChange={key => showProvider(key as typeof provider, settings)}
          />

          {provider === 'gemini' && (
            <View style={styles.guide}>
              <Text style={styles.guideTitle}>{t('aiSettings.guide.title')}</Text>
              <View style={styles.linkBtn}>
                <Button label={t('aiSettings.guide.open')} onPress={() => Linking.openURL(AI_STUDIO_KEYS_URL)} size="L" variant="primary" icon="open-outline" />
              </View>

              <GuideStep n={1} colors={colors}><Text style={styles.guideText}>{t('aiSettings.guide.step1')}</Text></GuideStep>
              <GuideStep n={2} colors={colors}><Text style={styles.guideText}>{t('aiSettings.guide.step2')}</Text></GuideStep>
              <GuideStep n={3} colors={colors}>
                <Text style={styles.guideText}>{t('aiSettings.guide.step3')}</Text>
                <View style={styles.copyNameBtn}>
                  <TextButton icon="copy-outline" label={t('aiSettings.guide.copyName', { name: AI_STUDIO_KEY_NAME })} onPress={copyKeyName} />
                </View>
              </GuideStep>
              <GuideStep n={4} colors={colors}><Text style={styles.guideText}>{t('aiSettings.guide.step4')}</Text></GuideStep>
            </View>
          )}

          <Text style={styles.label}>{t('aiSettings.apiKey')}</Text>
          <View style={styles.inputRow}>
            <AppTextField
              style={styles.inputFlex}
              size="M"
              value={fields.apiKey ?? ''}
              onChangeText={apiKey => setFields(f => ({ ...f, apiKey }))}
              secureTextEntry={!showKey}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <CircleButton
              icon={showKey ? 'eye-off-outline' : 'eye-outline'}
              onPress={() => setShowKey(s => !s)}
              accessibilityLabel={t('aiSettings.apiKey')}
              size="M"
              variant="outline"
            />
          </View>
          <Text style={styles.hint}>{keyStatus}</Text>

          <Text style={styles.label}>{t('aiSettings.simpleOps')}</Text>
          <AppTextField
            size="M"
            value={fields.simpleModel ?? ''}
            onChangeText={simpleModel => setFields(f => ({ ...f, simpleModel }))}
            placeholder={modelDefaults.simple}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {provider === 'gemini' && (
            <ModelPresetChips
              label={t('aiSettings.simpleOps')}
              presets={GEMINI_MODEL_PRESETS}
              selected={fields.simpleModel}
              onSelect={preset => setFields(f => ({ ...f, simpleModel: preset }))}
              colors={colors}
            />
          )}
          <Text style={styles.hint}>{t('aiSettings.simpleOpsHint')}</Text>

          <Text style={styles.label}>{t('aiSettings.complexOps')}</Text>
          <AppTextField
            size="M"
            value={fields.complexModel ?? ''}
            onChangeText={complexModel => setFields(f => ({ ...f, complexModel }))}
            placeholder={modelDefaults.complex}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {provider === 'gemini' && (
            <ModelPresetChips
              label={t('aiSettings.complexOps')}
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
              <AppTextField
                size="M"
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

          <View style={styles.saveBtn}>
            <Button label={t('aiSettings.save')} onPress={() => persist(fields)} size="L" variant="primary" />
          </View>

          {savedKey ? (
            <View style={styles.removeBtn}>
              <Button label={t('aiSettings.removeKey')} onPress={removeKey} size="M" variant="ghost" />
            </View>
          ) : null}
    </View>
  );
}

function ModelPresetChips({
  label,
  presets,
  selected,
  onSelect,
  colors,
}: {
  label: string;
  presets: string[];
  selected?: string;
  onSelect: (preset: string) => void;
  colors: Palette;
}) {
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.presetChips}>
      <SegmentedControl
        accessibilityLabel={label}
        options={presets.map(preset => ({ key: preset, label: preset }))}
        value={selected ?? ''}
        onChange={onSelect}
      />
    </View>
  );
}

function GuideStep({ n, children, colors }: { n: number; children: React.ReactNode; colors: Palette }) {
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.stepRow}>
      <IconBadge size="S" text={String(n)} />
      <View style={styles.stepBody}>{children}</View>
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  guide: {
    marginTop: 18,
    padding: space.xxl,
    borderRadius: cardRadius,
    backgroundColor: colors.primarySoft,
  },
  guideTitle: { fontSize: text.body, fontWeight: '800', color: colors.text, marginBottom: space.xl },
  guideText: { fontSize: text.caption, color: colors.text, lineHeight: 18 },
  linkBtn: { marginBottom: space.xxl },
  stepRow: { flexDirection: 'row', gap: space.lg, marginBottom: space.xl },
  stepBody: { flex: 1 },
  // Wrapper only: the link button fits its content inside the primarySoft guide box
  copyNameBtn: { alignSelf: 'flex-start', marginTop: space.md },
  label: { fontSize: text.caption, fontWeight: '700', color: colors.textSecondary, marginTop: 18, marginBottom: space.md },
  presetChips: { marginTop: space.md },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  inputFlex: { flex: 1 },
  hint: { fontSize: text.caption, color: colors.textSecondary, marginTop: space.sm },
  privacy: { fontSize: text.caption, color: colors.textSecondary, marginTop: 22, lineHeight: 18 },
  message: { fontSize: text.caption, fontWeight: '700', color: colors.primaryText, marginTop: space.xl },
  saveBtn: { marginTop: 18 },
  removeBtn: { marginTop: space.xl },
});
