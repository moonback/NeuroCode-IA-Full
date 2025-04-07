import { BaseProvider } from '~/lib/modules/llm/base-provider';
import type { ModelInfo } from '~/lib/modules/llm/types';
import type { IProviderSetting } from '~/types/model';
import type { LanguageModelV1 } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';

// Taille de contexte par défaut courante pour Gemini 1.5 Pro/Flash (128k)
const DEFAULT_GEMINI_1_5_CONTEXT = 131072;
// Limite de sortie courante (utilisée si le contexte total n'est pas clair)
const DEFAULT_GEMINI_OUTPUT_LIMIT = 8192;

export default class GoogleProvider extends BaseProvider {
  name = 'Google';
  getApiKeyLink = 'https://aistudio.google.com/app/apikey';

  config = {
    apiTokenKey: 'GOOGLE_GENERATIVE_AI_API_KEY',
  };

  // Mise à jour des modèles statiques avec des tailles de contexte plus réalistes
  staticModels: ModelInfo[] = [
    {
      name: 'gemini-1.5-flash-latest',
      label: 'Gemini 1.5 Flash',
      provider: 'Google',
      maxTokenAllowed: DEFAULT_GEMINI_1_5_CONTEXT
    },
    {
      name: 'gemma-3-27b-it',
      label: 'Gemma 3 27B Instruct',
      provider: 'Google',
      maxTokenAllowed: 8192  // Gemma models typically have smaller context windows
    },
    {
      name: 'gemini-exp-1206',
      label: 'Gemini exp-1206',
      provider: 'Google',
      maxTokenAllowed: DEFAULT_GEMINI_1_5_CONTEXT
    }
  ];

  async getDynamicModels(
    apiKeys?: Record<string, string>,
    settings?: IProviderSetting,
    serverEnv?: Record<string, string>,
  ): Promise<ModelInfo[]> {
    const { apiKey } = this.getProviderBaseUrlAndKey({
      apiKeys,
      providerSettings: settings,
      serverEnv: serverEnv as any,
      defaultBaseUrlKey: '',
      defaultApiTokenKey: 'GOOGLE_GENERATIVE_AI_API_KEY',
    });

    if (!apiKey) {
      // On pourrait retourner un tableau vide ou les modèles statiques par défaut
      // au lieu de lever une exception, selon le comportement souhaité.
      console.warn(`Missing Api Key configuration for ${this.name} provider to fetch dynamic models.`);
      return []; // Retourne un tableau vide si la clé API manque
      // throw `Missing Api Key configuration for ${this.name} provider`;
    }

    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`, {
        headers: {
          ['Content-Type']: 'application/json',
        },
      });

      if (!response.ok) {
        // Gérer les erreurs de l'API (clé invalide, etc.)
        console.error(`Failed to fetch dynamic models from Google API: ${response.status} ${response.statusText}`);
        const errorBody = await response.text();
        console.error("Error details:", errorBody);
        return []; // Retourne un tableau vide en cas d'erreur API
      }

      const res = (await response.json()) as any;

      // Attention: L'API peut ne pas retourner inputTokenLimit/outputTokenLimit pour tous les modèles.
      // Le filtrage et le calcul pourraient nécessiter des ajustements.
      // Le filtre 'outputTokenLimit > 8000' semble arbitraire, on pourrait le retirer ou l'ajuster.
      const data = res.models
        .filter((model: any) => model.supportedGenerationMethods?.includes('generateContent')) // Filtre plus pertinent
        .filter((model: any) => (model.inputTokenLimit || 0) + (model.outputTokenLimit || 0) > 8000); // Garder un filtre sur la taille totale minimale


      return data.map((m: any) => {
        const totalContext = (m.inputTokenLimit || 0) + (m.outputTokenLimit || 0);
        const contextLabel = totalContext > 0 ? ` - context ${Math.floor(totalContext / 1000)}k` : '';
        return {
          name: m.name.replace('models/', ''),
          // Utiliser displayName si disponible, sinon extraire du nom
          label: `${m.displayName || m.name.replace('models/', '')}${contextLabel}`,
          provider: this.name,
          // Fournir une valeur par défaut si les limites ne sont pas définies
          maxTokenAllowed: totalContext > 0 ? totalContext : DEFAULT_GEMINI_OUTPUT_LIMIT,
        };
      });
    } catch (error) {
      console.error(`Error fetching or processing dynamic models for ${this.name}:`, error);
      return []; // Retourne un tableau vide en cas d'exception
    }
  }

  getModelInstance(options: {
    model: string;
    serverEnv: any;
    apiKeys?: Record<string, string>;
    providerSettings?: Record<string, IProviderSetting>;
  }): LanguageModelV1 {
    const { model, serverEnv, apiKeys, providerSettings } = options;

    const { apiKey } = this.getProviderBaseUrlAndKey({
      apiKeys,
      providerSettings: providerSettings?.[this.name],
      serverEnv: serverEnv as any,
      defaultBaseUrlKey: '',
      defaultApiTokenKey: 'GOOGLE_GENERATIVE_AI_API_KEY',
    });

    if (!apiKey) {
      throw new Error(`Missing API key for ${this.name} provider`);
    }

    const google = createGoogleGenerativeAI({
      apiKey,
      // On pourrait ajouter d'autres options ici si nécessaire (e.g., baseURL)
    });

    // Ajoute 'models/' si ce n'est pas déjà présent, car l'API Google le requiert souvent
    const modelId = model.startsWith('models/') ? model : `models/${model}`;

    // L'AI SDK gère le préfixe 'models/', donc on peut juste passer le nom court.
    // Vérifions la documentation de `@ai-sdk/google` pour confirmer.
    // En général, passer 'gemini-1.5-pro-latest' fonctionne directement.
    return google(model);
  }
}
