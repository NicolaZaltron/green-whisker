import { useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../context/ThemeContext';
import type { Palette } from '../theme/palette';

export type TransferKind = 'recipes' | 'ingredients' | 'readyMeals' | 'outOfHome' | 'backup';

interface TransferModalProps {
  visible: boolean;
  kind: TransferKind;
  // How many items the export will write (the export button is disabled at 0)
  exportCount?: number;
  // Each action returns the message to show, or null when there is nothing to show (cancelled, or the caller takes over)
  onExport: () => Promise<string | null>;
  onImport: () => Promise<string | null>;
  onClose: () => void;
  // Result shown by the caller (for example after a restore), until the dialog is closed
  notice?: string | null;
}

interface TransferMessage {
  text: string;
  isError: boolean;
}

// One dialog for the import and export of recipes, ingredients and out-of-home options: only the texts
// (transfer.<kind>.*) and the two actions change between them
export function TransferModal({ visible, kind, exportCount, onExport, onImport, onClose, notice }: TransferModalProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<TransferMessage | null>(null);

  const run = async (action: () => Promise<string | null>) => {
    setBusy(true);
    setMessage(null);
    try {
      const text = await action();
      if (text !== null) setMessage({ text, isError: false });
    } catch (e: any) {
      console.warn(`Operazione ${kind} fallita`, e);
      setMessage({ text: t('transfer.failed'), isError: true });
    } finally {
      setBusy(false);
    }
  };

  const exportDisabled = busy || exportCount === 0;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.box}>
          <Text style={styles.title}>{t(`transfer.${kind}.title`)}</Text>
          <Text style={styles.body}>{t(`transfer.${kind}.body`)}</Text>

          <TouchableOpacity
            style={[styles.button, styles.buttonPrimary, exportDisabled && styles.buttonDisabled]}
            onPress={() => run(onExport)}
            disabled={exportDisabled}
            activeOpacity={0.7}
          >
            <Text style={styles.buttonPrimaryText}>
              {t(`transfer.${kind}.export`, { count: exportCount ?? 0 })}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.buttonSecondary, busy && styles.buttonDisabled]}
            onPress={() => run(onImport)}
            disabled={busy}
            activeOpacity={0.7}
          >
            <Text style={styles.buttonSecondaryText}>{t(`transfer.${kind}.import`)}</Text>
          </TouchableOpacity>

          {busy && <ActivityIndicator color={colors.primary} />}
          {notice && <Text style={styles.message}>{notice}</Text>}
          {message && (
            <Text style={[styles.message, message.isError && { color: colors.danger }]}>{message.text}</Text>
          )}

          <TouchableOpacity style={styles.close} onPress={onClose} activeOpacity={0.7}>
            <Text style={styles.closeText}>{t('common.close')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.4)', justifyContent: 'center', padding: 20 },
  box: { backgroundColor: colors.surface, borderRadius: 18, padding: 18, gap: 12 },
  title: { fontSize: 17, fontWeight: '800', color: colors.text },
  body: { fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
  button: { minHeight: 42, paddingHorizontal: 16, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  buttonPrimary: { backgroundColor: colors.primary },
  buttonPrimaryText: { fontSize: 14, fontWeight: '700', color: colors.onPrimary },
  buttonSecondary: { backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.border },
  buttonSecondaryText: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
  buttonDisabled: { opacity: 0.4 },
  message: { fontSize: 13, color: colors.text, textAlign: 'center' },
  close: { alignSelf: 'center', paddingVertical: 6 },
  closeText: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
});
