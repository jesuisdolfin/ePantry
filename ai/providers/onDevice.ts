// ai/providers/onDevice.ts
import type { SuggestReq, SuggestRes } from '../shared/types';
import { PantryAIProvider } from '../shared/provider';

export class OnDeviceProvider implements PantryAIProvider {
  async suggestRecipes(input: SuggestReq): Promise<SuggestRes> {
    // TODO: replace this with real call to your local model
    return {
      recipes: [
        {
          title: 'Sample Chicken & Rice',
          ingredientsUsed: ['chicken breast', 'rice', 'onion'],
          missing: ['garlic'],
          swaps: ['garlic → shallot'],
          steps: [
            'Dice chicken and onion.',
            'Cook onion, then chicken.',
            'Add rice and water; simmer 20 min.',
            'Season and serve.'
          ],
          estTimeMins: 30,
          difficulty: 'easy'
        }
      ]
    };
  }
}
