import { memo } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import type { OutOfHomeEntry } from '../services/outOfHomeService';
import { space } from '../theme/tokens';
import { ListRow } from './ui/ListRow';

interface OutOfHomeListProps {
  entries: OutOfHomeEntry[];
  onOpen: (entry: OutOfHomeEntry) => void;
}

// Card of an out-of-home option: tap to edit (same look as the ingredient and ready meal cards)
const OutOfHomeRow = memo(function OutOfHomeRow({ item, onOpen }: { item: OutOfHomeEntry; onOpen: (entry: OutOfHomeEntry) => void }) {
  return (
    <View style={styles.rowSpacing}>
      <ListRow title={item.label} onPress={() => onOpen(item)} variant="card" />
    </View>
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
  listContent: { paddingHorizontal: space.xxxl, paddingBottom: space.xxxl, paddingTop: space.md },
  rowSpacing: { marginBottom: space.md },
});
