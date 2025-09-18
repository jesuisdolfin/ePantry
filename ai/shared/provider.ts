// shared/provider.ts
import type { SuggestReq, SuggestRes } from './types';

export interface PantryAIProvider {
  suggestRecipes(input: SuggestReq): Promise<SuggestRes>;
  cookWithMe?(input: SuggestReq): Promise<SuggestRes>; // optional feature
}
