import { View, Text, StyleSheet, Pressable, Alert } from "react-native";
import * as Haptics from "expo-haptics";
import { useInventoryStore } from "../../src/state/inventory"; // or "@/state/inventory" if you set aliases
import { colors } from "../../src/ui/theme";

export default function Settings() {
  const itemsCount = useInventoryStore((s) => s.items.length);
  const reset = useInventoryStore((s) => s.reset);

  const confirmClear = () => {
    Alert.alert(
      "Clear all data?",
      "This will permanently delete all pantry items on this device.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: async () => {
            reset();
            try {
              await Haptics.notificationAsync(
                Haptics.NotificationFeedbackType.Success
              );
            } catch {}
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Settings</Text>

      <View style={styles.card}>
        <Text style={styles.label}>Items stored</Text>
        <Text style={styles.value}>{itemsCount}</Text>
      </View>

      <Pressable style={[styles.button]} onPress={confirmClear}>
        <Text style={styles.buttonText}>Clear all data</Text>
      </Pressable>

      <Text style={styles.note}>
        Data is stored locally on this device using AsyncStorage. Clearing will
        not affect any other devices.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // button styles
button: { paddingVertical: 12, borderRadius: 12, alignItems: "center", backgroundColor: colors.danger },
buttonText: { color: "#fff", fontWeight: "700" },
card: { backgroundColor: colors.card, padding: 14, borderRadius: 12, borderColor: colors.border, borderWidth: 1,
        flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
title: { color: colors.fg, fontSize: 20, fontWeight: "700" },
label: { color: colors.fgDim },
value: { color: colors.fg, fontWeight: "700" },
note: { color: colors.fgDim, fontSize: 12 },
container: { flex: 1, padding: 16, gap: 16, backgroundColor: colors.bg },

});
