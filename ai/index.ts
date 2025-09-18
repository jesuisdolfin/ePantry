// ai/index.ts
import { PantryAIProvider } from './shared/provider';
import { OnDeviceProvider } from './providers/onDevice';
//import { OllamaProvider } from './providers/ollama';
//import { CloudProvider } from './providers/cloud';

export function getAIProvider(): PantryAIProvider {
  const mode = process.env.EXPO_PUBLIC_AI_MODE ?? 'onDevice';
  switch (mode) {
    //case 'ollama': return new OllamaProvider();
    //case 'cloud':  return new CloudProvider();
    default:       return new OnDeviceProvider();
  }
}

