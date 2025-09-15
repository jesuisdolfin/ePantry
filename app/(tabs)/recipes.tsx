import { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  Image,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from "react-native";
import { colors, radius, spacing } from "../../src/ui/theme";
import {
  searchMealsByName,
  getMealById,
  parseMealIngredients,
  filterMealsByIngredient,
  type MealSummary,
} from "../../src/lib/mealdb";
import { simplifyIngredients } from "../../src/lib/recipes-simplify";
import { useInventoryStore } from "../../src/state/inventory";

// --- helpers ---
const normalizeName = (s: string) =>
  s
    .toLowerCase()
    .replace(/\(.*?\)/g, "")
    .replace(/\d+(\.\d+)?\s?(g|ml|oz|lb|pack|pk|ct)\b/g, "")
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const SYNONYMS: Record<string, string> = {
  spaghetti: "pasta",
  penne: "pasta",
  macaroni: "pasta",
  fusilli: "pasta",
  linguine: "pasta",
  mince: "beef",
  "ground beef": "beef",
  "ground turkey": "turkey",
  "ground pork": "pork",
  passata: "tomato",
  "tomato sauce": "tomato",
  "garbanzo beans": "chickpea",
  "chick peas": "chickpea",
  "kidney beans": "bean",
  cilantro: "coriander",
};
const toKeyword = (s: string) => {
  const n = normalizeName(s);
  return SYNONYMS[n] || n;
};

const mapUnit = (u: string): "ea" | "g" | "ml" | "lb" | "oz" => {
  const x = u.toLowerCase();
  if (x.includes("g")) return "g";
  if (x.includes("ml")) return "ml";
  if (x.includes("lb")) return "lb";
  if (x.includes("oz")) return "oz";
  return "ea";
};

export default function Recipes() {
  const cookFromIngredients = useInventoryStore((s) => s.cookFromIngredients);
  const items = useInventoryStore((s) => s.items);

  // search state
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<MealSummary[]>([]);

  // quick ideas state
  const [quickLoading, setQuickLoading] = useState(false);
  const [quickMeals, setQuickMeals] = useState<
    { idMeal: string; strMeal: string; strMealThumb: string | null; missing: number; simplified: { name: string; qty: number; unit: any }[] }[]
  >([]);
  const [quickTried, setQuickTried] = useState<string[] | null>(null);

  // detail selection (from manual search)
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedName, setSelectedName] = useState<string>("");
  const [selectedIngs, setSelectedIngs] = useState<{ name: string; qty: number; unit: any }[] | null>(null);
  const [simpleMode, setSimpleMode] = useState(true);

  // --- manual search flow ---
  const onSearch = async () => {
    try {
      setLoading(true);
      const list = await searchMealsByName(query);
      setResults(list);
      setSelectedId(null);
      setSelectedIngs(null);
    } catch (e: any) {
      Alert.alert("Search error", String(e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  const onSelect = async (idMeal: string, name: string) => {
    setSelectedId(idMeal);
    setSelectedName(name);
    setSelectedIngs(null);
    try {
      setLoading(true);
      const meal = await getMealById(idMeal);
      if (!meal) return;
      const raw = parseMealIngredients(meal);
      const ings = raw
        .filter((i) => i.name && i.qty > 0)
        .map((i) => ({ name: i.name, qty: i.qty, unit: mapUnit(i.unit) as any }));

      const pantryNames = items.map((i) => i.name);
      const simplified = simplifyIngredients(ings as any, pantryNames, { maxItems: 7, minQty: 0.25 });
      setSelectedIngs(simpleMode ? (simplified as any) : (ings as any));
    } catch (e: any) {
      Alert.alert("Load recipe error", String(e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  const onCookSelected = () => {
    if (!selectedIngs || !selectedIngs.length) return;
    const res = cookFromIngredients(selectedIngs as any);
    if (res.ok) Alert.alert("Cooked!", `${selectedName} ingredients deducted from pantry.`);
    else {
      const lines = res.shortages
        .map((s) => `• ${s.name}: need ${s.need}${s.unit}, have ${s.have}${s.unit}`)
        .join("\n");
      Alert.alert("Missing items", lines || "Not enough ingredients.");
    }
  };

  // --- QUICK IDEAS ---
  const loadQuickIdeas = async () => {
    setQuickLoading(true);
    setQuickMeals([]);
    try {
      // Build a small keyword set from pantry (limit to 6 to keep calls low)
      const pantryNames = items.map((i) => i.name);
      let keywords = Array.from(new Set(pantryNames.map(toKeyword)))
        .filter(Boolean)
        .slice(0, 6);

      // Fallback generics if pantry doesn’t yield good keywords
      if (keywords.length === 0) keywords = ["pasta", "rice", "chicken", "egg", "tomato"];

      setQuickTried(keywords);

      // Union of candidates from filter-by-ingredient
      const candidateMap = new Map<string, MealSummary>();
      for (const kw of keywords) {
        try {
          const list = await filterMealsByIngredient(kw);
          for (const m of list) candidateMap.set(m.idMeal, m);
        } catch (e) {
          // ignore individual ingredient fetch errors
        }
      }

      const candidates = Array.from(candidateMap.values()).slice(0, 12);
      if (candidates.length === 0) {
        Alert.alert("No quick ideas", `Tried keywords: ${keywords.join(", ")}`);
        return;
      }

      const scored: typeof quickMeals = [];
      for (const c of candidates) {
        try {
          const detail = await getMealById(c.idMeal);
          if (!detail) continue;

          const raw = parseMealIngredients(detail)
            .filter((i) => i.name && i.qty > 0)
            .map((i) => ({ name: i.name, qty: i.qty, unit: mapUnit(i.unit) as any }));

          const simplified = simplifyIngredients(raw as any, pantryNames, { maxItems: 7, minQty: 0.25 });

          // count missing (by name exact match in pantry)
          let missing = 0;
          for (const ing of simplified) {
            const has = items.find((p) => p.name.toLowerCase() === ing.name.toLowerCase());
            if (!has || has.qty < ing.qty) missing++;
          }

          if (simplified.length <= 7 && missing <= 2) {
            scored.push({ ...c, missing, simplified });
          }
        } catch {
          // skip bad candidate
        }
      }

      scored.sort((a, b) => a.missing - b.missing || a.strMeal.localeCompare(b.strMeal));
      setQuickMeals(scored);
      if (scored.length === 0) {
        Alert.alert("No simple matches", `Tried keywords: ${keywords.join(", ")}\nTry adding more pantry items.`);
      }
    } finally {
      setQuickLoading(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing.md }}>
      <Text style={styles.title}>Recipes</Text>

      {/* Quick ideas */}
      <Pressable style={styles.primary} onPress={loadQuickIdeas} disabled={quickLoading}>
        <Text style={styles.primaryText}>{quickLoading ? "Finding quick ideas…" : "Quick ideas (Simple)"}</Text>
      </Pressable>

      {quickTried && quickMeals.length === 0 && !quickLoading ? (
        <Text style={styles.helper}>Tried: {quickTried.join(", ")}</Text>
      ) : null}

      {quickMeals.length > 0 && (
        <View style={styles.detail}>
          <Text style={styles.detailTitle}>Based on your pantry</Text>
          <FlatList
            data={quickMeals}
            keyExtractor={(m) => m.idMeal}
            ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
            renderItem={({ item }) => (
              <View style={{ gap: 6 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  {item.strMealThumb ? (
                    <Image source={{ uri: item.strMealThumb }} style={styles.thumb} />
                  ) : (
                    <View style={[styles.thumb, { opacity: 0.6 }]} />
                  )}
                  <Text style={{ color: colors.fg, fontWeight: "700", flexShrink: 1 }}>
                    {item.strMeal} {item.missing ? `· missing ${item.missing}` : "· ready!"}
                  </Text>
                </View>
                {item.simplified.map((ing, idx) => {
                  const inPantry = items.some(
                    (p) => p.name.toLowerCase() === ing.name.toLowerCase() && p.qty >= ing.qty
                  );
                  return (
                    <Text
                      key={idx}
                      style={{ color: inPantry ? 'green' : 'red' }}
                    >
                      • {ing.name} — {ing.qty} {ing.unit}
                    </Text>
                  );
                })}
                <Pressable
                  style={[styles.primary, { alignSelf: "flex-start", marginTop: 6 }]}
                  onPress={() => {
                    const res = cookFromIngredients(item.simplified as any);
                    if (res.ok) Alert.alert("Cooked!", "Ingredients deducted from pantry.");
                    else {
                      const lines = res.shortages.map((s) => `• ${s.name}`).join("\n");
                      Alert.alert("Missing items", lines || "Not enough ingredients.");
                    }
                  }}
                >
                  <Text style={styles.primaryText}>Cook (deduct)</Text>
                </Pressable>
              </View>
            )}
          />
        </View>
      )}

      {/* Manual search */}
      <View style={styles.searchRow}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search meals (e.g. pasta, chicken)…"
          placeholderTextColor={colors.fgDim}
          style={styles.input}
          onSubmitEditing={onSearch}
          returnKeyType="search"
        />
        <Pressable style={styles.primary} onPress={onSearch} disabled={loading}>
          <Text style={styles.primaryText}>{loading ? "Searching…" : "Search"}</Text>
        </Pressable>
      </View>

      {loading && <ActivityIndicator color={colors.fg} style={{ marginVertical: 8 }} />}

      <FlatList
        data={results}
        keyExtractor={(m) => m.idMeal}
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        renderItem={({ item }) => (
          <Pressable style={styles.card} onPress={() => onSelect(item.idMeal, item.strMeal)}>
            {item.strMealThumb ? (
              <Image source={{ uri: item.strMealThumb }} style={styles.thumb} />
            ) : (
              <View style={[styles.thumb, styles.thumbFallback]} />
            )}
            <Text style={styles.name}>{item.strMeal}</Text>
          </Pressable>
        )}
        ListEmptyComponent={!loading ? <Text style={styles.empty}>Try searching for a recipe.</Text> : null}
      />

      {selectedIngs && (
        <View style={styles.detail}>
          <Text style={styles.detailTitle}>{selectedName}</Text>
          <Pressable
            style={[styles.secondary, { alignSelf: "flex-start", marginBottom: 8 }]}
            onPress={() => setSimpleMode((v) => !v)}
          >
            <Text style={styles.secondaryText}>Simple mode: {simpleMode ? "ON" : "OFF"}</Text>
          </Pressable>
          <FlatList
            data={selectedIngs}
            keyExtractor={(i, idx) => `${i.name}-${idx}`}
            renderItem={({ item }) => {
              const inPantry = items.some(
                (p) => p.name.toLowerCase() === item.name.toLowerCase() && p.qty >= item.qty
              );
              return (
                <Text style={[styles.ing, { color: inPantry ? 'green' : 'red' }]}>• {item.name} — {item.qty} {item.unit}</Text>
              );
            }}
            ItemSeparatorComponent={() => <View style={{ height: 4 }} />}
            style={{ maxHeight: 200, marginTop: spacing.sm }}
          />
          <Pressable style={[styles.primary, { alignSelf: "flex-start", marginTop: spacing.sm }]} onPress={onCookSelected}>
            <Text style={styles.primaryText}>Cook (deduct)</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.fg, fontWeight: "700", fontSize: 20, marginBottom: spacing.md },
  helper: { color: colors.fgDim, marginTop: 6, marginBottom: spacing.md },
  searchRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md, marginBottom: spacing.md },
  input: {
    flex: 1,
    color: colors.fg,
    backgroundColor: "#0f1318",
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  primary: { backgroundColor: colors.brand, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 10 },
  primaryText: { color: "#fff", fontWeight: "700" },
  secondary: { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 8 },
  secondaryText: { color: colors.fg, fontWeight: "600" },

  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.sm,
  },
  thumb: { width: 56, height: 56, borderRadius: radius.md, backgroundColor: "#111" },
  thumbFallback: { opacity: 0.6 },
  name: { color: colors.fg, fontWeight: "600", flexShrink: 1 },
  empty: { color: colors.fgDim, textAlign: "center", marginTop: 24 },

  detail: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  detailTitle: { color: colors.fg, fontWeight: "700", fontSize: 16 },
  ing: { color: colors.fg },
});
