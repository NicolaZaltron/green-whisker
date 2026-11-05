import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useTranslation } from 'react-i18next';
import { AIProvider, PROVIDER_DEFAULTS, getEnvAIConfig } from '../services/aiService';
import { AISettings, ProviderSettings, loadAISettings, saveAISettings } from '../services/settingsService';

const PROVIDER_IDS = Object.keys(PROVIDER_DEFAULTS) as AIProvider[];
const AI_STUDIO_KEYS_URL = 'https://aistudio.google.com/api-keys';
const AI_STUDIO_KEY_NAME = 'Green-Whisker';

interface AISettingsModalProps {
  visible: boolean;
  onClose: () => void;
}

export function AISettingsModal({ visible, onClose }: AISettingsModalProps) {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<AISettings>({ providers: {} });
  const [provider, setProvider] = useState<AIProvider>('gemini');
  const [fields, setFields] = useState<ProviderSettings>({});
  const [showKey, setShowKey] = useState(false);
  const [message, setMessage] = useState('');

  const defaults = PROVIDER_DEFAULTS[provider];
  const envConfig = getEnvAIConfig(provider);
  const savedKey = settings.providers[provider]?.apiKey;

  // Il campo modello mostra sempre un valore: quello salvato, altrimenti quello predefinito
  const showProvider = (id: AIProvider, source: AISettings) => {
    const saved = source.providers[id] ?? {};
    setProvider(id);
    setFields({ ...saved, model: saved.model ?? getEnvAIConfig(id).model });
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
    const model = providerFields.model?.trim();
    const baseUrl = providerFields.baseUrl?.trim();
    const next: AISettings = {
      ...settings,
      provider,
      providers: {
        ...settings.providers,
        [provider]: {
          apiKey: providerFields.apiKey?.trim() || undefined,
          model: model && model !== envConfig.model ? model : undefined,
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
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom', 'left', 'right']}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('aiSettings.title')}</Text>
          <TouchableOpacity onPress={close} hitSlop={12} accessibilityLabel={t('common.close')}>
            <Ionicons name="close" size={24} color="#34523C" />
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
                <Ionicons name="open-outline" size={16} color="#FFFFFF" />
                <Text style={styles.linkBtnText}>{t('aiSettings.guide.open')}</Text>
              </TouchableOpacity>

              <GuideStep n={1}><Text style={styles.guideText}>{t('aiSettings.guide.step1')}</Text></GuideStep>
              <GuideStep n={2}><Text style={styles.guideText}>{t('aiSettings.guide.step2')}</Text></GuideStep>
              <GuideStep n={3}>
                <Text style={styles.guideText}>{t('aiSettings.guide.step3')}</Text>
                <TouchableOpacity style={styles.copyNameBtn} onPress={copyKeyName} activeOpacity={0.8}>
                  <Ionicons name="copy-outline" size={15} color="#34523C" />
                  <Text style={styles.copyNameText}>{t('aiSettings.guide.copyName', { name: AI_STUDIO_KEY_NAME })}</Text>
                </TouchableOpacity>
              </GuideStep>
              <GuideStep n={4}><Text style={styles.guideText}>{t('aiSettings.guide.step4')}</Text></GuideStep>
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
              <Ionicons name={showKey ? 'eye-off-outline' : 'eye-outline'} size={20} color="#5E6D60" />
            </TouchableOpacity>
          </View>
          <Text style={styles.hint}>{keyStatus}</Text>

          <Text style={styles.label}>{t('aiSettings.model')}</Text>
          <TextInput
            style={styles.input}
            value={fields.model ?? ''}
            onChangeText={model => setFields(f => ({ ...f, model }))}
            placeholder={envConfig.model}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {defaults.modelPresets && (
            <View style={[styles.chips, styles.presetChips]}>
              {defaults.modelPresets.map(preset => {
                const active = fields.model === preset;
                return (
                  <TouchableOpacity
                    key={preset}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => setFields(f => ({ ...f, model: preset }))}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{preset}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

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
      </SafeAreaView>
    </Modal>
  );
}

function GuideStep({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <View style={styles.stepRow}>
      <View style={styles.stepBadge}>
        <Text style={styles.stepBadgeText}>{n}</Text>
      </View>
      <View style={styles.stepBody}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  guide: {
    marginTop: 18,
    padding: 14,
    borderRadius: 16,
    backgroundColor: '#F1F6F2',
  },
  guideTitle: { fontSize: 14, fontWeight: '800', color: '#1A2E1F', marginBottom: 12 },
  guideText: { fontSize: 13, color: '#1A2E1F', lineHeight: 18 },
  linkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#34523C',
    borderRadius: 12,
    paddingVertical: 10,
    marginBottom: 14,
  },
  linkBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  stepRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  stepBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#34523C',
  },
  stepBadgeText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
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
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D4DDD6',
  },
  copyNameText: { fontSize: 13, fontWeight: '700', color: '#34523C' },
  safeArea: { flex: 1, backgroundColor: '#F7F9F6' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  title: { fontSize: 20, fontWeight: '800', color: '#1A2E1F' },
  content: { paddingHorizontal: 20, paddingBottom: 40 },
  label: { fontSize: 13, fontWeight: '700', color: '#5E6D60', marginTop: 18, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: '#EAF0EB',
    borderWidth: 1,
    borderColor: '#D4DDD6',
  },
  chipActive: { backgroundColor: '#34523C', borderColor: '#34523C' },
  presetChips: { marginTop: 8 },
  chipText: { fontSize: 13, fontWeight: '700', color: '#34523C' },
  chipTextActive: { color: '#FFFFFF' },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D4DDD6',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#1A2E1F',
  },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  inputFlex: { flex: 1 },
  eyeBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D4DDD6',
  },
  hint: { fontSize: 12, color: '#5E6D60', marginTop: 6 },
  privacy: { fontSize: 12, color: '#5E6D60', marginTop: 22, lineHeight: 18 },
  message: { fontSize: 13, fontWeight: '700', color: '#34523C', marginTop: 12 },
  primaryBtn: {
    marginTop: 18,
    backgroundColor: '#34523C',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  secondaryBtn: { marginTop: 12, paddingVertical: 12, alignItems: 'center' },
  secondaryBtnText: { color: '#D9534F', fontSize: 14, fontWeight: '700' },
});
