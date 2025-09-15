import { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, Image } from "react-native";
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

  // Always active when camera is focused
  const [isActive, setIsActive] = useState(true);

  const [lastCode, setLastCode] = useState<string | null>(null);
  const [pendingCode, setPendingCode] = useState<string | null>(null);
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
    if (lastValueRef.current === data || pendingCode) return;

    lastValueRef.current = data;
    setPendingCode(data);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
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
          onBarcodeScanned={handleBarcodeScanned}
        />
      ) : (
        <View style={styles.center}><Text style={styles.subtle}>Scanner paused</Text></View>
      )}

      {/* Overlay */}
      <View style={styles.overlay}>
        <View style={styles.frame} />
        <View style={styles.bottomBar}>
          {pendingCode ? (
            <Text style={styles.code}>Scanned: {pendingCode}</Text>
          ) : lastCode ? (
            <Text style={styles.code}>Last added: {lastCode}</Text>
          ) : (
            <Text style={styles.help}>Point camera at barcode</Text>
          )}
        </View>
      </View>

      {/* Popup for add confirmation */}
      {pendingCode && (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', justifyContent: 'center', zIndex: 10 }]}> 
          <View style={{ backgroundColor: colors.card, borderRadius: radius.lg, padding: 38, alignItems: 'center', width: 400, maxWidth: '96%', elevation: 8 }}>
            <Text style={{ color: colors.fg, fontWeight: '800', fontSize: 24, marginBottom: 18, textAlign: 'center' }}>Add this item to your pantry?</Text>
            {/* Show product info if available */}
            {productCache[pendingCode] && (productCache[pendingCode].name || productCache[pendingCode].brand || productCache[pendingCode].image_url) ? (
              <>
                {productCache[pendingCode].image_url ? (
                  <View style={{ marginBottom: 16 }}>
                    <Image source={{ uri: productCache[pendingCode].image_url }} style={{ width: 90, height: 90, borderRadius: 12, marginBottom: 6, backgroundColor: '#eee' }} />
                  </View>
                ) : null}
                <Text style={{ color: colors.fg, fontWeight: '700', fontSize: 18, marginBottom: 2, textAlign: 'center' }}>{productCache[pendingCode].name || `Item (${pendingCode})`}</Text>
                {productCache[pendingCode].brand ? (
                  <Text style={{ color: colors.fgDim, fontSize: 16, marginBottom: 6, textAlign: 'center' }}>{productCache[pendingCode].brand}</Text>
                ) : null}
              </>
            ) : (
              <Text style={{ color: colors.fg, fontWeight: '700', fontSize: 18, marginBottom: 8, textAlign: 'center' }}>{`Item (${pendingCode})`}</Text>
            )}
            <Text style={{ color: colors.fgDim, fontSize: 15, marginBottom: 22, textAlign: 'center' }}>Barcode: {pendingCode}</Text>
            <View style={{ flexDirection: 'row', gap: 24, marginTop: 6 }}>
              <Pressable
                style={[styles.holdButton, { backgroundColor: colors.brand, paddingHorizontal: 32, paddingVertical: 18 }]}
                onPress={async () => {
                  setLastCode(pendingCode);
                  setPendingCode(null);
                  addOrIncrementByUpc({
                    upc: pendingCode,
                    name: productCache[pendingCode]?.name || `Item (${pendingCode})`,
                    brand: productCache[pendingCode]?.brand || 'Unknown',
                    unit: 'ea',
                    qty: 1,
                  });
                  // Background product lookup (session-cached)
                  if (!productCache[pendingCode]) {
                    try {
                      if (abortRef.current) abortRef.current.abort();
                      abortRef.current = new AbortController();
                      const info = await fetchOFFByBarcode(pendingCode, abortRef.current.signal);
                      if (info) {
                        updateByUpc(pendingCode, {
                          name: info.name,
                          brand: info.brand,
                          image_url: info.imageUrl,
                          size: info.size,
                        });
                      }
                    } catch {}
                  } else {
                    updateByUpc(pendingCode, productCache[pendingCode]);
                  }
                  // allow same code again after ~1s
                  if (dedupeTimerRef.current) clearTimeout(dedupeTimerRef.current);
                  dedupeTimerRef.current = setTimeout(() => {
                    lastValueRef.current = null;
                  }, 1000);
                }}
              >
                <MaterialCommunityIcons name="plus" size={22} color="#fff" />
                <Text style={[styles.holdText, { fontSize: 18 }]}>Add</Text>
              </Pressable>
              <Pressable
                style={[styles.holdButton, { backgroundColor: colors.danger, paddingHorizontal: 32, paddingVertical: 18 }]}
                onPress={() => {
                  setPendingCode(null);
                  setTimeout(() => { lastValueRef.current = null; }, 500);
                }}
              >
                <MaterialCommunityIcons name="close" size={22} color="#fff" />
                <Text style={[styles.holdText, { fontSize: 18 }]}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}
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
