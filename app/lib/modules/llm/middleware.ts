import type { LanguageModelV1, LanguageModelV1Middleware, LanguageModelV1StreamPart } from 'ai';
import { extractReasoningMiddleware, wrapLanguageModel } from 'ai';
import type { ModelInfo } from './types';

export function applyMiddleware(model: LanguageModelV1, modelInfo: ModelInfo): LanguageModelV1 {
  let wrappedModel = model;

  // Apply middleware based on supported features
  const middlewareStack: LanguageModelV1Middleware[] = [];

  // Add reasoning middleware if supported
  if (modelInfo.features?.reasoning) {
    middlewareStack.push(
      modelInfo.provider === 'Anthropic'
        ? createCustomReasoningMiddleware()
        : extractReasoningMiddleware({ tagName: 'think' })
    );
  }

  // Apply all middleware in the stack
  for (const middleware of middlewareStack) {
    wrappedModel = wrapLanguageModel({
      model: wrappedModel,
      middleware,
    });
  }

  return wrappedModel;
}

function createCustomReasoningMiddleware(): LanguageModelV1Middleware {
  return {
    middlewareVersion: 'v1',
    wrapGenerate: async ({ doGenerate }) => {
      try {
        const result = await doGenerate();
        return result.text ? processTextWithReasoning(result) : result;
      } catch (error) {
        console.error('Error in reasoning middleware generate:', error);
        throw error;
      }
    },
    wrapStream: async ({ doStream }) => {
      const stream = await doStream();
      return createProcessedStream(stream);
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
    'deepseek-Reasoner',
    'deepseek-v2',
    'deepseek-r1',
  ];

  // Check if the model name contains any of the reasoning model identifiers
  return reasoningModels.some((reasoningModel) => modelName.toLowerCase().includes(reasoningModel.toLowerCase()));
}

function processTextWithReasoning(result: any) {
  const processed = processReasoningInText(result.text);
  return {
    ...result,
    text: processed.text,
    reasoning: processed.reasoning || result.reasoning,
  };
}

function createProcessedStream(stream: any) {
  return {
    ...stream,
    [Symbol.asyncIterator]() {
      const originalIterator = stream[Symbol.asyncIterator]();
      return {
        async next() {
          try {
            const { done, value } = await originalIterator.next();
            if (done || !value) return { done, value };
            
            return {
              done,
              value: ('text' in value && typeof value.text === 'string')
                ? processStreamChunk(value)
                : value
            };
          } catch (error) {
            console.error('Error processing stream chunk:', error);
            throw error;
          }
        }
      };
    }
  };
}

function processStreamChunk(value: any): LanguageModelV1StreamPart {
  const processed = processReasoningInText(value.text);
  return {
    ...value,
    text: processed.text,
    reasoning: processed.reasoning || value.reasoning,
  } as LanguageModelV1StreamPart;
}
