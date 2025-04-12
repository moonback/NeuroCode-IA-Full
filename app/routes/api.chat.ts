import { type ActionFunctionArgs } from '@remix-run/cloudflare';
import { createDataStream, generateId } from 'ai';
import { MAX_RESPONSE_SEGMENTS, MAX_TOKENS, type FileMap } from '~/lib/.server/llm/constants';
import { CONTINUE_PROMPT } from '~/lib/common/prompts/prompts';
import {
  streamText,
  type Messages,
  type StreamingOptions,
  sanitizeReasoningOutput,
} from '~/lib/.server/llm/stream-text';
import SwitchableStream from '~/lib/.server/llm/switchable-stream';
import type { IProviderSetting } from '~/types/model';
import { createScopedLogger } from '~/utils/logger';
import { getFilePaths, selectContext } from '~/lib/.server/llm/select-context';
import type { ContextAnnotation, ProgressAnnotation } from '~/types/context';
import { WORK_DIR } from '~/utils/constants';
import { createSummary } from '~/lib/.server/llm/create-summary';
import { extractPropertiesFromMessage } from '~/lib/.server/llm/utils';

export async function action(args: ActionFunctionArgs) {
  return chatAction(args);
}

const logger = createScopedLogger('api.chat');

function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {};

  const items = cookieHeader.split(';').map((cookie) => cookie.trim());

  items.forEach((item) => {
    const [name, ...rest] = item.split('=');

    if (name && rest) {
      const decodedName = decodeURIComponent(name.trim());
      const decodedValue = decodeURIComponent(rest.join('=').trim());
      cookies[decodedName] = decodedValue;
    }
  });

  return cookies;
}

async function chatAction({ context, request }: ActionFunctionArgs) {
  const { 
    messages, 
    files, 
    promptId, 
    contextOptimization, 
    supabase,
    customInstructions, // Add this to extract from request
  } = await request.json<{
    messages: Messages;
    files: any;
    promptId?: string;
    contextOptimization: boolean;
    supabase?: {
      isConnected: boolean;
      hasSelectedProject: boolean;
      credentials?: {
        anonKey?: string;
        supabaseUrl?: string;
      };
    };
    customInstructions?: string; // Add type for custom instructions
  }>();

  const cookieHeader = request.headers.get('Cookie');
  const apiKeys = JSON.parse(parseCookies(cookieHeader || '').apiKeys || '{}');
  const providerSettings: Record<string, IProviderSetting> = JSON.parse(
    parseCookies(cookieHeader || '').providers || '{}',
  );

  const stream = new SwitchableStream();

  const cumulativeUsage = {
    completionTokens: 0,
    promptTokens: 0,
    totalTokens: 0,
  };
  const encoder: TextEncoder = new TextEncoder();
  let progressCounter: number = 1;

  try {
    const totalMessageContent = messages.reduce((acc, message) => acc + message.content, '');
    logger.debug(`Longueur totale du message : ${totalMessageContent.split(' ').length}, mots`);

    let lastChunk: string | undefined = undefined;

    const dataStream = createDataStream({
      async execute(dataStream) {
        const filePaths = getFilePaths(files || {});
        let filteredFiles: FileMap | undefined = undefined;
        let summary: string | undefined = undefined;
        let messageSliceId = 0;

        if (messages.length > 3) {
          messageSliceId = messages.length - 3;
        }

        if (filePaths.length > 0 && contextOptimization) {
          logger.debug('Génération d\'un résumé de discussion');
          dataStream.writeData({
            type: 'progress',
            label: 'Résumer',
            status: 'in-progress',
            order: progressCounter++,
            message: 'Analyse de la conversation',
          } satisfies ProgressAnnotation);

          // Create a summary of the chat
          console.log(`Nombre de messages : ${messages.length}`);

          summary = await createSummary({
            messages: [...messages],
            env: context.cloudflare?.env,
            apiKeys,
            providerSettings,
            promptId,
            contextOptimization,
            onFinish(resp) {
              if (resp.usage) {
                logger.debug('utilisation des jetons pour le résumer', JSON.stringify(resp.usage));
                cumulativeUsage.completionTokens += resp.usage.completionTokens || 0;
                cumulativeUsage.promptTokens += resp.usage.promptTokens || 0;
                cumulativeUsage.totalTokens += resp.usage.totalTokens || 0;
              }
            },
          });
          dataStream.writeData({
            type: 'progress',
            label: 'Résumer',
            status: 'complete',
            order: progressCounter++,
            message: 'Analyse de la conversation terminée',
          } satisfies ProgressAnnotation);

          dataStream.writeMessageAnnotation({
            type: 'chatSummary',
            summary,
            chatId: messages.slice(-1)?.[0]?.id,
          } as ContextAnnotation);

          // Update context buffer
          logger.debug('Mise à jour du tampon de contexte');
          dataStream.writeData({
            type: 'progress',
            label: 'Contexte',
            status: 'in-progress',
            order: progressCounter++,
            message: 'Recherche des fichiers pertinents',
          } satisfies ProgressAnnotation);

          // Select context files
          console.log(`Nombre de messages :${messages.length}`);
          filteredFiles = await selectContext({
            messages: [...messages],
            env: context.cloudflare?.env,
            apiKeys,
            files,
            providerSettings,
            promptId,
            contextOptimization,
            summary,
            onFinish(resp) {
              if (resp.usage) {
                logger.debug('Utilisation du jeton selectContext', JSON.stringify(resp.usage));
                cumulativeUsage.completionTokens += resp.usage.completionTokens || 0;
                cumulativeUsage.promptTokens += resp.usage.promptTokens || 0;
                cumulativeUsage.totalTokens += resp.usage.totalTokens || 0;
              }
            },
          });

          if (filteredFiles) {
            logger.debug(`fichiers en contexte: ${JSON.stringify(Object.keys(filteredFiles))}`);
          }

          dataStream.writeMessageAnnotation({
            type: 'codeContext',
            files: Object.keys(filteredFiles).map((key) => {
              let path = key;

              if (path.startsWith(WORK_DIR)) {
                path = path.replace(WORK_DIR, '');
              }

              return path;
            }),
          } as ContextAnnotation);

          dataStream.writeData({
            type: 'progress',
            label: 'Contexte',
            status: 'complete',
            order: progressCounter++,
            message: 'Fichiers pertinents sélectionnés',
          } satisfies ProgressAnnotation);

          // logger.debug('Code Files Selected');
        }

        const options: StreamingOptions = {
          supabaseConnection: supabase,
          toolChoice: 'none',
          smoothStreaming: true,
          onFinish: async ({ text: content, finishReason, usage, reasoning }) => {
            logger.debug('usage', JSON.stringify(usage));

            if (usage) {
              cumulativeUsage.completionTokens += usage.completionTokens || 0;
              cumulativeUsage.promptTokens += usage.promptTokens || 0;
              cumulativeUsage.totalTokens += usage.totalTokens || 0;
            }
// If reasoning is available, sanitize it before writing to dataStream
if (reasoning) {
  // Sanitize the reasoning output to prevent rendering issues
  const sanitizedReasoning =
    typeof sanitizeReasoningOutput === 'function' ? sanitizeReasoningOutput(reasoning) : reasoning;

  dataStream.writeMessageAnnotation({
    type: 'reasoning',
    value: sanitizedReasoning,
  });
}

            if (finishReason !== 'length') {
              dataStream.writeMessageAnnotation({
                type: 'usage',
                value: {
                  completionTokens: cumulativeUsage.completionTokens,
                  promptTokens: cumulativeUsage.promptTokens,
                  totalTokens: cumulativeUsage.totalTokens,
                },
              });
              dataStream.writeData({
                type: 'progress',
                label: 'Réponse',
                status: 'complete',
                order: progressCounter++,
                message: 'Code généré avec succès',
              } satisfies ProgressAnnotation);
              await new Promise((resolve) => setTimeout(resolve, 0));

              // stream.close();
              return;
            }

            if (stream.switches >= MAX_RESPONSE_SEGMENTS) {
              throw Error('Impossible de continuer le message : nombre maximal de segments atteint');
            }

            const switchesLeft = MAX_RESPONSE_SEGMENTS - stream.switches;

            logger.info(`Limite maximale de jetons atteinte (${MAX_TOKENS}): Message continu (${switchesLeft} bascule vers la gauche)`);

            const lastUserMessage = messages.filter((x) => x.role == 'user').slice(-1)[0];
            const { model, provider } = extractPropertiesFromMessage(lastUserMessage);
            messages.push({ id: generateId(), role: 'assistant', content });
            messages.push({
              id: generateId(),
              role: 'user',
              content: `[Model: ${model}]\n\n[Provider: ${provider}]\n\n${CONTINUE_PROMPT}`,
            });

            const result = await streamText({
              messages,
              env: context.cloudflare?.env,
              options,
              apiKeys,
              files,
              providerSettings,
              promptId,
              contextOptimization,
              contextFiles: filteredFiles,
              summary,
              messageSliceId,
              customInstructions, // Pass custom instructions here
            });

            result.mergeIntoDataStream(dataStream);

            (async () => {
            // Reduce timeout to minimum needed
            await new Promise((resolve) => setTimeout(resolve, 5));
            try {
              // Process stream parts in batches for more efficient handling
              const reader = result.fullStream.getReader();

              while (true) {
                const { done, value } = await reader.read();

                if (done) {
                  break;
                }

                if (value.type === 'error') {
                  logger.error(`Error in stream: ${value.error}`);
                  break;
                }                
              }
            } catch (error) {
              logger.error(`Stream processing error: ${error}`);
              }
            })();

            return;
          },
        };

        dataStream.writeData({
          type: 'progress',
          label: 'Réponse',
          status: 'in-progress',
          order: progressCounter++,
          message: 'Code en cours ecriture',
        } satisfies ProgressAnnotation);

        const result = await streamText({
          messages,
          env: context.cloudflare?.env,
          options,
          apiKeys,
          files,
          providerSettings,
          promptId,
          contextOptimization,
          contextFiles: filteredFiles,
          summary,
          messageSliceId,
          customInstructions, // Add custom instructions here too
        });

        (async () => {
           // Reduce timeout to minimum needed
          await new Promise((resolve) => setTimeout(resolve, 5));

          try {
            // Process stream parts in batches for more efficient handling
            const reader = result.fullStream.getReader();

            while (true) {
              const { done, value } = await reader.read();

              if (done) {
                break;
              }

              if (value.type === 'error') {
                logger.error(`Error in stream: ${value.error}`);
                break;
              }            
            }
          } catch (error) {
            logger.error(`Stream processing error: ${error}`);
          }
        })();
        result.mergeIntoDataStream(dataStream);
      },
      onError: (error: any) => `Custom error: ${error.message}`,
    }).pipeThrough(
      new TransformStream({
        transform: (chunk, controller) => {
          if (!lastChunk) {
            lastChunk = ' ';
          }

            // Fast path for non-string chunks
            if (typeof chunk !== 'string') {
              controller.enqueue(encoder.encode(JSON.stringify(chunk)));
              return;
            }

            // Handle thought annotations with minimal operations
          const isThoughtStart = chunk.startsWith('g') && !lastChunk.startsWith('g');
          const isThoughtEnd = lastChunk.startsWith('g') && !chunk.startsWith('g');

          if (isThoughtStart) {
            controller.enqueue(encoder.encode(`0: "<div class=\\"__boltThought__\\">"\n`));
          }
          if (isThoughtEnd) {
            controller.enqueue(encoder.encode(`0: "</div>\\n"\n`));
          }

          // Update for next chunk comparison
          lastChunk = chunk;

// Efficient chunk transformation with minimal string operations
if (chunk.startsWith('g')) {
  const colonIndex = chunk.indexOf(':');
            // Fast path if colon is found
            if (colonIndex >= 0) {
              const content = chunk.slice(colonIndex + 1, chunk.endsWith('\n') ? chunk.length - 1 : undefined);
              controller.enqueue(encoder.encode(`0:${content}\n`));

              return;

            }

          }

          // Default case - direct encoding without JSON.stringify for string data
          controller.enqueue(encoder.encode(chunk));
        },
      }),
    );

    return new Response(dataStream, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        Connection: 'keep-alive',
        'Cache-Control': 'no-cache',
        'Text-Encoding': 'chunked',
      },
    });
  } catch (error: any) {
    logger.error(error);

    if (error.message?.includes('API key')) {
      throw new Response('Invalid or missing API key', {
        status: 401,
        statusText: 'Unauthorized',
      });
    }

    throw new Response(null, {
      status: 500,
      statusText: 'Internal Server Error',
    });
  }
}
