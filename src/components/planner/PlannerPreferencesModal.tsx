import React, { useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { SheetModal } from '../SheetModal';
import { CircleButton } from '../ui/CircleButton';
import { PlannerPreferences, savePlannerPreferences } from '../../services/plannerService';
import { useTheme } from '../../context/ThemeContext';
import type { Palette } from '../../theme/palette';
import { space, text } from '../../theme/tokens';
import { SegmentedControl } from '../ui/SegmentedControl';
import { Toggle } from '../ui/Toggle';

export interface PlannerPreferencesModalProps {
  visible: boolean;
  prefs: PlannerPreferences | null;
  onClose: () => void;
  onUpdatePrefs: (updated: PlannerPreferences) => void;
}

/**
 * Settings modal for weekly meal plan generation and preferences.
 */
export const PlannerPreferencesModal: React.FC<PlannerPreferencesModalProps> = ({
  visible,
  prefs,
  onClose,
  onUpdatePrefs,
}) => {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  if (!prefs) return null;

  const handleServingsChange = async (delta: number) => {
    const v = Math.min(12, Math.max(1, prefs.servings + delta));
    const updated = { ...prefs, servings: v };
    onUpdatePrefs(updated);
    await savePlannerPreferences({ servings: v });
  };

  const handleToggleWeekend = async () => {
    const updated = { ...prefs, includeWeekend: !prefs.includeWeekend };
    onUpdatePrefs(updated);
    await savePlannerPreferences({ includeWeekend: !prefs.includeWeekend });
  };

  const handleToggleQuickLunch = async () => {
    const v = prefs.maxWeekdayLunchMinutes !== null ? null : 30;
    const updated = { ...prefs, maxWeekdayLunchMinutes: v };
    onUpdatePrefs(updated);
    await savePlannerPreferences({ maxWeekdayLunchMinutes: v });
  };

  const handleToggleAutoMonday = async () => {
    const updated = { ...prefs, autoGenerateOnMonday: !prefs.autoGenerateOnMonday };
    onUpdatePrefs(updated);
    await savePlannerPreferences({ autoGenerateOnMonday: !prefs.autoGenerateOnMonday });
  };

  const handleSetCalendarMode = async (mode: 'week' | 'rolling') => {
    const updated = { ...prefs, calendarMode: mode };
    onUpdatePrefs(updated);
    await savePlannerPreferences({ calendarMode: mode });
  };

  const calendarOptions: { value: 'week' | 'rolling'; label: string }[] = [
    { value: 'week', label: t('planner.calendar.week') },
    { value: 'rolling', label: t('planner.calendar.rolling') },
  ];

  return (
    <SheetModal visible={visible} onClose={onClose} fullScreen>
      <SafeAreaView style={styles.prefsSafeArea} edges={['left', 'right']}>
        <View style={styles.prefsHeader}>
          <Text style={styles.prefsTitle}>{t('planner.preferencesModal.title')}</Text>
          <CircleButton icon="close" variant="plain" onPress={onClose} accessibilityLabel={t('common.close')} />
        </View>

        <ScrollView contentContainerStyle={styles.prefsBody}>
          <View style={styles.prefRow}>
            <View style={styles.prefText}>
              <Text style={styles.prefLabel}>{t('planner.preferencesModal.servings')}</Text>
              <Text style={styles.prefSub}>{t('planner.preferencesModal.servingsSub')}</Text>
            </View>
            <View style={styles.prefStepper}>
              <CircleButton
                icon="remove"
                size="S"
                variant="outline"
                onPress={() => handleServingsChange(-1)}
                accessibilityLabel={t('planner.preferencesModal.servings')}
              />
              <Text style={styles.stepperVal}>{prefs.servings}</Text>
              <CircleButton
                icon="add"
                size="S"
                variant="outline"
                onPress={() => handleServingsChange(1)}
                accessibilityLabel={t('planner.preferencesModal.servings')}
              />
            </View>
          </View>

          <View style={styles.prefRow}>
            <View style={styles.prefText}>
              <Text style={styles.prefLabel}>{t('planner.preferencesModal.weekend')}</Text>
              <Text style={styles.prefSub}>{t('planner.preferencesModal.weekendSub')}</Text>
            </View>
            <Toggle
              value={prefs.includeWeekend}
              onValueChange={handleToggleWeekend}
              accessibilityLabel={t('planner.preferencesModal.weekend')}
            />
          </View>

          <View style={styles.prefRow}>
            <View style={styles.prefText}>
              <Text style={styles.prefLabel}>{t('planner.preferencesModal.quickLunch')}</Text>
              <Text style={styles.prefSub}>{t('planner.preferencesModal.quickLunchSub')}</Text>
            </View>
            <Toggle
              value={prefs.maxWeekdayLunchMinutes !== null}
              onValueChange={handleToggleQuickLunch}
              accessibilityLabel={t('planner.preferencesModal.quickLunch')}
            />
          </View>

          <View style={styles.prefRow}>
            <View style={styles.prefText}>
              <Text style={styles.prefLabel}>{t('planner.preferencesModal.autoMonday')}</Text>
              <Text style={styles.prefSub}>{t('planner.preferencesModal.autoMondaySub')}</Text>
            </View>
            <Toggle
              value={prefs.autoGenerateOnMonday}
              onValueChange={handleToggleAutoMonday}
              accessibilityLabel={t('planner.preferencesModal.autoMonday')}
            />
          </View>

          <View style={styles.prefSection}>
            <Text style={styles.prefLabel}>{t('planner.calendar.title')}</Text>
            <SegmentedControl
              accessibilityLabel={t('planner.calendar.title')}
              options={calendarOptions.map(option => ({ key: option.value, label: option.label }))}
              value={prefs.calendarMode}
              onChange={key => handleSetCalendarMode(key as typeof prefs.calendarMode)}
            />
          </View>
        </ScrollView>
      </SafeAreaView>
    </SheetModal>
  );
};

const makeStyles = (colors: Palette) => StyleSheet.create({
  prefsSafeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  prefsHeader: {
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.huge,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  prefsTitle: {
    fontSize: text.page,
    fontWeight: '700',
    color: colors.text,
  },
  prefsBody: {
    padding: space.huge,
    gap: space.xs,
  },
  prefRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: space.xxxl,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  prefLabel: {
    fontSize: text.title,
    fontWeight: '600',
    color: colors.text,
  },
  prefText: {
    flex: 1,
    paddingRight: space.xl,
  },
  prefSub: {
    fontSize: text.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
  prefStepper: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xl,
  },
  stepperVal: {
    fontSize: text.title,
    fontWeight: '700',
    color: colors.text,
    minWidth: 24,
    textAlign: 'center',
  },
  prefSection: {
    paddingVertical: space.xxxl,
    gap: space.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
});
