// src/state/inventory.ts
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { nanoid } from "nanoid/non-secure";

export type Unit = "ea" | "g" | "ml" | "lb" | "oz";
export type Ingredient = { name: string; qty: number; unit: Unit; upc?: string };


export type PantryItem = {
  id: string;
  upc?: string;
  name: string;
  brand?: string;
  qty: number;
  unit: Unit;
  location?: string;
  expiry_date?: string;
  updated_at?: string;
  image_url?: string;
  size?: string;
};

type InventoryState = {
  items: PantryItem[];
  // session cache for product lookups (not persisted to disk)
  productCache: Record<string, { name?: string; brand?: string; image_url?: string; size?: string }>;

  addOrIncrementByUpc: (payload: Omit<PantryItem, "id" | "qty"> & { qty?: number }) => void;
  updateQty: (id: string, delta: number) => void;
  removeItem: (id: string) => void;

  // NEW: update item fields by UPC (e.g., after product lookup)
  updateByUpc: (upc: string, partial: Partial<Pick<PantryItem, "name" | "brand" | "image_url" | "size">>) => void;
  cookFromIngredients: (ings: Ingredient[]) => { ok: boolean; shortages: { name: string; need: number; have: number; unit: Unit }[] };


  setItems: (items: PantryItem[]) => void;
  reset: () => void;
};

export const useInventoryStore = create<InventoryState>()(
  persist(
    (set, get) => ({
      items: [],
      productCache: {},

      addOrIncrementByUpc: ({ upc, name, brand, unit = "ea", location, expiry_date, qty = 1, image_url, size }) =>
        set(({ items }) => {
          if (upc) {
            const idx = items.findIndex((i) => i.upc === upc);
            if (idx >= 0) {
              const next = [...items];
              next[idx] = {
                ...next[idx],
                qty: next[idx].qty + qty,
                updated_at: new Date().toISOString(),
              };
              return { items: next };
            }
          }
          const now = new Date().toISOString();
          const item: PantryItem = {
            id: nanoid(),
            upc, name, brand, qty, unit, location, expiry_date,
            updated_at: now,
            image_url,
            size,
          };
          return { items: [item, ...items] };
        }),

      updateQty: (id, delta) =>
        set(({ items }) => {
          const idx = items.findIndex((i) => i.id === id);
          if (idx < 0) return { items };
          const next = [...items];
          const newQty = Math.max(0, next[idx].qty + delta);
          next[idx] = { ...next[idx], qty: newQty, updated_at: new Date().toISOString() };
          return { items: next };
        }),

        cookFromIngredients: (ings: Ingredient[]) => {
  const { items } = get();

  // simple unit normalization for matching
  const norm = (s: string) => s.trim().toLowerCase();
  const toUnit = (u: string): Unit => {
    const x = norm(u);
    if (x.includes("g")) return "g";
    if (x.includes("ml")) return "ml";
    if (x.includes("lb")) return "lb";
    if (x.includes("oz")) return "oz";
    return "ea";
  };

  // pre-check shortages
  const shortages: { name: string; need: number; have: number; unit: Unit }[] = [];
  for (const ing of ings) {
    // find by UPC if provided, otherwise name match
    const match = ing.upc
      ? items.find(i => i.upc === ing.upc)
      : items.find(i => norm(i.name) === norm(ing.name));

    const have = match?.qty ?? 0;
    const need = ing.qty;

    if (have < need) {
      shortages.push({
        name: match?.name || ing.name,
        need,
        have,
        unit: ing.unit,
      });
    }
  }

  if (shortages.length) {
    return { ok: false as const, shortages };
  }

  // deduct
  const next = items.map(it => {
    const ing = ings.find(x =>
      (x.upc && x.upc === it.upc) ||
      norm(x.name) === norm(it.name)
    );
    if (!ing) return it;
    return { ...it, qty: Math.max(0, it.qty - ing.qty), updated_at: new Date().toISOString() };
  });

  set({ items: next });
  return { ok: true as const, shortages: [] as any[] };
},


      removeItem: (id) =>
        set(({ items }) => ({ items: items.filter((i) => i.id !== id) })),

      updateByUpc: (upc, partial) =>
        set(({ items, productCache }) => {
          const next = items.map((it) =>
            it.upc === upc
              ? {
                  ...it,
                  // only overwrite placeholders/unknowns
                  name: partial.name ?? it.name,
                  brand: partial.brand ?? it.brand,
                  image_url: partial.image_url ?? it.image_url,
                  size: partial.size ?? it.size,
                  updated_at: new Date().toISOString(),
                }
              : it
          );
          const cacheNext = { ...productCache, [upc]: { ...productCache[upc], ...partial } };
          return { items: next, productCache: cacheNext };
        }),

      setItems: (items) => set({ items }),
      reset: () => set({ items: [] }),
    }),
    {
      name: "pantry-store",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ items: state.items }), // persist items only
      version: 1,
    }
  )
);
