// providers/ollama.ts
import { PantryAIProvider } from '../shared/provider';
import type { SuggestReq, SuggestRes } from '../shared/types';

const OLLAMA_URL = process.env.EXPO_PUBLIC_OLLAMA_URL ?? 'http://<laptop-ip>:11434';

export class OllamaProvider implements PantryAIProvider {
  async suggestRecipes(input: SuggestReq): Promise<SuggestRes> {
    const system = `You are a helpful assistant that suggests recipes based on available ingredients.`;
    const user = JSON.stringify(input);

    const r = await fetch(`${OLLAMA_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({
        model: 'llama3.1:8b-instruct',
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        temperature: 0.4
      })
    })
    const data = await r.json();
    const text = data?.choices?.[0]?.message?.content ?? '{}';

    // Extract braces + JSON.parse + validate
    return JSON.parse(text) as SuggestRes;
  }
}
