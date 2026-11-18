import { memo, useMemo } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import type { Palette } from '../theme/palette';
import type { OutOfHomeEntry } from '../services/outOfHomeService';

interface OutOfHomeListProps {
  entries: OutOfHomeEntry[];
  onOpen: (entry: OutOfHomeEntry) => void;
}

// Card of an out-of-home option: tap to edit (same look as the ingredient and ready meal cards)
const OutOfHomeRow = memo(function OutOfHomeRow({ item, onOpen }: { item: OutOfHomeEntry; onOpen: (entry: OutOfHomeEntry) => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <TouchableOpacity style={styles.row} onPress={() => onOpen(item)} activeOpacity={0.7}>
      <Text style={styles.rowName}>{item.label}</Text>
    </TouchableOpacity>
  );
});

// The "Fuori casa" options, in creation order
export function OutOfHomeList({ entries, onOpen }: OutOfHomeListProps) {
  return (
    <FlatList
      data={entries}
      keyExtractor={item => item.id}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.listContent}
      renderItem={({ item }) => <OutOfHomeRow item={item} onOpen={onOpen} />}
    />
  );
}

const styles = StyleSheet.create({
  listContent: { paddingHorizontal: 16, paddingBottom: 16, paddingTop: 8 },
});

const makeStyles = (colors: Palette) => StyleSheet.create({
  row: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 8,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowName: { fontSize: 15, fontWeight: '700', color: colors.text },
});
