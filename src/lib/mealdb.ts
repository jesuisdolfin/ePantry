// src/lib/mealdb.ts

// API docs: https://www.themealdb.com/api.php

export type MealSummary = {
  idMeal: string;
  strMeal: string;
  strMealThumb: string | null;
};

export type MealDetail = MealSummary & {
  strInstructions?: string | null;
  // TheMealDB encodes ingredients as 20 pairs of fields
  [key: string]: any;
};

const BASE = "https://www.themealdb.com/api/json/v1/1";

/** Search by name (partial match). Returns summaries. */
export async function searchMealsByName(q: string): Promise<MealSummary[]> {
  if (!q.trim()) return [];
  const res = await fetch(`${BASE}/search.php?s=${encodeURIComponent(q)}`);
  const json = await res.json();
  const list = (json?.meals ?? []) as MealDetail[];
  return list.map(({ idMeal, strMeal, strMealThumb }) => ({
    idMeal,
    strMeal,
    strMealThumb: strMealThumb || null,
  }));
}

/** Get full detail (ingredients come in strIngredient1..20 / strMeasure1..20) */
export async function getMealById(idMeal: string): Promise<MealDetail | null> {
  const res = await fetch(`${BASE}/lookup.php?i=${encodeURIComponent(idMeal)}`);
  const json = await res.json();
  const meal = (json?.meals?.[0] as MealDetail) ?? null;
  return meal;
}

export type ParsedIngredient = {
  name: string;
  qty: number;       // parsed numeric amount if we can guess it, else 1
  unit: string;      // raw unit text (we'll map to your Unit later)
};

/** Extract ingredients+measures (1..20) into a normalized list */
export function parseMealIngredients(meal: MealDetail): ParsedIngredient[] {
  const out: ParsedIngredient[] = [];
  for (let i = 1; i <= 20; i++) {
    const name = (meal[`strIngredient${i}`] as string | null)?.trim();
    const measure = (meal[`strMeasure${i}`] as string | null)?.trim();
    if (!name) continue;
    const { qty, unit } = splitMeasure(measure ?? "");
    out.push({
      name,
      qty,
      unit,
    });
  }
  return out;
}

export async function filterMealsByIngredient(ingredient: string): Promise<MealSummary[]> {
  // Returns meals that contain this ingredient (broad match)
  const res = await fetch(`${BASE}/filter.php?i=${encodeURIComponent(ingredient)}`);
  const json = await res.json();
  const list = (json?.meals ?? []) as any[];
  return list.map(({ idMeal, strMeal, strMealThumb }) => ({
    idMeal, strMeal, strMealThumb: strMealThumb || null,
  }));
}


/** Very lightweight measure parser (e.g., "2 cups", "1/2 lb", "400 g") */
function splitMeasure(measure: string): { qty: number; unit: string } {
  if (!measure) return { qty: 1, unit: "ea" };
  const cleaned = measure.replace(",", ".").toLowerCase();

  // support common fraction formats like "1/2" or "1 1/2"
  const fracMatch = cleaned.match(/^(\d+)\s+(\d+)\/(\d+)\s+(.+)$/);
  if (fracMatch) {
    const whole = parseFloat(fracMatch[1]);
    const num = parseFloat(fracMatch[2]);
    const den = parseFloat(fracMatch[3]);
    const unit = fracMatch[4].trim();
    const qty = whole + (den ? num / den : 0);
    return { qty: isFinite(qty) ? qty : 1, unit: unit || "ea" };
  }

  // simple "1/2 unit"
  const simpleFrac = cleaned.match(/^(\d+)\/(\d+)\s+(.+)$/);
  if (simpleFrac) {
    const num = parseFloat(simpleFrac[1]);
    const den = parseFloat(simpleFrac[2]);
    const unit = simpleFrac[3].trim();
    const qty = den ? num / den : 0;
    return { qty: isFinite(qty) && qty > 0 ? qty : 1, unit: unit || "ea" };
  }

  // simple "number unit"
  const m = cleaned.match(/^([\d.]+)\s*(.+)?$/);
  if (m) {
    const qty = parseFloat(m[1]);
    const unit = (m[2]?.trim() || "ea").replace(/\s+/g, " ");
    return { qty: isFinite(qty) && qty > 0 ? qty : 1, unit };
  }

  // couldn't parse → default
  return { qty: 1, unit: "ea" };
}
