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
import { getAIProvider } from '../../ai';


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

  // --- NEW: User recipe creation state ---
  const [creating, setCreating] = useState(false);
  const [newRecipeName, setNewRecipeName] = useState("");
  const [newIngredients, setNewIngredients] = useState<
    { name: string; qty: number; unit: string }[]
  >([]);
  const [newIngName, setNewIngName] = useState("");
  const [newIngQty, setNewIngQty] = useState("");
  const [newIngUnit, setNewIngUnit] = useState("");

  // --- NEW: Save user recipe (in-memory for now) ---
  const [userRecipes, setUserRecipes] = useState<
    { name: string; ingredients: { name: string; qty: number; unit: string }[] }[]
  >([]);

  // AI suggest state
const [aiLoading, setAiLoading] = useState(false);
const [aiRecipes, setAiRecipes] = useState<
  { title: string; ingredientsUsed: string[]; missing: string[]; swaps?: string[]; steps: string[]; estTimeMins: number; difficulty: 'easy'|'med'|'hard' }[]
>([]);


  const addIngredient = () => {
    if (!newIngName || !newIngQty) return;
    setNewIngredients([
      ...newIngredients,
      { name: newIngName, qty: Number(newIngQty), unit: newIngUnit },
    ]);
    setNewIngName("");
    setNewIngQty("");
    setNewIngUnit("");
  };

  const saveRecipe = () => {
    if (!newRecipeName || newIngredients.length === 0) return;
    setUserRecipes([
      ...userRecipes,
      { name: newRecipeName, ingredients: newIngredients },
    ]);
    setCreating(false);
    setNewRecipeName("");
    setNewIngredients([]);
  };

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
      setSelectedIngs(simplified as any); // Always use simplified
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

  async function onAISuggestFromPantry() {
  try {
    setAiLoading(true);
    setAiRecipes([]);

    // Convert your inventory items to the provider’s expected shape
    const pantry = items.map(i => ({
      name: i.name,
      quantity: typeof i.qty === 'number' ? i.qty : Number(i.qty) || 0
    }));

    const ai = getAIProvider();
    const res = await ai.suggestRecipes({
      pantry,
      prefs: { allergies: [] },           // plug user prefs if you have them
      toolsAvailable: ['stovetop','oven'],
      timeBudgetMins: 30
    });

    setAiRecipes(res.recipes || []);
    if (!res.recipes?.length) {
      Alert.alert('No ideas', 'AI did not return any recipes. Try adding more pantry items.');
    }
  } catch (e: any) {
    Alert.alert('AI error', String(e?.message || e));
  } finally {
    setAiLoading(false);
  }
}


  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing.md }}>

      {/* NEW: Create Recipe Button */}
      {!creating && (
        <Pressable style={styles.primary} onPress={() => setCreating(true)}>
          <Text style={styles.primaryText}>Create Recipe</Text>
        </Pressable>
      )}

      {/* Add spacing between Create Recipe button and Your Recipes header */}
      {!creating && userRecipes.length > 0 && (
        <View style={{ height: spacing.lg }} />
      )}

      {userRecipes.length > 0 && (
        <View>
          <FlatList
            data={userRecipes}
            keyExtractor={(r, idx) => `${r.name}-${idx}`}
            renderItem={({ item }) => (
              <View style={styles.detail}>
                <Text style={styles.detailTitle}>{item.name}</Text>
                <FlatList
                  data={item.ingredients}
                  keyExtractor={(i, idx) => `${i.name}-${idx}`}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  renderItem={({ item: ing }) => {
                    const inPantry = items.some(
                      (p) => p.name.toLowerCase() === ing.name.toLowerCase() && p.qty >= ing.qty
                    );
                    return (
                      <View style={[
                        styles.pill,
                        { backgroundColor: inPantry ? "#C7F9CC" : "#FFD6D6", borderColor: inPantry ? "#2D6A4F" : "#D7263D" }
                      ]}>
                        <Text style={{ color: inPantry ? "#2D6A4F" : "#D7263D", fontWeight: "600" }}>
                          {ing.name} — {ing.qty} {ing.unit}
                        </Text>
                      </View>
                    );
                  }}
                  style={{ marginVertical: spacing.sm }}
                />
                <Pressable
                  style={[styles.primary, { alignSelf: "flex-start", marginTop: spacing.sm }]}
                  onPress={() => {
                    const res = cookFromIngredients(item.ingredients as any);
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

      {/* NEW: Recipe Creation Form */}
      {creating && (
        <View style={styles.detail}>
          <Text style={styles.detailTitle}>Create a Recipe</Text>
          {/* Add this spacer for more vertical space */}
          <View style={{ height: spacing.lg }} />
          <View style={{ marginBottom: spacing.sm }}>
            <TextInput
              value={newRecipeName}
              onChangeText={setNewRecipeName}
              placeholder="Recipe name"
              style={[
                styles.input,
                styles.inputTall,
                { color: colors.fg, backgroundColor: colors.card }
              ]}
              placeholderTextColor={colors.fgDim}
              selectionColor={colors.fg}
            />
          </View>
          <View style={styles.inputRow}>
            <TextInput
              value={newIngName}
              onChangeText={setNewIngName}
              placeholder="Ingredient"
              style={[styles.input, styles.inputLight, { flex: 2 }]}
              placeholderTextColor={colors.fgDim}
            />
            <TextInput
              value={newIngQty}
              onChangeText={setNewIngQty}
              placeholder="Qty"
              keyboardType="numeric"
              style={[styles.input, styles.inputLight, { flex: 1 }]}
              placeholderTextColor={colors.fgDim}
            />
            <TextInput
              value={newIngUnit}
              onChangeText={setNewIngUnit}
              placeholder="Unit"
              style={[styles.input, styles.inputLight, { flex: 1 }]}
              placeholderTextColor={colors.fgDim}
            />
            <Pressable style={styles.secondary} onPress={addIngredient}>
              <Text style={styles.secondaryText}>Add</Text>
            </Pressable>
          </View>
          <FlatList
            data={newIngredients}
            keyExtractor={(i, idx) => `${i.name}-${idx}`}
            renderItem={({ item }) => (
              <Text style={styles.ing}>• {item.name} — {item.qty} {item.unit}</Text>
            )}
            style={{ marginTop: spacing.sm, maxHeight: 120 }}
          />
          <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm }}>
            <Pressable style={styles.primary} onPress={saveRecipe}>
              <Text style={styles.primaryText}>Save Recipe</Text>
            </Pressable>
            <Pressable style={styles.secondary} onPress={() => setCreating(false)}>
              <Text style={styles.secondaryText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Manual search */}
      <View style={styles.searchRow}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search meals (e.g. pasta, chicken)…"
          placeholderTextColor={colors.fgDim}
          style={[
            styles.input,
            {
              flex: 1,
              marginBottom: 0,
              maxWidth: 220,      // limit max width
              flexShrink: 1,      // allow shrinking
            }
          ]}
          onSubmitEditing={onSearch}
          returnKeyType="search"
        />
        <Pressable
          style={[styles.primary, styles.searchButton]}
          onPress={onSearch}
          disabled={loading}
        >
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

      {/* --- AI Suggest From Pantry --- */}
<View style={{ marginTop: spacing.md, marginBottom: spacing.md }}>
  <Pressable
    style={[styles.primary, { alignSelf: 'flex-start' }]}
    onPress={onAISuggestFromPantry}
    disabled={aiLoading}
  >
    <Text style={styles.primaryText}>
      {aiLoading ? 'Thinking…' : 'AI: Suggest from Pantry'}
    </Text>
  </Pressable>

  {aiLoading && <ActivityIndicator color={colors.fg} style={{ marginTop: 8 }} />}

  {!!aiRecipes.length && (
    <View style={styles.detail}>
      <Text style={styles.detailTitle}>AI Suggestions</Text>
      <FlatList
        data={aiRecipes}
        keyExtractor={(r, idx) => `${r.title}-${idx}`}
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        renderItem={({ item }) => (
          <View style={{ gap: 6 }}>
            <Text style={[styles.name, { fontSize: 16 }]}>{item.title}</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Text style={{ color: colors.fgDim }}>
                {item.estTimeMins} min • {item.difficulty}
              </Text>
            </View>

            {/* Used & missing chips */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
              {item.ingredientsUsed.slice(0, 8).map((ing, i) => (
                <View key={`${ing}-${i}`} style={[styles.pill, { backgroundColor: '#C7F9CC', borderColor: '#2D6A4F' }]}>
                  <Text style={{ color: '#2D6A4F', fontWeight: '600' }}>{ing}</Text>
                </View>
              ))}
              {item.missing.slice(0, 4).map((ing, i) => (
                <View key={`miss-${ing}-${i}`} style={[styles.pill, { backgroundColor: '#FFD6D6', borderColor: '#D7263D' }]}>
                  <Text style={{ color: '#D7263D', fontWeight: '600' }}>Missing: {ing}</Text>
                </View>
              ))}
            </View>

            {/* First few steps */}
            <View style={{ marginTop: 6 }}>
              {item.steps.slice(0, 5).map((s, i) => (
                <Text key={i} style={styles.ing}>• {s}</Text>
              ))}
              {item.steps.length > 5 && (
                <Text style={[styles.ing, { opacity: 0.7 }]}>…and {item.steps.length - 5} more steps</Text>
              )}
            </View>
          </View>
        )}
      />
    </View>
  )}
</View>

    </View>
  );

  
}

const styles = StyleSheet.create({
  title: { color: colors.fg, fontWeight: "700", fontSize: 20, marginBottom: spacing.md },
  helper: { color: colors.fgDim, marginTop: 6, marginBottom: spacing.md },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  input: {
    borderColor: colors.border,
    borderWidth: 1.5,
    borderRadius: radius.lg, // more rounded
    backgroundColor: colors.card,
    color: colors.fg,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 18,
    marginBottom: spacing.sm,
  },
  // NEW: Light input style for recipe creation
  inputLight: {
    backgroundColor: colors.bg,
    color: colors.fg,
    borderRadius: radius.lg,
  },
  inputTall: {
    height: 56,
    fontSize: 20,
    paddingVertical: 14,
    textAlignVertical: "center",
    color: colors.fg,
    borderRadius: radius.lg,
  },
  primary: {
    backgroundColor: colors.brand,
    borderRadius: radius.lg,
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowColor: "#FF9800",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 2,
  },
  primaryText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  secondary: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  secondaryText: { color: colors.fg, fontWeight: "600", fontSize: 15 },

  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.sm,
    // Add shadow for iOS
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    // Elevation for Android
    elevation: 2,
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
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  detailTitle: { color: colors.fg, fontWeight: "700", fontSize: 16 },
  ing: { color: colors.fg },
  inputRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  pill: {
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: spacing.sm,
    marginBottom: spacing.sm,
  },
  searchButton: {
    width: 100, // fixed width for button
    alignItems: "center",
    justifyContent: "center",
    marginLeft: spacing.sm,
  },
pillSmall: {
  borderRadius: 16,
  borderWidth: 1,
  paddingHorizontal: 10,
  paddingVertical: 4,
},

});
