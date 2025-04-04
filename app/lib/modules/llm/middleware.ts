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

  // Apply image generation middleware for models that support it
  if (modelInfo.features?.imageGeneration) {
    wrappedModel = wrapLanguageModel({
      model: wrappedModel,
      middleware: createImageGenerationMiddleware(),
    });
  }

  // Apply structured output middleware for models that support it
  if (modelInfo.features?.structuredOutput) {
    wrappedModel = wrapLanguageModel({
      model: wrappedModel,
      middleware: createStructuredOutputMiddleware(),
    });
  }

  /*
   * Add more middleware for other features as needed
   * For example, for image generation, sources, etc.
   */

  return wrappedModel;
}

/**
 * Extract reasoning from text if it includes <think> tags for models that support reasoning
 * @param text The text to extract reasoning from
 * @returns The processed text and extracted reasoning
 */
function processReasoningInText(text: string): { text: string; reasoning?: string } {
  // Try to find reasoning blocks
  const reasoningPatterns = [
    /<think>([\s\S]*?)<\/think>/,
    /<reasoning>([\s\S]*?)<\/reasoning>/,
    /<thinking>([\s\S]*?)<\/thinking>/,
  ];

  let reasoning: string | undefined;
  let processedText = text;

  for (const pattern of reasoningPatterns) {
    const match = text.match(pattern);

    if (match) {
      reasoning = match[1].trim();

      // Remove the reasoning block from the text
      processedText = text.replace(pattern, '').trim();
      break;
    }
  }

  return { text: processedText, reasoning };
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
 * Create a middleware to ensure DeepSeek models produce complete code blocks
 * Addresses common issues with incomplete code generation in DeepSeek models
 */
function createDeepSeekCodeCompletionMiddleware(): LanguageModelV1Middleware {
  return {
    middlewareVersion: 'v1',
    wrapStream: async ({ doStream }) => {
      const stream = await doStream();
      let fullOutput = '';
      let lastCodeBlock: { language: string; content: string; start: number; end: number; complete: boolean } | null =
        null;

      return {
        ...stream,
        [Symbol.asyncIterator]() {
          const originalIterator = (stream as any)[Symbol.asyncIterator]();

          return {
            async next() {
              const { done, value } = await originalIterator.next();

              if (done || !value) {
                // Before finishing, check if there was an incomplete code block
                if (lastCodeBlock && !lastCodeBlock.complete && 'text' in value) {
                  // Add closing backticks if missing
                  const fixedText = fullOutput + '```';
                  return {
                    done,
                    value: {
                      ...value,
                      text: fixedText,
                    } as LanguageModelV1StreamPart,
                  };
                }

                return { done, value };
              }

              // Track and process text chunks
              if ('text' in value && typeof value.text === 'string') {
                fullOutput += value.text;

                // Check for code blocks
                const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
                let match;

                // Reset the regex each time to scan the entire accumulated output
                codeBlockRegex.lastIndex = 0;

                while ((match = codeBlockRegex.exec(fullOutput)) !== null) {
                  const language = match[1] || '';
                  const content = match[2];
                  const startIdx = match.index;
                  const endIdx = startIdx + match[0].length;

                  // Mark this code block as complete
                  lastCodeBlock = {
                    language,
                    content,
                    start: startIdx,
                    end: endIdx,
                    complete: true,
                  };
                }

                // Check for potentially incomplete code blocks (starting backticks but no ending ones)
                const incompleteBlockRegex = /```(\w+)?\n([\s\S]*)$/;
                const incompleteMatch = fullOutput.match(incompleteBlockRegex);

                if (incompleteMatch && !fullOutput.endsWith('```')) {
                  const language = incompleteMatch[1] || '';
                  const content = incompleteMatch[2] || '';
                  const startIdx = incompleteMatch.index!;

                  lastCodeBlock = {
                    language,
                    content,
                    start: startIdx,
                    end: fullOutput.length,
                    complete: false,
                  };
                }
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
 * Create middleware for handling image generation capabilities
 * This helps with properly formatting image requests and responses
 */
function createImageGenerationMiddleware(): LanguageModelV1Middleware {
  return {
    middlewareVersion: 'v1',
    wrapGenerate: async ({ doGenerate }) => {
      const result = await doGenerate();
      return result;
    },
    wrapStream: async ({ doStream }) => {
      const stream = await doStream();
      return stream;
    },
  };
}

/**
 * Create middleware for handling structured output capabilities
 * This improves JSON generation and helps catch/fix common structured output errors
 */
function createStructuredOutputMiddleware(): LanguageModelV1Middleware {
  return {
    middlewareVersion: 'v1',
    wrapGenerate: async ({ doGenerate }) => {
      const result = await doGenerate();
      return result;
    },
    wrapStream: async ({ doStream }) => {
      const stream = await doStream();
      let jsonOutput = '';
      let inJsonBlock = false;
      let jsonEnded = false;
      let bracketCount = 0;

      return {
        ...stream,
        [Symbol.asyncIterator]() {
          const originalIterator = (stream as any)[Symbol.asyncIterator]();

          return {
            async next() {
              const { done, value } = await originalIterator.next();

              if (done || !value) {
                /*
                 * If we were in the middle of a JSON block and it wasn't properly closed,
                 * try to fix it by adding missing closing brackets/braces
                 */
                if (inJsonBlock && !jsonEnded && 'text' in value) {
                  let fixedJson = jsonOutput;

                  // Add missing closing brackets/braces
                  while (bracketCount > 0) {
                    fixedJson += '}';
                    bracketCount--;
                  }

                  return {
                    done,
                    value: {
                      ...value,
                      text: fixedJson,
                    } as LanguageModelV1StreamPart,
                  };
                }

                return { done, value };
              }

              // Process text chunks to improve JSON handling
              if ('text' in value && typeof value.text === 'string') {
                const text = value.text;

                /* Check for JSON code block start */
                if (!inJsonBlock && text.includes('```json')) {
                  inJsonBlock = true;
                  jsonOutput = text.substring(text.indexOf('```json') + 7);

                  return { done, value };
                }

                // Check for JSON code block end
                if (inJsonBlock && text.includes('```') && !jsonEnded) {
                  inJsonBlock = false;
                  jsonEnded = true;
                  jsonOutput += text.substring(0, text.indexOf('```'));

                  // Try to parse and format the JSON
                  try {
                    const parsed = JSON.parse(jsonOutput);
                    const formatted = JSON.stringify(parsed, null, 2);

                    return {
                      done,
                      value: {
                        ...value,
                        text: formatted,
                      } as LanguageModelV1StreamPart,
                    };
                  } catch {
                    // If parsing fails, return the original

                    return { done, value };
                  }
                }

                // Track opening and closing braces to help with unclosed JSON
                if (inJsonBlock) {
                  for (let i = 0; i < text.length; i++) {
                    if (text[i] === '{') {
                      bracketCount++;
                    }

                    if (text[i] === '}') {
                      bracketCount--;
                    }
                  }

                  jsonOutput += text;
                }
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
 * Create middleware based on model capabilities
 * @param model The model name to create middleware for
 * @returns Middleware array appropriate for the model's capabilities
 */
export function createMiddlewareForModel(model: string): LanguageModelV1Middleware[] {
  const middleware: LanguageModelV1Middleware[] = [];

  // Add reasoning middleware for models that support it
  if (modelSupportsReasoning(model)) {
    middleware.push(createCustomReasoningMiddleware());
  }

  // Add DeepSeek code completion middleware for DeepSeek models
  if (isDeepSeekModel(model)) {
    middleware.push(createDeepSeekCodeCompletionMiddleware());
  }

  return middleware;
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

  // Check if the model name contains any of the reasoning model identifiers
  return reasoningModels.some((reasoningModel) => modelName.toLowerCase().includes(reasoningModel.toLowerCase()));
}

/**
 * Determine if a model is from DeepSeek
 * Used to apply specialized middleware for DeepSeek models
 *
 * @param modelName The name of the model to check
 * @returns true if the model is a DeepSeek model
 */
export function isDeepSeekModel(modelName: string): boolean {
  // List of DeepSeek model identifiers
  const deepseekModels = [
    'deepseek-coder',
    'deepseek-chat',
    'deepseek-reasoner',
    'deepseek-v2',
    'deepseek-r1',
    'deepseek/',
    'deepseek-ai/',
  ];

  // Check if the model name contains any of the DeepSeek model identifiers
  return deepseekModels.some((deepseekModel) => modelName.toLowerCase().includes(deepseekModel.toLowerCase()));
}

/**
 * Determine if a model name is known to support image generation
 * @param modelName The name of the model to check
 * @returns true if the model supports image generation
 */
export function modelSupportsImageGeneration(modelName: string): boolean {
  // Lists of models known to support image generation
  const imageModels = [
    // OpenAI
    'gpt-4o',
    'gpt-4-vision',
    'gpt-4-turbo',

    // Anthropic
    'claude-3-opus',
    'claude-3-sonnet',
    'claude-3-haiku',
    'claude-3-5-sonnet',
    'claude-3-7-sonnet',

    // Gemini
    'gemini-1.5-pro',
    'gemini-1.5-flash',
    'gemini-2.5-pro',
  ];

  // Check if the model name contains any of the image generation model identifiers
  return imageModels.some((imageModel) => modelName.toLowerCase().includes(imageModel.toLowerCase()));
}

/**
 * Determine if a model name is known to support structured output
 * @param modelName The name of the model to check
 * @returns true if the model supports structured output
 */
export function modelSupportsStructuredOutput(modelName: string): boolean {
  // Most modern models support structured output well
  const structuredOutputModels = [
    // OpenAI
    'gpt-4',
    'gpt-4o',
    'gpt-4-turbo',
    'gpt-3.5-turbo',

    // Anthropic
    'claude-3',

    // Mistral
    'mistral-large',
    'mistral-medium',

    // Google
    'gemini',

    // Others
    'command-r',
    'deepseek',
  ];

  // Check if the model name contains any of the structured output model identifiers
  return structuredOutputModels.some((model) => modelName.toLowerCase().includes(model.toLowerCase()));
}
