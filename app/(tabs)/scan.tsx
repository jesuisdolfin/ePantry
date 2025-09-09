import { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import { useIsFocused } from "@react-navigation/native";
import * as Haptics from "expo-haptics";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useInventoryStore } from "../../src/state/inventory";
import { fetchOFFByBarcode } from "../../src/lib/off";
import { colors, radius } from "../../src/ui/theme";

const isRetailBarcode = (v: string) => /^\d{6,13}$/.test(v) && /^\d+$/.test(v);

export default function Scan() {
  const isFocused = useIsFocused();
  const [permission, requestPermission] = useCameraPermissions();

  // Active only while the button is pressed
  const [isActive, setIsActive] = useState(false);

  const [lastCode, setLastCode] = useState<string | null>(null);
  const lastValueRef = useRef<string | null>(null);
  const dedupeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const addOrIncrementByUpc = useInventoryStore((s) => s.addOrIncrementByUpc);
  const updateByUpc = useInventoryStore((s) => s.updateByUpc);
  const productCache = useInventoryStore((s) => s.productCache);

  useEffect(() => {
    if (!permission?.granted) requestPermission();
    return () => {
      if (dedupeTimerRef.current) clearTimeout(dedupeTimerRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Lose focus = stop scanning immediately
  useEffect(() => {
    if (!isFocused) {
      setIsActive(false);
      lastValueRef.current = null;
      if (abortRef.current) abortRef.current.abort();
      if (dedupeTimerRef.current) clearTimeout(dedupeTimerRef.current);
    }
  }, [isFocused]);

  const handleBarcodeScanned = async ({ data }: BarcodeScanningResult) => {
    if (!isFocused || !isActive || !data) return;
    if (!isRetailBarcode(data)) return;
    if (lastValueRef.current === data) return; // dedupe for a short window

    lastValueRef.current = data;
    setLastCode(data);

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

    // Instant optimistic update
    addOrIncrementByUpc({
      upc: data,
      name: `Item (${data})`,
      brand: "Unknown",
      unit: "ea",
      qty: 1,
    });

    // Background product lookup (session-cached)
    if (!productCache[data]) {
      try {
        if (abortRef.current) abortRef.current.abort();
        abortRef.current = new AbortController();
        const info = await fetchOFFByBarcode(data, abortRef.current.signal);
        if (info) {
          updateByUpc(data, {
            name: info.name,
            brand: info.brand,
            image_url: info.imageUrl,
            size: info.size,
          });
        }
      } catch {}
    } else {
      updateByUpc(data, productCache[data]);
    }

    // allow same code again after ~1s (so you can re-scan intentionally)
    if (dedupeTimerRef.current) clearTimeout(dedupeTimerRef.current);
    dedupeTimerRef.current = setTimeout(() => {
      if (!isActive) return; // if not scanning anymore, keep it cleared
      lastValueRef.current = null;
    }, 1000);
  };

  if (!permission) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Requesting camera permission…</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Camera permission needed</Text>
        <Text style={styles.subtle}>Enable camera access to scan barcodes.</Text>
        <Pressable onPress={requestPermission} style={styles.cta}>
          <MaterialCommunityIcons name="camera" size={18} color="#fff" />
          <Text style={styles.ctaText}>Grant permission</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      {isFocused ? (
        <CameraView
          style={{ flex: 1 }}
          barcodeScannerSettings={{
            barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e", "code128", "code39"],
          }}
          onBarcodeScanned={isActive ? handleBarcodeScanned : undefined}
        />
      ) : (
        <View style={styles.center}><Text style={styles.subtle}>Scanner paused</Text></View>
      )}

      {/* Overlay */}
      <View style={styles.overlay}>
        <View style={styles.frame} />
        <View style={styles.bottomBar}>
          {lastCode ? (
            <Text style={styles.code}>Scanned: {lastCode}</Text>
          ) : (
            <Text style={styles.help}>Hold button to scan</Text>
          )}
          <Pressable
            onPressIn={() => setIsActive(true)}
            onPressOut={() => {
              setIsActive(false);
              lastValueRef.current = null; // reset dedupe when you stop holding
            }}
            style={({ pressed }) => [styles.holdButton, pressed && { opacity: 0.9 }]}
          >
            <MaterialCommunityIcons name={isActive ? "pause" : "play"} size={18} color="#fff" />
            <Text style={styles.holdText}>{isActive ? "Release to stop" : "Hold to scan"}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  title: { fontSize: 18, fontWeight: "600", color: "#fff", marginBottom: 6 },
  subtle: { opacity: 0.75, color: "#fff", textAlign: "center" },

  overlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "flex-end" },
  frame: {
    position: "absolute",
    top: "18%",
    width: "72%",
    height: "40%",
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.75)",
  },
  bottomBar: {
    width: "100%",
    padding: 16,
    gap: 12,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
  },
  code: { color: "#fff", fontWeight: "700" },
  help: { color: "#fff", opacity: 0.85 },

  cta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.brand,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: radius.lg,
  },
  ctaText: { color: "#fff", fontWeight: "700" },

  holdButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.brand,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: radius.lg,
  },
  holdText: { color: "#fff", fontWeight: "700" },
});
