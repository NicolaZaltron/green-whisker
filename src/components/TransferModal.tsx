import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../context/ThemeContext';
import type { Palette } from '../theme/palette';
import { text, space } from '../theme/tokens';
import { SheetModal } from './SheetModal';
import { Button } from './ui/Button';
import { Spinner } from './ui/Spinner';
import { InlineNotice } from './ui/InlineNotice';

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
    <SheetModal visible={visible} onClose={onClose}>
      <View style={styles.box}>
        <Text style={styles.title}>{t(`transfer.${kind}.title`)}</Text>
        <Text style={styles.body}>{t(`transfer.${kind}.body`)}</Text>

        <Button
          label={t(`transfer.${kind}.export`, { count: exportCount ?? 0 })}
          onPress={() => run(onExport)}
          disabled={exportDisabled}
          size="L"
          variant="primary"
        />

        <Button label={t(`transfer.${kind}.import`)} onPress={() => run(onImport)} disabled={busy} size="L" variant="secondary" />

        {busy && <Spinner />}
        {notice && <Text style={styles.message}>{notice}</Text>}
        {message && (message.isError ? (
          <InlineNotice tone="danger" text={message.text} />
        ) : (
          <Text style={styles.message}>{message.text}</Text>
        ))}

        <Button label={t('common.close')} onPress={onClose} size="M" variant="ghost" />
      </View>
    </SheetModal>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  box: { padding: space.xxxl + space.xs, gap: space.xl },
  title: { fontSize: text.page, fontWeight: '700', color: colors.text },
  body: { fontSize: text.caption, color: colors.textSecondary, lineHeight: 18 },
  message: { fontSize: text.caption, color: colors.text, textAlign: 'center' },
});
