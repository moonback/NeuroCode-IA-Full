import { BaseProvider } from '~/lib/modules/llm/base-provider';
import type { ModelInfo } from '~/lib/modules/llm/types';
import type { IProviderSetting } from '~/types/model';
import type { LanguageModelV1 } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';

export default class GithubProvider extends BaseProvider {
  name = 'Github';
  getApiKeyLink = 'https://github.com/settings/personal-access-tokens';

  config = {
    apiTokenKey: 'GITHUB_API_KEY',
  };

  // find more in https://github.com/marketplace?type=models
  staticModels: ModelInfo[] = [
    { nom : 'gpt-4o-mini', label : 'GPT-4o mini', fournisseur : 'Github', maxTokenAllowed : 8000 },
    { nom : 'o1-mini', étiquette : 'o1-mini', fournisseur : 'Github', maxTokenAllowed : 4 000 }, // nécessite Copilot Pro
    { nom : 'o1-preview', étiquette : 'o1-preview', fournisseur : 'Github', maxTokenAllowed : 4 000 }, // nécessite Copilot Pro
    { nom : 'o1', étiquette : 'o1', fournisseur : 'Github', maxTokenAllowed : 4 000 },
    { nom : 'o3-mini', étiquette : 'o3-mini', fournisseur : 'Github', maxTokenAllowed : 4 000 }, // nécessite Copilot Pro
    { nom : 'DeepSeek-V3', étiquette : 'DeepSeek-V3', fournisseur : 'Github', maxTokenAllowed : 8 000 },
    { nom : 'DeepSeek-R1', étiquette : 'DeepSeek-R1', fournisseur : 'Github', maxTokenAllowed : 4 000 },
    { nom : 'Llama-3.3-70B-Instruct', étiquette : 'Llama-3.3-70B-Instruct', fournisseur : 'Github', maxTokenAllowed : 8 000 },
  ] ;

  getModelInstance(options: {
    model: string;
    serverEnv: Env;
    apiKeys?: Record<string, string>;
    providerSettings?: Record<string, IProviderSetting>;
  }): LanguageModelV1 {
    const { model, serverEnv, apiKeys, providerSettings } = options;

    const { apiKey } = this.getProviderBaseUrlAndKey({
      apiKeys,
      providerSettings: providerSettings?.[this.name],
      serverEnv: serverEnv as any,
      defaultBaseUrlKey: '',
      defaultApiTokenKey: 'GITHUB_API_KEY',
    });

    if (!apiKey) {
      throw new Error(`Missing API key for ${this.name} provider`);
    }

    const openai = createOpenAI({
      baseURL: 'https://models.inference.ai.azure.com',
      apiKey,
    });

    return openai(model);
  }
}
