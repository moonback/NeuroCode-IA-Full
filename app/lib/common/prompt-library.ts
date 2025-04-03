import { getSystemPrompt } from './prompts/prompts';
import optimized from './prompts/optimized';
import reasoning from './prompts/reasoning';

export interface PromptOptions {
  cwd: string;
  allowedHtmlElements: string[];
  modificationTagName: string;
  supabase?: {
    isConnected: boolean;
    hasSelectedProject: boolean;
    credentials?: {
      anonKey?: string;
      supabaseUrl?: string;
    };
  };
}

export class PromptLibrary {
  static library: Record<
    string,
    {
      label: string;
      description: string;
      get: (options: PromptOptions) => string;
    }
  > = {
    default: {
      label: 'Officiel',
      description: 'Prompt système par défaut testé et approuvé',
      get: (options) => getSystemPrompt(options.cwd, options.supabase),
    },
    optimized: {
      label: 'Optimiser ',
      description: 'Version expérimentale du prompt optimisée pour réduire la consommation de tokens',
      get: (options) => optimized(options),
    },
    chatOnly: {
      label: 'Chat uniquement',
      description: 'Prompt spécialisé pour les interactions de chat sans workbench',
      get: (options) => `Vous êtes un assistant de chat spécialisé. 
        Vous ne devez pas interagir avec le workbench.
        Vos réponses doivent être concises et orientées vers la conversation.
        Contexte actuel : ${options.cwd}`,
    },
    reasoning: {
      label: 'AI SDK 4.2 Reasoning',
      description: 'Enhanced prompt that leverages AI SDK 4.2 reasoning capabilities',
      get: (options) => reasoning(options),
    },
  };
  static getList() {
    return Object.entries(this.library).map(([key, value]) => {
      const { label, description } = value;
      return {
        id: key,
        label,
        description,
      };
    });
  }
  static getPropmtFromLibrary(promptId: string, options: PromptOptions) {
    const prompt = this.library[promptId];

    if (!prompt) {
      throw 'Prompt Now Found';
    }

    return this.library[promptId]?.get(options);
  }
}
