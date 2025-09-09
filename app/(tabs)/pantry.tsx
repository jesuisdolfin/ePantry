import { View, Text, FlatList, Pressable, StyleSheet, Image } from "react-native";
import { useInventoryStore } from "../../src/state/inventory";
import { colors, radius, spacing } from "../../src/ui/theme";
import { MaterialCommunityIcons } from "@expo/vector-icons";

export default function Pantry() {
  const items = useInventoryStore((s) => s.items);
  const updateQty = useInventoryStore((s) => s.updateQty);
  const removeItem = useInventoryStore((s) => s.removeItem);

  return (
    <View style={{ flex: 1, padding: spacing.md, gap: spacing.md }}>
      <FlatList
        data={items}
        keyExtractor={(i, idx) => i.id || `${i.upc || "row"}-${idx}`}
        ListEmptyComponent={
          <Text style={{ color: colors.fgDim, textAlign: "center", marginTop: 32 }}>
            No items yet. Scan a barcode to add your first item.
          </Text>
        }
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        renderItem={({ item }) => (
          <View style={styles.card}>
            {item.image_url ? (
              <Image source={{ uri: item.image_url }} style={styles.thumb} />
            ) : (
              <View style={[styles.thumb, styles.thumbFallback]}>
                <MaterialCommunityIcons name="food-apple-outline" size={22} color={colors.fg} />
              </View>
            )}

            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.meta}>
                {item.brand ? `${item.brand} • ` : ""}
                {item.size ? `${item.size} • ` : ""}
                {item.upc ?? "no upc"}
              </Text>

              <View style={styles.actions}>
                <Pressable style={[styles.chip, styles.ghost]} onPress={() => updateQty(item.id, -1)}>
                  <MaterialCommunityIcons name="minus" size={16} color={colors.fg} />
                </Pressable>
                <Text style={styles.qty}>{item.qty}</Text>
                <Pressable style={[styles.chip, styles.brandChip]} onPress={() => updateQty(item.id, +1)}>
                  <MaterialCommunityIcons name="plus" size={16} color="#fff" />
                </Pressable>
              </View>
            </View>

            <Pressable style={styles.delete} onPress={() => removeItem(item.id)}>
              <MaterialCommunityIcons name="delete-outline" size={18} color="#fff" />
            </Pressable>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    alignItems: "center",
  },
  thumb: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    backgroundColor: colors.muted,
  },
  thumbFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  name: {
    color: colors.fg,
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    marginBottom: 2,
  },
  meta: { color: colors.fgDim, fontSize: 12, marginBottom: 10 },
  actions: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: radius.md,
  },
  ghost: { backgroundColor: colors.muted, borderWidth: 1, borderColor: colors.border },
  brandChip: { backgroundColor: colors.brand },
  qty: {
    color: colors.fg,
    minWidth: 28,
    textAlign: "center",
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
  },
  delete: {
    marginLeft: spacing.sm,
    backgroundColor: colors.danger,
    borderRadius: radius.md,
    padding: 8,
  },
});
