import React from 'react';
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

export interface PlannerPreferencesModalProps {
  visible: boolean;
  prefs: PlannerPreferences | null;
  onClose: () => void;
  onUpdatePrefs: (updated: PlannerPreferences) => void;
  onClearWeek: () => void;
}

/**
 * Settings modal for weekly meal plan generation and preferences.
 */
export const PlannerPreferencesModal: React.FC<PlannerPreferencesModalProps> = ({
  visible,
  prefs,
  onClose,
  onUpdatePrefs,
  onClearWeek,
}) => {
  const { t } = useTranslation();
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
      transparent
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.prefsSafeArea} edges={['top', 'bottom', 'left', 'right']}>
        <View style={styles.prefsHeader}>
          <Text style={styles.prefsTitle}>{t('planner.preferencesModal.title')}</Text>
          <TouchableOpacity onPress={onClose} style={styles.prefsCloseBtn}>
            <Ionicons name="close" size={22} color="#2B332B" />
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
                <Ionicons name="remove" size={16} color="#4A6B53" />
              </TouchableOpacity>
              <Text style={styles.stepperVal}>{prefs.servings}</Text>
              <TouchableOpacity
                style={styles.stepperBtn}
                onPress={() => handleServingsChange(1)}
              >
                <Ionicons name="add" size={16} color="#4A6B53" />
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

          <TouchableOpacity
            style={styles.clearWeekBtn}
            onPress={() => {
              onClose();
              onClearWeek();
            }}
            activeOpacity={0.8}
          >
            <Ionicons name="trash-outline" size={16} color="#D9534F" />
            <Text style={styles.clearWeekBtnText}>{t('planner.preferencesModal.clearWeek')}</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  prefsSafeArea: {
    flex: 1,
    backgroundColor: '#FBF9F5',
  },
  prefsHeader: {
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#ECE7DF',
  },
  prefsTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#243328',
  },
  prefsCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#EAE5DC',
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
    borderBottomColor: '#F0EDE8',
  },
  prefLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#2B332B',
  },
  prefSub: {
    fontSize: 12,
    color: '#7E8B80',
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
    backgroundColor: '#EAF0EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperVal: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2B332B',
    minWidth: 24,
    textAlign: 'center',
  },
  toggle: {
    width: 46,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#DDD8CE',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  toggleOn: {
    backgroundColor: '#4A6B53',
  },
  toggleThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FFF',
    alignSelf: 'flex-start',
  },
  toggleThumbOn: {
    alignSelf: 'flex-end',
  },
  clearWeekBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 24,
    padding: 14,
    backgroundColor: '#FDF0EE',
    borderRadius: 12,
    justifyContent: 'center',
  },
  clearWeekBtnText: {
    color: '#D9534F',
    fontSize: 14,
    fontWeight: '700',
  },
});
