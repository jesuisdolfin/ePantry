// providers/cloud.ts
import { PantryAIProvider } from '../shared/provider';
import type { SuggestReq, SuggestRes } from '../shared/types';

const API_BASE = process.env.EXPO_PUBLIC_API_BASE!; // your backend proxy (recommended)

export class CloudProvider implements PantryAIProvider {
  async suggestRecipes(input: SuggestReq): Promise<SuggestRes> {
    const r = await fetch(`${API_BASE}/suggest-recipes`, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify(input)
    });
    if (!r.ok) throw new Error('Cloud API error');
    return r.json();
  }
}
