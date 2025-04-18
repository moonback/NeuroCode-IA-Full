import { generateText, type CoreTool, type GenerateTextResult, type Message } from 'ai';
import type { IProviderSetting } from '~/types/model';
import { DEFAULT_MODEL, DEFAULT_PROVIDER, PROVIDER_LIST } from '~/utils/constants';
import { createFilesContext, extractCurrentContext, extractPropertiesFromMessage, simplifyBoltActions } from './utils';
import { createScopedLogger } from '~/utils/logger';
import { LLMManager } from '~/lib/modules/llm/manager';
import { enhancedContextCache } from './enhanced-context-cache-service';

const logger = createScopedLogger('create-summary');

export async function createSummary(props: {
  messages: Message[];
  env?: Env;
  apiKeys?: Record<string, string>;
  providerSettings?: Record<string, IProviderSetting>;
  promptId?: string;
  contextOptimization?: boolean;
  onFinish?: (resp: GenerateTextResult<Record<string, CoreTool<any, any>>, never>) => void;
}) {
  const { messages, env: serverEnv, apiKeys, providerSettings, onFinish, promptId, contextOptimization } = props;
  let currentModel = DEFAULT_MODEL;
  let currentProvider = DEFAULT_PROVIDER.name;
  const processedMessages = messages.map((message) => {
    if (message.role === 'user') {
      const { model, provider, content } = extractPropertiesFromMessage(message);
      currentModel = model;
      currentProvider = provider;

      return { ...message, content };
    } else if (message.role == 'assistant') {
      let content = message.content;

      content = simplifyBoltActions(content);
      content = content.replace(/<div class=\"__boltThought__\">.*?<\/div>/s, '');
      content = content.replace(/<think>.*?<\/think>/s, '');

      return { ...message, content };
    }

    return message;
  });

  const provider = PROVIDER_LIST.find((p) => p.name === currentProvider) || DEFAULT_PROVIDER;
  const staticModels = LLMManager.getInstance().getStaticModelListFromProvider(provider);
  let modelDetails = staticModels.find((m) => m.name === currentModel);

  if (!modelDetails) {
    const modelsList = [
      ...(provider.staticModels || []),
      ...(await LLMManager.getInstance().getModelListFromProvider(provider, {
        apiKeys,
        providerSettings,
        serverEnv: serverEnv as any,
      })),
    ];

    if (!modelsList.length) {
      throw new Error(`No models found for provider ${provider.name}`);
    }

    modelDetails = modelsList.find((m) => m.name === currentModel);

    if (!modelDetails) {
      // Fallback to first model
      logger.warn(
        `MODEL [${currentModel}] not found in provider [${provider.name}]. Falling back to first model. ${modelsList[0].name}`,
      );
      modelDetails = modelsList[0];
    }
  }

  let slicedMessages = processedMessages;
  const { summary } = extractCurrentContext(processedMessages);
  let summaryText: string | undefined = undefined;
  let chatId: string | undefined = undefined;

  if (summary && summary.type === 'chatSummary') {
    chatId = summary.chatId;
    summaryText = `Below is the Chat Summary till now, this is chat summary before the conversation provided by the user 
you should also use this as historical message while providing the response to the user.        
${summary.summary}`;

    if (chatId) {
      let index = 0;

      for (let i = 0; i < processedMessages.length; i++) {
        if (processedMessages[i].id === chatId) {
          index = i;
          break;
        }
      }
      slicedMessages = processedMessages.slice(index + 1);
    }
  }

  logger.debug('Sliced Messages:', slicedMessages.length);

  // Enhance context analysis
  // Add these utility functions after the logger declaration
  const extractTextContent = (message: Message) => {
    const content = Array.isArray(message.content)
      ? (message.content.find((item) => item.type === 'text')?.text as string) || ''
      : message.content;
    
    return content
      .replace(/```[\s\S]*?```/g, '') // Remove code blocks
      .replace(/`[^`]*`/g, '') // Remove inline code
      .replace(/\b(https?:\/\/[^\s]+)\b/g, '') // Remove URLs
      .replace(/[^\w\s]/g, ' ') // Replace special characters with spaces
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  };
  
  const calculateContextRelevance = (messageContent: string, existingSummary?: string): number => {
    if (!existingSummary) return 0;
  
    const tokenize = (text: string) => {
      return text.toLowerCase()
        .split(/\W+/)
        .filter(word => word.length > 2); // Filter out short words
    };
  
    const messageTokens = new Set(tokenize(messageContent));
    const summaryTokens = new Set(tokenize(existingSummary));
  
    const intersection = new Set([...messageTokens].filter(x => summaryTokens.has(x)));
    const union = new Set([...messageTokens, ...summaryTokens]);
  
    return intersection.size / union.size;
  };

  // Enhance cache management
  if (contextOptimization) {
    const messageContent = slicedMessages
      .map(msg => extractTextContent(msg))
      .join(' ');
  
    // Générer les fichiers pertinents avant de créer la clé de cache
    const relevantFiles = createFilesContext({}, true, messageContent);
    const filePaths = Object.keys(relevantFiles);
  
    const cacheKey = enhancedContextCache.generateCacheKey({
      promptId,
      messageIds: slicedMessages.map(msg => msg.id || ''),
      filePaths: filePaths
    });
    
    const cachedSummary = enhancedContextCache.get(cacheKey);
    if (cachedSummary?.summary) {
      const relevance = calculateContextRelevance(messageContent, cachedSummary.summary);
      
      if (relevance > 0.7) {
        logger.info(`Using cached summary (relevance: ${relevance.toFixed(2)})`);
        return cachedSummary.summary;
      }
    }
  }

  // Mesurer le temps de génération du résumé
  const startTime = performance.now();

  // select files from the list of code file from the project that might be useful for the current request from the user
  const resp = await generateText({
    system: `
        You are a software engineer. You are working on a project. you need to summarize the work till now and provide a summary of the chat till now.

        Please only use the following format to generate the summary:
---
# Project Overview
- **Project**: {project_name} - {brief_description}
- **Current Phase**: {phase}
- **Tech Stack**: {languages}, {frameworks}, {key_dependencies}
- **Environment**: {critical_env_details}

# Conversation Context
- **Last Topic**: {main_discussion_point}
- **Key Decisions**: {important_decisions_made}
- **User Context**:
  - Technical Level: {expertise_level}
  - Preferences: {coding_style_preferences}
  - Communication: {preferred_explanation_style}

# Implementation Status
## Current State
- **Active Feature**: {feature_in_development}
- **Progress**: {what_works_and_what_doesn't}
- **Blockers**: {current_challenges}

## Code Evolution
- **Recent Changes**: {latest_modifications}
- **Working Patterns**: {successful_approaches}
- **Failed Approaches**: {attempted_solutions_that_failed}

# Requirements
- **Implemented**: {completed_features}
- **In Progress**: {current_focus}
- **Pending**: {upcoming_features}
- **Technical Constraints**: {critical_constraints}

# Critical Memory
- **Must Preserve**: {crucial_technical_context}
- **User Requirements**: {specific_user_needs}
- **Known Issues**: {documented_problems}

# Next Actions
- **Immediate**: {next_steps}
- **Open Questions**: {unresolved_issues}

---
Note:
4. Keep entries concise and focused on information needed for continuity


---
        
        RULES:
        * Only provide the whole summary of the chat till now.
        * Do not provide any new information.
        * DO not need to think too much just start writing imidiately
        * do not write any thing other that the summary with with the provided structure
        `,
    prompt: `

Here is the previous summary of the chat:
<old_summary>
${summaryText} 
</old_summary>

Below is the chat after that:
---
<new_chats>
${slicedMessages
  .map((x) => {
    return `---\n[${x.role}] ${extractTextContent(x)}\n---`;
  })
  .join('\n')}
</new_chats>
---

Please provide a summary of the chat till now including the hitorical summary of the chat.
`,
    model: provider.getModelInstance({
      model: currentModel,
      serverEnv,
      apiKeys,
      providerSettings,
    }),
  });

  const response = resp.text;
  const endTime = performance.now();
  logger.debug(`Résumé généré en ${(endTime - startTime).toFixed(2)}ms`);

  // Extraire le contenu des messages pour l'analyse de pertinence
  const messageContent = slicedMessages
    .map(msg => extractTextContent(msg))
    .join(' ');

  // Mettre en cache le résumé généré avec les fichiers pertinents
  if (contextOptimization) {
    // Les fichiers pertinents ont déjà été générés plus haut
    // Réutiliser la même clé de cache pour assurer la cohérence
    const relevantFiles = createFilesContext({}, true, messageContent);
    const filePaths = Object.keys(relevantFiles);
    const cacheKey = enhancedContextCache.generateCacheKey({
      promptId,
      messageIds: slicedMessages.map(msg => msg.id || ''),
      filePaths: filePaths
    });
    enhancedContextCache.set(cacheKey, {
      contextFiles: {},
      summary: response
    });
    logger.info('Résumé mis en cache');
  }

  if (onFinish) {
    onFinish(resp);
  }

  return response;
}
