import type { LanguageModelV1, LanguageModelV1Middleware, LanguageModelV1StreamPart } from 'ai';
import { extractReasoningMiddleware, wrapLanguageModel } from 'ai';
import type { ModelInfo } from './types';

/**
 * Applies middleware to a language model based on its features
 *
 * @param model The language model to wrap
 * @param modelInfo The model information including supported features
 * @returns The wrapped language model with applied middleware
 */
export function applyMiddleware(model: LanguageModelV1, modelInfo: ModelInfo): LanguageModelV1 {
  let wrappedModel = model;

  // Apply reasoning middleware if model supports reasoning
  if (modelInfo.features?.reasoning) {
    // Special handling for Anthropic models which need more robust tag handling
    if (modelInfo.provider === 'Anthropic') {
      wrappedModel = wrapLanguageModel({
        model: wrappedModel,
        middleware: createCustomReasoningMiddleware(),
      });
    } else {
      // Standard reasoning middleware for other providers
      wrappedModel = wrapLanguageModel({
        model: wrappedModel,
        middleware: extractReasoningMiddleware({ tagName: 'think' }),
      });
    }
  }

  /*
   * Add more middleware for other features as needed
   * For example, for image generation, sources, etc.
   */

  return wrappedModel;
}

/**
 * Create a custom reasoning middleware that safely handles Anthropic's XML output
 * This creates a more robust extraction that can handle Claude's sometimes inconsistent XML formatting
 */
function createCustomReasoningMiddleware(): LanguageModelV1Middleware {
  return {
    middlewareVersion: 'v1',
    wrapGenerate: async ({ doGenerate }) => {
      const result = await doGenerate();

      if (result.text) {
        const processed = processReasoningInText(result.text);
        return {
          ...result,
          text: processed.text,
          reasoning: processed.reasoning || result.reasoning,
        };
      }

      return result;
    },
    wrapStream: async ({ doStream }) => {
      const stream = await doStream();

      // Return a new stream with the same interface but with processed reasoning
      return {
        ...stream,

        // Must keep the original methods and properties
        [Symbol.asyncIterator]() {
          // Cast to any to avoid type compatibility issues
          const originalIterator = (stream as any)[Symbol.asyncIterator]();

          return {
            async next() {
              const { done, value } = await originalIterator.next();

              if (done || !value) {
                return { done, value };
              }

              // Process reasoning in text chunks
              if ('text' in value && typeof value.text === 'string') {
                const processed = processReasoningInText(value.text);
                return {
                  done,
                  value: {
                    ...value,
                    text: processed.text,
                    reasoning: processed.reasoning || (value as any).reasoning,
                  } as LanguageModelV1StreamPart,
                };
              }

              return { done, value };
            },
          };
        },
      };
    },
  };
}

/**
 * Process reasoning in text by extracting think tags
 */
function processReasoningInText(text: string): { text: string; reasoning?: string } {
  if (!text) {
    return { text };
  }

  try {
    let responseText = text;
    let reasoning = '';

    // Find think tags in various formats
    const thinkRegexes = [
      /<think>([\s\S]*?)<\/think>/g, // Standard <think> tags
      /&lt;think&gt;([\s\S]*?)&lt;\/think&gt;/g, // HTML escaped tags
      /<div class="?__boltThought__"?>([\s\S]*?)<\/div>/g, // Already processed think content
    ];

    // Extract reasoning from all potential formats
    for (const regex of thinkRegexes) {
      const matches = Array.from(responseText.matchAll(regex));

      if (matches.length > 0) {
        // Collect all reasoning content
        reasoning = matches.map((match) => match[1].trim()).join('\n\n');

        // Remove the thinking sections from the main response
        responseText = responseText.replace(regex, '').trim();
      }
    }

    // Create a cleaned version of the response
    return {
      text: responseText,
      reasoning: reasoning || undefined,
    };
  } catch (error) {
    console.error('Error in custom reasoning middleware:', error);
    return { text }; // Return original text on error
  }
}

/**
 * Determine if a model name is known to support reasoning
 * This helps identify models that support reasoning across different providers
 *
 * @param modelName The name of the model to check
 * @returns true if the model supports reasoning
 */
export function modelSupportsReasoning(modelName: string): boolean {
  // Lists of models known to support reasoning
  const reasoningModels = [
    // Anthropic
    'claude-3-7-sonnet',
    'claude-3-7-haiku',
    'claude-3-7-opus',

    // OpenAI
    'gpt-4o-2024',
    'gpt-4-turbo',
    'gpt-4-1106-preview',
    'gpt-4-0125-preview',

    // Amazon Bedrock Claude models
    'anthropic.claude-3-7-sonnet',
    'anthropic.claude-3-5-sonnet',

    // Mistral
    'mistral-large-2',
    'mistral-large',

    // DeepSeek
    'deepseek-coder',
    'deepseek-v2',
    'deepseek-r1',
  ];

  return reasoningModels.some((reasoningModel) => 
    modelName.toLowerCase().includes(reasoningModel.toLowerCase())
  );
}
