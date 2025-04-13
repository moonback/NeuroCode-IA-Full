import { convertToCoreMessages, streamText as _streamText, type Message } from 'ai';
import { MAX_TOKENS, type FileMap } from './constants';
import { getSystemPrompt } from '~/lib/common/prompts/prompts';
import { DEFAULT_MODEL, DEFAULT_PROVIDER, MODIFICATIONS_TAG_NAME, PROVIDER_LIST, WORK_DIR } from '~/utils/constants';
import type { IProviderSetting } from '~/types/model';
import { PromptLibrary } from '~/lib/common/prompt-library';
import { allowedHTMLElements } from '~/utils/markdown';
import { LLMManager } from '~/lib/modules/llm/manager';
import { createScopedLogger } from '~/utils/logger';
import { createFilesContext, extractPropertiesFromMessage } from './utils';
import { getFilePaths } from './select-context';
import { estimateMessagesTokens, estimateTokens } from './token-counter';

export type Messages = Message[];
// Batch size for chunking responses - helps to smooth out streaming
const STREAM_BATCH_INTERVAL = 25; // milliseconds (further reduced from 40ms)
const STREAM_BATCH_SIZE = 250; // characters (further increased from 200)
export interface StreamingOptions extends Omit<Parameters<typeof _streamText>[0], 'model'> {
  supabaseConnection?: {
    isConnected: boolean;
    hasSelectedProject: boolean;
    credentials?: {
      anonKey?: string;
      supabaseUrl?: string;
    };
  };
  onFinish?: (props: {
    text: string;
    finishReason?: string;
    usage?: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
    reasoning?: string;
  }) => void | Promise<void>;

  // New option to control response smoothing
  smoothStreaming?: boolean;
}

// Function to sanitize reasoning output to prevent XML/tag related errors
export function sanitizeReasoningOutput(content: string): string {
  try {
    // Remove or escape problematic tags that might cause rendering issues
    let sanitized = content;

    // Convert actual XML tags to safe HTML entities
    sanitized = sanitized.replace(/<(\/?)think>/g, '&lt;$1think&gt;');

    // Ensure any incomplete tags are properly closed or removed
    const openTags = (sanitized.match(/<[^/>][^>]*>/g) || []).length;
    const closeTags = (sanitized.match(/<\/[^>]+>/g) || []).length;

    if (openTags > closeTags) {
      // We have unclosed tags - simplest approach is to wrap in a safe format
      sanitized = `<div class="__boltThought__">${sanitized}</div>`;
    }

    return sanitized;
  } catch (error) {
    logger.error('Error sanitizing reasoning output:', error);

    // Return a safe version if sanitization fails
    return content;
  }
}
/**
 * Optimize context buffer when it's too large
 * This reduces the token count for very large context windows
 */
function optimizeContextBuffer(context: string, maxLength: number = 50000): string {
  // Ensure modelDetails is defined before using it
  const modelDetails = {
    maxTokenAllowed: MAX_TOKENS // or any other appropriate value
  };

  // Ajouter une détection de langage pour une meilleure conservation du contexte
  const languagePriorities: Record<string, number> = {
    typescript: 1.2,
    javascript: 1.1,
    python: 1.0,
    html: 0.9
  };

  // Nouvelle méthode de découpage avec fenêtre glissante
  const slidingWindowChunk = (text: string, windowSize: number) => {
    const chunks = [];
    for (let i = 0; i < text.length; i += windowSize / 2) { // Chevauchement de 50%
      chunks.push(text.substring(i, i + windowSize));
    }
    return chunks;
  };

  // Optimisation dynamique basée sur le modèle
  const dynamicMaxLength = Math.min(maxLength, modelDetails.maxTokenAllowed * 3.5);

  if (context.length <= dynamicMaxLength) return context;

  // Priorisation des blocs de code avec score de pertinence
  const codeBlocks = [...context.matchAll(/```(\w+)?\n([\s\S]*?)```/g)]
    .map(match => {
      const lang = match[1] || 'unknown';
      return {
        lang,
        content: match[2],
        score: languagePriorities[lang] || 1.0
      };
    })
    .sort((a, b) => b.score - a.score);

  // Sélection adaptative des blocs
  const maxCodeBlocks = Math.floor(dynamicMaxLength / 2000);
  const selectedCode = codeBlocks
    .slice(0, maxCodeBlocks)
    .map(b => `\`\`\`${b.lang}\n${b.content}\n\`\`\``)
    .join('\n\n');

  // Découpage intelligent du texte restant
  const remainingText = context.replace(/```[\s\S]*?```/g, '');
  const semanticChunks = slidingWindowChunk(remainingText, dynamicMaxLength / 4)
    .filter(chunk => {
      // Conservation des phrases complètes
      const sentenceEnd = /[.!?]\s+/;
      return sentenceEnd.test(chunk.slice(-10));
    });

  return [
    selectedCode,
    ...semanticChunks.slice(0, 3),
    '\n\n...[Context optimized with semantic windowing]...'
  ].join('\n\n');
}

const logger = createScopedLogger('stream-text');
/**
 * Truncate messages to fit within token limit
 * Prioritizes keeping the most recent messages
 */
function truncateMessagesToFitTokenLimit<T extends { role: string; content: any }>(
  messages: T[],
  systemPromptTokens: number,
  maxContextTokens: number,
  reservedCompletionTokens: number = 8000,
): T[] {
  // Paramètres optimisés pour les petits modèles
  const minSystemTokens = Math.min(500, maxContextTokens * 0.1); // Réduit pour les petits modèles
  const minUserTokens = 50; // Réduit pour optimiser
  const minAssistantTokens = 75; // Réduit pour optimiser
  const maxSystemTokens = Math.min(systemPromptTokens, maxContextTokens * 0.3); // Limite à 30% du contexte
  const availableTokens = maxContextTokens - maxSystemTokens - reservedCompletionTokens;

  if (availableTokens <= 0) {
    logger.warn(`Optimisation nécessaire. Prompt système (${systemPromptTokens} tokens) ajusté à ${maxSystemTokens} tokens`);
    // Garder au moins le dernier message avec un contexte minimal
    return messages.length > 0 ? [messages[messages.length - 1]] : [];
  }

  let currentMessages = [...messages];
  let currentTokenCount = estimateMessagesTokens(currentMessages as unknown as Message[]);

  if (currentTokenCount <= availableTokens) {
    return currentMessages;
  }

  logger.warn(`Optimisation nécessaire: ${currentTokenCount} tokens > ${availableTokens} disponibles`);

  // Séparation et priorisation des messages
  const systemMessages = currentMessages.filter(msg => msg.role === 'system');
  const userAssistantPairs = [];
  const otherMessages = [];

  // Création de paires user-assistant pour préserver le contexte conversationnel
  for (let i = 0; i < currentMessages.length; i++) {
    if (currentMessages[i].role === 'user' && i + 1 < currentMessages.length && currentMessages[i + 1].role === 'assistant') {
      userAssistantPairs.push([currentMessages[i], currentMessages[i + 1]]);
      i++; // Skip the assistant message as it's already paired
    } else if (currentMessages[i].role !== 'system') {
      otherMessages.push(currentMessages[i]);
    }
  }

  // Fonction optimisée pour tronquer le contenu avec préservation du contexte
  const truncateContent = (content: string, maxTokens: number, minTokens: number): string => {
    const currentTokens = estimateTokens(content);
    if (currentTokens <= maxTokens) return content;

    // Extraction des sections importantes
    const codeBlocks = content.match(/```[\s\S]*?```/g) || [];
    const importantSections = content.match(/\b(function|class|const|let|var|import|export)\b[^;{]*[{;]/g) || [];
    
    // Calcul des tokens pour les sections importantes
    const importantContent = [...codeBlocks, ...importantSections].join('\n');
    const importantTokens = estimateTokens(importantContent);
    
    // Si le contenu important est déjà trop grand, le compresser davantage
    if (importantTokens > maxTokens) {
      const ratio = maxTokens / importantTokens;
      const numToKeep = Math.floor((codeBlocks.length + importantSections.length) * ratio);
      const selectedContent = [...codeBlocks, ...importantSections]
        .slice(0, numToKeep)
        .join('\n');
      return `${selectedContent}\n[...contenu compressé...]`;
    }
    
    // Sinon, garder le contenu important et ajouter du contexte si possible
    const remainingTokens = maxTokens - importantTokens;
    const contextLength = Math.floor(remainingTokens * 8); // Approximation caractères/tokens
    
    return `${content.substring(0, contextLength)}\n${importantContent}\n[...reste du contenu omis...]`;
  };

  // Optimisation progressive
  while (currentTokenCount > availableTokens) {
    if (otherMessages.length > 0) {
      otherMessages.pop();
    } else if (userAssistantPairs.length > 1) {
      // Garder au moins une paire de messages
      userAssistantPairs.shift();
    } else {
      // Tronquer les messages restants si nécessaire
      const remainingPair = userAssistantPairs[0];
      if (remainingPair) {
        const [userMsg, assistantMsg] = remainingPair;
        const userContent = typeof userMsg.content === 'string' ? userMsg.content : JSON.stringify(userMsg.content);
        const assistantContent = typeof assistantMsg.content === 'string' ? assistantMsg.content : JSON.stringify(assistantMsg.content);

        userMsg.content = truncateContent(userContent, availableTokens * 0.4, minUserTokens);
        assistantMsg.content = truncateContent(assistantContent, availableTokens * 0.6, minAssistantTokens);
      }
    }

    // Reconstruire et réévaluer
    currentMessages = [
      ...systemMessages,
      ...otherMessages,
      ...userAssistantPairs.flat()
    ];
    currentTokenCount = estimateMessagesTokens(currentMessages as unknown as Message[]);
  }

  logger.info(`Optimisation terminée: ${currentTokenCount} tokens utilisés`);
  return currentMessages;
}

export async function streamText(props: {
  messages: Omit<Message, 'id'>[];
  env?: Env;
  options?: StreamingOptions;
  apiKeys?: Record<string, string>;
  files?: FileMap;
  providerSettings?: Record<string, IProviderSetting>;
  promptId?: string;
  contextOptimization?: boolean;
  contextFiles?: FileMap;
  summary?: string;
  messageSliceId?: number;
  customInstructions?: string; // Add parameter for custom instructions
}) {
  const {
    messages,
    env: serverEnv,
    options,
    apiKeys,
    files,
    providerSettings,
    promptId,
    contextOptimization,
    contextFiles,
    summary,
    customInstructions, // Extract custom instructions
  } = props;
  let currentModel = DEFAULT_MODEL;
  let currentProvider = DEFAULT_PROVIDER.name;
  let processedMessages = messages.map((message) => {
    if (message.role === 'user') {
      const { model, provider, content } = extractPropertiesFromMessage(message);
      currentModel = model;
      currentProvider = provider;

      return { ...message, content };
    } else if (message.role == 'assistant') {
      let content = message.content;
      content = content.replace(/<div class=\\"__boltThought__\\">.*?<\/div>/s, '');
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

  const dynamicMaxTokens = modelDetails && modelDetails.maxTokenAllowed ? modelDetails.maxTokenAllowed : MAX_TOKENS;

  // Get system prompt with optimized token management
  let systemPrompt = PromptLibrary.getPropmtFromLibrary(promptId || 'optimized', {
    cwd: WORK_DIR,
    allowedHtmlElements: allowedHTMLElements,
    modificationTagName: MODIFICATIONS_TAG_NAME,
    customInstructions,
    supabase: {
      isConnected: options?.supabaseConnection?.isConnected || false,
      hasSelectedProject: options?.supabaseConnection?.hasSelectedProject || false,
      credentials: options?.supabaseConnection?.credentials || undefined,
    },
  }) ?? getSystemPrompt();

  // Optimize system prompt if it's too large
  const systemPromptTokens = estimateTokens(systemPrompt);
  if (systemPromptTokens > 6000) { // Set a reasonable threshold
    logger.warn(`System prompt is too large (${systemPromptTokens} tokens). Optimizing...`);
    systemPrompt = optimizeContextBuffer(systemPrompt, 30000); // More aggressive optimization
  }
// Use reasoning prompt for models that support reasoning when no specific prompt is requested
if (!promptId && modelDetails?.features?.reasoning) {
  systemPrompt =
    PromptLibrary.getPropmtFromLibrary('reasoning', {
      cwd: WORK_DIR,
      customInstructions,
      allowedHtmlElements: allowedHTMLElements,
      modificationTagName: MODIFICATIONS_TAG_NAME,
      supabase: {
        isConnected: options?.supabaseConnection?.isConnected || false,
        hasSelectedProject: options?.supabaseConnection?.hasSelectedProject || false,
        credentials: options?.supabaseConnection?.credentials || undefined,
      },
    }) ?? systemPrompt; // Fall back to the existing system prompt if reasoning prompt fails
}


  if (files && contextFiles && contextOptimization) {
    // Optimization: Only create context if there are files
    if (Object.keys(contextFiles).length > 0) {
      const codeContext = createFilesContext(contextFiles, true);
      const filePaths = getFilePaths(files);

 // Optimize context buffer if it's too large
 const optimizedCodeContext = optimizeContextBuffer(codeContext);

 systemPrompt = `${systemPrompt}Below are all the files present in the project:
---
${filePaths.join('\n')}
---

Below is the artifact containing the context loaded into context buffer for you to have knowledge of and might need changes to fullfill current user request.
CONTEXT BUFFER:
---
${optimizedCodeContext}
---
`;
}
    if (summary) {
        // Optimize summary if it's too long
        const optimizedSummary =
        summary.length > 10000
          ? summary.substring(0, 5000) + '\n[Summary truncated...]\n' + summary.substring(summary.length - 5000)
          : summary;
      systemPrompt = `${systemPrompt}
below is the chat history till now
CHAT SUMMARY:
---
${optimizedSummary}
---
`;

      if (props.messageSliceId) {
        processedMessages = processedMessages.slice(props.messageSliceId);
      } else {
        const lastMessage = processedMessages.pop();

        if (lastMessage) {
          processedMessages = [lastMessage];
        }
      }
    }
  }

  logger.info(`Sending llm call to ${provider.name} with model ${modelDetails.name}`);

  // console.log(systemPrompt,processedMessages);

//   return await _streamText({
//     model: provider.getModelInstance({
//       model: modelDetails.name,
//       serverEnv,
//       apiKeys,
//       providerSettings,
//     }),
//     system: systemPrompt,
//     maxTokens: dynamicMaxTokens,
//     messages: convertToCoreMessages(processedMessages as any),
//     ...options,
//   });
// }
 // Store original messages for reference
 const originalMessages = [...messages];
 const hasMultimodalContent = originalMessages.some((msg) => Array.isArray(msg.content));
 // Create enhanced options with streaming improvements
 const enhancedOptions = {
  ...options,

  // Always enable smooth streaming by default with optimized parameters
  streamingGranularity: 'character',
  streamBatchSize: STREAM_BATCH_SIZE,
  streamBatchInterval: STREAM_BATCH_INTERVAL,

  // Optimize real-time processing
  buffering: false,
};

 try {
   if (hasMultimodalContent) {
     /*
      * For multimodal content, we need to preserve the original array structure
      * but make sure the roles are valid and content items are properly formatted
      */
     const multimodalMessages = originalMessages.map((msg) => ({
       role: msg.role === 'system' || msg.role === 'user' || msg.role === 'assistant' ? msg.role : 'user',
       content: Array.isArray(msg.content)
         ? msg.content.map((item) => {
             // Ensure each content item has the correct format
             if (typeof item === 'string') {
               return { type: 'text', text: item };
             }

             if (item && typeof item === 'object') {
               if (item.type === 'image' && item.image) {
                 return { type: 'image', image: item.image };
               }

               if (item.type === 'text') {
                 return { type: 'text', text: item.text || '' };
               }
             }

             // Default fallback for unknown formats
             return { type: 'text', text: String(item || '') };
           })
         : [{ type: 'text', text: typeof msg.content === 'string' ? msg.content : String(msg.content || '') }],
     }));
// Get model with middleware applied
const llmManager = LLMManager.getInstance();
const model = llmManager.getModelInstance({
  model: modelDetails.name,
  provider: provider.name,
  serverEnv,
  apiKeys,
  providerSettings,
});
 // Estimate tokens and truncate if needed to prevent context length errors
 const systemPromptTokens = estimateTokens(systemPrompt);
 const maxContextTokens = modelDetails.maxTokenAllowed || MAX_TOKENS;

 // Truncate messages if they exceed token limits
 const truncatedMessages = truncateMessagesToFitTokenLimit(
   multimodalMessages,
   systemPromptTokens,
   maxContextTokens,
 );

 logger.info(`Utilisation de ${truncatedMessages.length} messages sur ${multimodalMessages.length} après vérification des tokens`);
     return await _streamText({
      model,

       system: systemPrompt,
       maxTokens: dynamicMaxTokens,
       messages: truncatedMessages as any,
       ...enhancedOptions,
      });
   } else {
     // For non-multimodal content, we use the standard approach
     const normalizedTextMessages = processedMessages.map((msg) => ({
       role: msg.role === 'system' || msg.role === 'user' || msg.role === 'assistant' ? msg.role : 'user',
       content: typeof msg.content === 'string' ? msg.content : String(msg.content || ''),
     }));
// Get model with middleware applied
const llmManager = LLMManager.getInstance();
const model = llmManager.getModelInstance({
  model: modelDetails.name,
  provider: provider.name,
  serverEnv,
  apiKeys,
  providerSettings,
});
 // Estimate tokens and truncate if needed to prevent context length errors
 const systemPromptTokens = estimateTokens(systemPrompt);
 const maxContextTokens = modelDetails.maxTokenAllowed || MAX_TOKENS;

 // Truncate messages if they exceed token limits
 const truncatedMessages = truncateMessagesToFitTokenLimit(
   normalizedTextMessages,
   systemPromptTokens,
   maxContextTokens,
 );

 logger.info(
   `Utilisation de ${truncatedMessages.length} messages sur ${normalizedTextMessages.length} après vérification des tokens`,
 );

     return await _streamText({
      model,

       system: systemPrompt,
       maxTokens: dynamicMaxTokens,
       messages: convertToCoreMessages(truncatedMessages),
       ...enhancedOptions,
      });
   }
 } catch (error: any) {
   // Special handling for format errors
   if (error.message && error.message.includes('les messages doivent être un tableau de CoreMessage ou UIMessage')) {
     logger.warn('Erreur de format de message détectée, tentative de récupération avec un formatage explicite...');

     // Create properly formatted messages for all cases as a last resort
     const fallbackMessages = processedMessages.map((msg) => {
       // Determine text content with careful type handling
       let textContent = '';

       if (typeof msg.content === 'string') {
         textContent = msg.content;
       } else if (Array.isArray(msg.content)) {
         // Handle array content safely
         const contentArray = msg.content as any[];
         textContent = contentArray
           .map((contentItem) =>
             typeof contentItem === 'string'
               ? contentItem
               : contentItem?.text || contentItem?.image || String(contentItem || ''),
           )
           .join(' ');
       } else {
         textContent = String(msg.content || '');
       }

       return {
         role: msg.role === 'system' || msg.role === 'user' || msg.role === 'assistant' ? msg.role : 'user',
         content: [
           {
             type: 'text',
             text: textContent,
           },
         ],
       };
     });
     const fallbackModel = LLMManager.getInstance().getModelInstance({
      model: modelDetails.name,
      provider: provider.name,
      apiKeys,
      providerSettings,
      serverEnv: serverEnv as any,
    });
     // Try one more time with the fallback format
     return await _streamText({
      model: fallbackModel,

       system: systemPrompt,
       maxTokens: dynamicMaxTokens,
       messages: fallbackMessages as any,
       ...enhancedOptions,
      });
   }

   // If it's not a format error, re-throw the original error
   throw error;
 }
}
