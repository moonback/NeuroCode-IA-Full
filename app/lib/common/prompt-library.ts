import { getSystemPrompt } from './prompts/prompts';
import optimized from './prompts/optimized';
import reasoning from './prompts/reasoning';
import debugging from './prompts/debugging';


export interface PromptOptions {
  cwd: string;
  allowedHtmlElements: string[];
  modificationTagName: string;
  customInstructions?: string; // Add support for custom instructions
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
      get: (options) => {
        const prompt = getSystemPrompt(options.cwd, options.supabase, options.customInstructions);
        return prompt !== undefined ? prompt : ''; // Ensure a string is always returned
      },
    },
    optimized: {
      label: 'Optimiser ',
      description: 'Version expérimentale du prompt optimisée pour réduire la consommation de tokens',
      get: (options) => {
        // Add custom instructions to optimized prompt if provided
        const basePrompt = optimized(options);
        if (options.customInstructions && options.customInstructions.trim() !== '') {
          return `<custom_user_instructions>\n${options.customInstructions.trim()}\n</custom_user_instructions>\n\n${basePrompt}`;
        }
        return basePrompt;
      },
    },
    debugging: {
      label: 'Débogage',
      description: 'Prompt spécialisé pour le débogage de projets avec chaîne de pensée explicite',
      get: (options) => {
        // Use the debugging prompt with chain of thought methodology
        const basePrompt = debugging(options);
        if (options.customInstructions && options.customInstructions.trim() !== '') {
          return `<custom_user_instructions>\n${options.customInstructions.trim()}\n</custom_user_instructions>\n\n${basePrompt}`;
        }
        return basePrompt;
      },
    },
    chatOnly: {
      label: 'Chat uniquement',
      description: 'Prompt spécialisé pour les interactions de chat sans workbench',
      get: (options) => {
        const basePrompt = `Vous êtes un assistant de chat spécialisé. 
        Vous ne devez pas interagir avec le workbench.
        Vos réponses doivent être concises et orientées vers la conversation.
        Contexte actuel : ${options.cwd}`;
        
        if (options.customInstructions && options.customInstructions.trim() !== '') {
          return `<custom_user_instructions>\n${options.customInstructions.trim()}\n</custom_user_instructions>\n\n${basePrompt}`;
        }
        return basePrompt;
      },
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
      throw 'Prompt Not Found'; // Fixed typo from "Now" to "Not"
    }

    return this.library[promptId]?.get(options);
  }
}
