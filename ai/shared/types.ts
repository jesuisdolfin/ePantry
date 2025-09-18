// shared/types.ts
export type PantryItem = { name: string; quantity?: number|string };

export type SuggestReq = {
  pantry: PantryItem[];
  prefs?: { vegetarian?: boolean; vegan?: boolean; allergies?: string[]; dislikes?: string[] };
  toolsAvailable?: string[];
  timeBudgetMins?: number; // default 30
};

export type Recipe = {
  title: string;
  ingredientsUsed: string[];
  missing: string[];
  swaps?: string[];
  steps: string[];
  estTimeMins: number;
  difficulty: 'easy' | 'med' | 'hard';
};

export type SuggestRes = { recipes: Recipe[] };
