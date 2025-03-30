import { getSystemPrompt } from './prompts/prompts';
import optimized from './prompts/optimized';
import neurocode from './prompts/neurocode';


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
      description: 'This is the battle tested default system Prompt',
      get: (options) => getSystemPrompt(options.cwd, options.supabase),
    },
    optimized: {
      label: 'Optimiser ',
      description: 'an Experimental version of the prompt for lower token usage',
      get: (options) => optimized(options),
    },
    smallModel: {
      label: 'Neurocode',
      description: 'a prompt optimized for llms with lower token usage',
      get: (options) => neurocode(options),
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
