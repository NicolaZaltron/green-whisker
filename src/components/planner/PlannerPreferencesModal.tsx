import React, { useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Modal,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { PlannerPreferences, savePlannerPreferences } from '../../services/plannerService';
import { useTheme } from '../../context/ThemeContext';
import type { Palette } from '../../theme/palette';

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

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.prefsSafeArea} edges={['top', 'bottom', 'left', 'right']}>
        <View style={styles.prefsHeader}>
          <Text style={styles.prefsTitle}>{t('planner.preferencesModal.title')}</Text>
          <TouchableOpacity onPress={onClose} style={styles.prefsCloseBtn}>
            <Ionicons name="close" size={22} color={colors.text} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.prefsBody}>
          <View style={styles.prefRow}>
            <View>
              <Text style={styles.prefLabel}>{t('planner.preferencesModal.servings')}</Text>
              <Text style={styles.prefSub}>{t('planner.preferencesModal.servingsSub')}</Text>
            </View>
            <View style={styles.prefStepper}>
              <TouchableOpacity
                style={styles.stepperBtn}
                onPress={() => handleServingsChange(-1)}
              >
                <Ionicons name="remove" size={16} color={colors.primaryText} />
              </TouchableOpacity>
              <Text style={styles.stepperVal}>{prefs.servings}</Text>
              <TouchableOpacity
                style={styles.stepperBtn}
                onPress={() => handleServingsChange(1)}
              >
                <Ionicons name="add" size={16} color={colors.primaryText} />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.prefRow}>
            <View>
              <Text style={styles.prefLabel}>{t('planner.preferencesModal.weekend')}</Text>
              <Text style={styles.prefSub}>{t('planner.preferencesModal.weekendSub')}</Text>
            </View>
            <TouchableOpacity
              style={[styles.toggle, prefs.includeWeekend && styles.toggleOn]}
              onPress={handleToggleWeekend}
              activeOpacity={0.7}
            >
              <View style={[styles.toggleThumb, prefs.includeWeekend && styles.toggleThumbOn]} />
            </TouchableOpacity>
          </View>

          <View style={styles.prefRow}>
            <View>
              <Text style={styles.prefLabel}>{t('planner.preferencesModal.quickLunch')}</Text>
              <Text style={styles.prefSub}>{t('planner.preferencesModal.quickLunchSub')}</Text>
            </View>
            <TouchableOpacity
              style={[styles.toggle, prefs.maxWeekdayLunchMinutes !== null && styles.toggleOn]}
              onPress={handleToggleQuickLunch}
              activeOpacity={0.7}
            >
              <View style={[styles.toggleThumb, prefs.maxWeekdayLunchMinutes !== null && styles.toggleThumbOn]} />
            </TouchableOpacity>
          </View>

          <View style={styles.prefRow}>
            <View>
              <Text style={styles.prefLabel}>{t('planner.preferencesModal.autoMonday')}</Text>
              <Text style={styles.prefSub}>{t('planner.preferencesModal.autoMondaySub')}</Text>
            </View>
            <TouchableOpacity
              style={[styles.toggle, prefs.autoGenerateOnMonday && styles.toggleOn]}
              onPress={handleToggleAutoMonday}
              activeOpacity={0.7}
            >
              <View style={[styles.toggleThumb, prefs.autoGenerateOnMonday && styles.toggleThumbOn]} />
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
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
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  prefsTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.text,
  },
  prefsCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  prefsBody: {
    padding: 20,
    gap: 4,
  },
  prefRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  prefLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  prefSub: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  prefStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stepperBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperVal: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    minWidth: 24,
    textAlign: 'center',
  },
  toggle: {
    width: 46,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.borderStrong,
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  toggleOn: {
    backgroundColor: colors.primary,
  },
  toggleThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.onPrimary,
    alignSelf: 'flex-start',
  },
  toggleThumbOn: {
    alignSelf: 'flex-end',
  },
});
