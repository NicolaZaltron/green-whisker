import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import type { Palette } from '../../theme/palette';
import { icon, space } from '../../theme/tokens';
import { useUiPreferences } from '../../context/UiPreferencesContext';
import { saveLanguage } from '../../services/preferencesService';
import { clearAISettings } from '../../services/settingsService';
import { resetAllData } from '../../db/database';
import { exportBackupFile, pickBackup, restoreBackup, type BackupData } from '../../services/backupService';
import { SheetModal } from '../SheetModal';
import { RecipeBookModal } from '../RecipeBookModal';
import IngredientsModal from '../IngredientsModal';
import { TransferModal } from '../TransferModal';
import { AISettingsSection } from '../AISettingsModal';
import { Button } from './Button';
import { ConfirmDialog } from './ConfirmDialog';
import { type IconName } from './CircleButton';
import { Divider } from './Divider';
import { ListRow } from './ListRow';
import { ModalHeader } from './ModalHeader';
import { SectionTitle } from './SectionTitle';
import { SegmentedControl } from './SegmentedControl';

type Panel = 'recipeBook' | 'ingredients' | null;

interface SettingsModalProps {
  visible: boolean;
  onClose: () => void;
  onRecipesChanged?: () => void;
}

// Full-screen settings page: language, theme, data tools, AI settings and danger zone
export function SettingsModal({ visible, onClose, onRecipesChanged }: SettingsModalProps) {
  const { t, i18n } = useTranslation();
  const { mode: themeMode, setMode: setThemeMode, colors } = useTheme();
  const { segmentedBackground, setSegmentedBackground } = useUiPreferences();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const isEnglish = i18n.language?.startsWith('en');
  const notifyChanged = () => onRecipesChanged?.();

  const [panel, setPanel] = useState<Panel>(null);
  // Deletion of all data (to start over): explicit confirmation, then manual restart
  const [resetState, setResetState] = useState<'confirm' | 'done' | 'error' | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [transfer, setTransfer] = useState<'backup' | null>(null);
  // Backup read from a file, waiting for the restore confirmation, and the result of the last restore
  const [pendingRestore, setPendingRestore] = useState<BackupData | null>(null);
  const [backupNotice, setBackupNotice] = useState<string | null>(null);

  const runReset = async () => {
    try {
      await resetAllData();
      await clearAISettings();
      setResetState('done');
    } catch (e) {
      console.error('resetAllData error', e);
      setResetState('error');
    }
  };

  // Navigable row: leading icon and chevron on the right, opens a management panel
  const renderRow = (iconName: IconName, title: string, subtitle: string, onPress: () => void) => (
    <ListRow
      title={title}
      subtitle={subtitle}
      onPress={onPress}
      accessibilityLabel={title}
      trailing={
        <View style={styles.trailing}>
          <Ionicons name={iconName} size={icon.xl} color={colors.textSecondary} />
          <Ionicons name="chevron-forward" size={icon.lg} color={colors.textMuted} />
        </View>
      }
    />
  );

  return (
    <SheetModal visible={visible} onClose={onClose} fullScreen>
      <View style={styles.page}>
        <ModalHeader title={t('menu.settings')} onClose={onClose} closeLabel={t('common.close')} />
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.section}>
            <SectionTitle title={t('menu.language')} subtitle={t('menu.languageDesc')} />
            <SegmentedControl
              accessibilityLabel={t('menu.language')}
              options={[
                { key: 'it', label: '🇮🇹 IT' },
                { key: 'en', label: '🇬🇧 EN' },
              ]}
              value={isEnglish ? 'en' : 'it'}
              onChange={lng => {
                i18n.changeLanguage(lng);
                saveLanguage(lng as 'it' | 'en').catch(e => console.warn('Impossibile salvare la lingua', e));
              }}
            />
          </View>

          <View style={styles.section}>
            <SectionTitle title={t('menu.theme')} /*subtitle={t('menu.themeDesc')}*/ />
            <SegmentedControl
              accessibilityLabel={t('menu.theme')}
              options={(['light', 'dark', 'system'] as const).map(option => ({ key: option, label: t(`menu.theme_${option}`) }))}
              value={themeMode}
              onChange={key => setThemeMode(key as typeof themeMode)}
            />
          </View>

          <View style={styles.section}>
            <SectionTitle title={t('menu.uiSection')} subtitle={t('menu.uiDesc')} />
            <SegmentedControl
              accessibilityLabel={t('menu.uiSection')}
              options={[
                { key: 'on', label: t('menu.segmentedWithBackground') },
                { key: 'off', label: t('menu.segmentedWithoutBackground') },
              ]}
              value={segmentedBackground ? 'on' : 'off'}
              onChange={key => setSegmentedBackground(key === 'on')}
            />
          </View>

          <View style={styles.section}>
            <SectionTitle title={t('menu.dataSection')} /*subtitle={t('menu.dataDesc')}*/ />
            <View style={styles.list}>
              {renderRow('book-outline', t('menu.recipeBook'), t('menu.recipeBookDesc'), () => setPanel('recipeBook'))}
              {renderRow('nutrition-outline', t('ingredients.menuItem'), t('menu.ingredientsDesc'), () => setPanel('ingredients'))}
              {renderRow('cloud-upload-outline', t('transfer.backup.title'), t('menu.backupDesc'), () => { setBackupNotice(null); setTransfer('backup'); })}
            </View>
          </View>

          <View style={styles.section}>
            <SectionTitle title={t('menu.aiSection')} subtitle={t('menu.aiDesc')} />
            {renderRow('key-outline', t('aiSettings.title'), t('menu.aiRowDesc'), () => setAiOpen(true))}
          </View>

          <Divider marginVertical="lg" />
          <View style={styles.section}>
            <SectionTitle title={t('menu.dangerSection')} subtitle={t('menu.dangerDesc')} />
            <Button variant="danger" size="M" icon="trash-outline" label={t('menu.resetData')} onPress={() => setResetState('confirm')} />
          </View>
        </ScrollView>

        {/* Rendered inside the page so they stack on top of it */}
        <RecipeBookModal visible={panel === 'recipeBook'} onClose={() => setPanel(null)} onChanged={notifyChanged} />
        <IngredientsModal visible={panel === 'ingredients'} onClose={() => setPanel(null)} onChanged={notifyChanged} />
        <SheetModal visible={aiOpen} onClose={() => setAiOpen(false)} fullScreen>
          <View style={styles.page}>
            <ModalHeader title={t('aiSettings.title')} onClose={() => setAiOpen(false)} closeLabel={t('common.close')} />
            <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
              <AISettingsSection visible={aiOpen} />
            </ScrollView>
          </View>
        </SheetModal>
        <ConfirmDialog
          visible={resetState === 'confirm'}
          variant="destructive"
          icon="trash-outline"
          title={t('menu.resetDataTitle')}
          body={t('menu.resetDataBody')}
          confirmLabel={t('menu.resetDataConfirm')}
          onConfirm={runReset}
          cancelLabel={t('common.cancel')}
          onCancel={() => setResetState(null)}
        />
        <ConfirmDialog
          visible={resetState === 'done' || resetState === 'error'}
          icon={resetState === 'error' ? 'alert-circle-outline' : 'checkmark-circle-outline'}
          title={t('menu.resetDataTitle')}
          body={resetState === 'error' ? t('errors.somethingWentWrong') : t('menu.resetDataDone')}
          confirmLabel={t('common.close')}
          onConfirm={() => setResetState(null)}
          onCancel={() => setResetState(null)}
        />
        <TransferModal
          visible={transfer === 'backup'}
          kind="backup"
          notice={backupNotice}
          onClose={() => setTransfer(null)}
          onExport={async () => t('transfer.backupExported', { count: await exportBackupFile() })}
          onImport={async () => {
            const data = await pickBackup();
            if (!data) return null;
            // The restore replaces data: it starts only after the confirmation
            setTransfer(null);
            setPendingRestore(data);
            return null;
          }}
        />
        <ConfirmDialog
          visible={pendingRestore !== null}
          icon="cloud-upload-outline"
          title={t('transfer.restoreTitle')}
          body={t('transfer.restoreBody')}
          confirmLabel={t('transfer.restoreConfirm')}
          onConfirm={async () => {
            const data = pendingRestore;
            setPendingRestore(null);
            if (!data) return;
            try {
              const summary = await restoreBackup(data);
              setBackupNotice(t('transfer.restored', {
                recipes: summary.recipes,
                ingredients: summary.ingredients,
                entries: summary.plannerEntries,
                dropped: summary.droppedPlannerEntries,
              }));
            } catch (e) {
              console.warn('Ripristino backup fallito', e);
              setBackupNotice(t('transfer.failed'));
            }
            setTransfer('backup');
          }}
          onCancel={() => setPendingRestore(null)}
        />
      </View>
    </SheetModal>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  // Same background as the other full-screen modals (the sheet provides it)
  page: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: space.huge, paddingBottom: space.huge },
  section: { marginBottom: space.xxxl },
  list: { gap: space.md },
  trailing: { flexDirection: 'row', alignItems: 'center', gap: space.md },
});
