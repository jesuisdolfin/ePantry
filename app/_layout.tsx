import { Slot } from "expo-router";
import { StatusBar, View, useColorScheme } from "react-native";
import { useEffect } from "react";
import { useFonts, Inter_400Regular, Inter_600SemiBold, Inter_700Bold } from "@expo-google-fonts/inter";
import { colors } from "../src/ui/theme";
// (optional) import { ensureTables } from "../src/db";

export default function RootLayout() {
  const scheme = useColorScheme();
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_600SemiBold, Inter_700Bold });

  useEffect(() => {
    // try { ensureTables(); } catch {}
  }, []);

  if (!fontsLoaded) return null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar barStyle={scheme === "dark" ? "light-content" : "dark-content"} />
      <Slot />
    </View>
  );
}
