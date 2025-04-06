import { type ActionFunctionArgs, type LoaderFunctionArgs } from '@remix-run/cloudflare';
import { streamText } from '~/lib/.server/llm/stream-text';
import { stripIndents } from '~/utils/stripIndent';
import type { ProviderInfo } from '~/types/model';
import { getApiKeysFromCookie, getProviderSettingsFromCookie } from '~/lib/api/cookies';
import { createScopedLogger } from '~/utils/logger';

export async function action(args: ActionFunctionArgs) {
  return uiAnalysisAction(args);
}

export async function loader(args: LoaderFunctionArgs) {
  return uiAnalysisLoader(args);
}

const logger = createScopedLogger('api.ui-analysis');

/*
 * Temporary storage to avoid reprocessing images
 * In practice, this would be better implemented with a Redis cache or similar
 */
const MAX_CACHE_SIZE = 100; // Limite maximale d'entrées dans le cache
const CACHE_EXPIRY_MS = 30 * 60 * 1000; // 30 minutes

interface CacheEntry {
  stream: ReadableStream;
  timestamp: number;
}

const analysisCache = new Map<string, CacheEntry>();

function cleanupCache() {
  const now = Date.now();
  let entriesRemoved = 0;

  // Supprimer les entrées expirées
  for (const [id, entry] of analysisCache.entries()) {
    if (now - entry.timestamp > CACHE_EXPIRY_MS) {
      analysisCache.delete(id);
      entriesRemoved++;
    }
  }

  // Si le cache est toujours trop grand, supprimer les entrées les plus anciennes
  if (analysisCache.size > MAX_CACHE_SIZE) {
    const sortedEntries = Array.from(analysisCache.entries())
      .sort(([, a], [, b]) => a.timestamp - b.timestamp);

    const entriesToRemove = sortedEntries.slice(0, analysisCache.size - MAX_CACHE_SIZE);
    for (const [id] of entriesToRemove) {
      analysisCache.delete(id);
      entriesRemoved++;
    }
  }

  if (entriesRemoved > 0) {
    logger.debug(`Cache nettoyé: ${entriesRemoved} entrées supprimées`);
  }
}

/**
 * Helper function to convert a stream to text and apply transformations
 * This approach is more straightforward and better handles formatting issues
 */
const MAX_RESPONSE_SIZE = 1024 * 1024; // 1MB limite de taille de réponse

async function streamToText(stream: ReadableStream, transformer?: (text: string) => string): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let result = '';
  let totalSize = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      // Vérifier la taille totale
      totalSize += value.length;
      if (totalSize > MAX_RESPONSE_SIZE) {
        throw new Error('La limite de taille de réponse a été dépassée');
      }

      result += decoder.decode(value, { stream: true });
    }
    // Last chunk with stream: false to ensure proper decoding
    result += decoder.decode(undefined, { stream: false });

    return transformer ? transformer(result) : result;
  } catch (error) {
    logger.error('Erreur dans streamToText :', error);
    throw error;
  } finally {
    reader.releaseLock();
  }
}

/**
 * Converts text to the SSE (Server-Sent Events) format
 */
function textToSSE(text: string): ReadableStream {
  const encoder = new TextEncoder();
  const chunks = text.split('\n');

  logger.debug(`Conversion de texte en SSE. Taille : ${text.length}, Lignes: ${chunks.length}`);

  return new ReadableStream({
    start(controller) {
      // Send each line as an SSE event
      for (const chunk of chunks) {
        if (chunk.trim()) {
          controller.enqueue(encoder.encode(`data: ${chunk}\n\n`));
        }
      }
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });
}

/**
 * GET endpoint for event streaming (used by EventSource)
 */
async function uiAnalysisLoader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const id = url.searchParams.get('id');

  // If no ID, explain how to use the endpoint
  if (!id) {
    logger.warn('Accessing loader without ID');
    return new Response(
      'This endpoint must be used with a valid analysis ID. ' +
        'To perform an analysis, send a POST to /api/ui-analysis with the image data.',
      {
        status: 400,
        headers: {
          'Content-Type': 'text/plain',
        },
      },
    );
  }

  logger.debug(`Fetching analysis with ID: ${id}`);

  cleanupCache();

  // If the cache is empty for this ID
  if (!analysisCache.has(id)) {
    logger.warn(`Analysis with ID ${id} not found in cache`);

    // Return a waiting message, as processing may be ongoing
    return new Response(textToSSE('En attente de traitement de l\'analyse. Veuillez patienter…'), {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        Connection: 'keep-alive',
        'Cache-Control': 'no-cache',
      },
    });
  }

  // Return the stored stream from the cache
  const cacheEntry = analysisCache.get(id)!;
  logger.debug(`Returning analysis from cache with ID: ${id}`);

  // If the stream is empty (still processing), send a waiting message
  if (cacheEntry.stream === textToSSE('')) {
    logger.debug(`Cache pour l'ID ${id} existe, mais est encore vide (en cours de traitement)`);
    return new Response(textToSSE('Analyse en cours. Veuillez patienter...'), {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        Connection: 'keep-alive',
        'Cache-Control': 'no-cache',
      },
    });
  }

  // Mettre à jour le timestamp pour indiquer que l'entrée est toujours active
  cacheEntry.timestamp = Date.now();

  return new Response(cacheEntry.stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      Connection: 'keep-alive',
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

/**
 * POST endpoint to process a new UI analysis
 */
async function uiAnalysisAction({ context, request }: ActionFunctionArgs) {
  // Check if the method is POST
  if (request.method !== 'POST') {
    return new Response('This endpoint only accepts POST requests.', {
      status: 405,
      statusText: 'Method Not Allowed',
    });
  }

  // Extract form data
  const formData = await request.formData();
  const imageData = formData.get('imageData') as string;
  const model = formData.get('model') as string;
  const providerData = formData.get('provider') as string;

  // Extract the ID from the URL, if present (to associate with cache)
  const url = new URL(request.url);
  const id = url.searchParams.get('id');

  if (!id) {
    logger.warn('Analysis request without cache ID');
  } else {
    logger.debug(`Received analysis request with ID: ${id}`);
  }

  logger.debug(`Received UI analysis request with model: ${model}`);

  // Parse provider from string
  let provider: ProviderInfo;

  try {
    provider = JSON.parse(providerData);
  } catch (e) {
    logger.error('Error parsing provider data:', e);
    return new Response('Invalid provider format', {
      status: 400,
      statusText: 'Bad Request',
    });
  }

  const { name: providerName } = provider;
  logger.debug(`Using provider: ${providerName}`);

  // Validate fields
  if (!model || typeof model !== 'string') {
    return new Response('Invalid or missing model', {
      status: 400,
      statusText: 'Bad Request',
    });
  }

  if (!providerName || typeof providerName !== 'string') {
    return new Response('Invalid or missing provider', {
      status: 400,
      statusText: 'Bad Request',
    });
  }

  if (!imageData || typeof imageData !== 'string' || !imageData.startsWith('data:image/')) {
    return new Response('Invalid or missing image data', {
      status: 400,
      statusText: 'Bad Request',
    });
  }

  // Get API keys from cookies
  const cookieHeader = request.headers.get('Cookie');
  const apiKeys = getApiKeysFromCookie(cookieHeader);
  const providerSettings = getProviderSettingsFromCookie(cookieHeader);

  try {
    logger.debug('Starting image processing...');

    // Call streamText to get the analysis result
    const result = await streamText({
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text:
                `[Model: ${model}]\n\n[Provider: ${providerName}]\n\n` +
                stripIndents`
                Analyze this UI/UX interface and generate a detailed structured prompt following EXACTLY this format:

                <summary_title>
                Create detailed components with these requirements:

                

                <image_analysis>
                Navigation Elements:
                [Describe all visible navigation elements: header, footer, sidebar, main menu, breadcrumbs, etc. with specific details]

                Layout Components:
                [Describe the layout and main components - containers, specific dimensions (in px or %), proportions, margins and paddings]

                Content Sections:
                [List and describe the main content sections identified in the interface, including visual hierarchy and priority]

                Interactive Controls:
                [List all interactive controls - buttons, fields, forms, sliders, toggles, with their states and visual characteristics]

                Color Palette:
                [Identify the main color palette with hexadecimal codes: background colors, primary text, secondary text, accents, etc.]

                Grid/Layout Structure:
                [Describe the grid structure, specifying number of columns, spacing in px, alignments and breakpoints when visible]
                </image_analysis>

                <development_planning>
                Project Structure:
                [Propose a directory and file structure to implement this UI, following a tree format like:
                src/
                ├── components/
                │   ├── layout/
                │   │   ├── Header
                │   │   ├── Footer
                │   │   └── MainContent
                │   ├── features/
                │   │   ├── Component1
                │   │   ├── Component2
                │   │   └── Component3
                │   └── shared/
                ├── assets/
                ├── styles/
                ├── hooks/
                └── utils/]

                Main Functionalities:
                [List the main functionalities inferred from the UI, detailing expected behaviors]

                State Management:
                [Suggest a state/data structure for the application in TypeScript format, such as:
                interface AppState {
                  user: {
                    isAuthenticated: boolean;
                    preferences: UserPreferences;
                    projects: Project[];
                  };
                  // other state elements
                }]

                Routes:
                [Identify possible routes based on the UI, organized in code format:
                const routes = [
                  '/',
                  '/feature1/*',
                  '/feature2/:id/*',
                ];]

                Component Architecture:
                [Describe the recommended component architecture, including hierarchical relationships and component communication]

                Responsive Breakpoints:
                [Suggest appropriate responsive breakpoints in SCSS format:
                $breakpoints: (
                  'mobile': 320px,
                  'tablet': 768px,
                  'desktop': 1024px,
                  'wide': 1440px
                );]
                </development_planning>

                Follow this structure STRICTLY. Ensure that each section is completely filled with detailed and specific information based on the image. Do not omit any subsection. Keep the requested tags and format exactly.
                `,
            },
            {
              type: 'image',
              image: imageData,
            },
          ] as any,
        },
      ],
      env: context.cloudflare?.env as any,
      apiKeys,
      providerSettings,
      options: {
        system:
          'You are an expert in UX/UI and front-end development. Your task is to analyze interface images and generate a detailed structured prompt that allows the interface to be recreated. Be extremely precise in analyzing layouts, colors (with exact hexadecimal codes), alignments, components, and structure. Remain strictly faithful to the specified prompt format, filling in all fields with precise technical details.',
        temperature: 0.5, // Plus bas pour une plus grande précision
        // maxTokens: 1000, // Limite le nombre de tokens pour éviter les réponses trop longues
        presencePenalty: 0.1, // Petite pénalité en cas de répétition
      },
    });

    // Background error monitoring
    (async () => {
      try {
        for await (const part of result.fullStream) {
          if (part.type === 'error') {
            const error: any = part.error;
            logger.error('Error in streaming:', error);
            break;
          }
        }
      } catch (error) {
        logger.error('Error processing stream:', error);
      }
    })();

    // If we have an ID, save the stream in cache for later retrieval via EventSource
    if (id) {
      try {
        // Clone the stream to preserve the original
        const clonedStream = result.textStream.tee();

        /*
         * Store the stream directly in the cache (without consuming the entire content)
         * This avoids error 500 from trying to process very large streams
         */
        // Nettoyer le cache avant d'ajouter une nouvelle entrée
        cleanupCache();

        // Initialiser l'entrée du cache
        analysisCache.set(id, {
          stream: textToSSE(''),
          timestamp: Date.now()
        });

        // Process the stream in the background and update the cache
        (async () => {
          try {
            // Convert the first stream to text
            const fullText = await streamToText(clonedStream[0]);

            // Update the cache with the complete text
            analysisCache.set(id, {
              stream: textToSSE(fullText),
              timestamp: Date.now()
            });
            logger.debug(`Analyse stockée dans le cache avec ID: ${id}, taille: ${fullText.length}`);
            logger.debug(`Taille du cache: ${analysisCache.size} entrées`);
          } catch (error) {
            logger.error(`Erreur lors du traitement du flux pour le cache (ID: ${id}):`, error);
            // En cas d'erreur, s'assurer que le cache contient au moins un message d'erreur
            analysisCache.set(id, {
              stream: textToSSE('Erreur lors du traitement de l\'analyse. Veuillez réessayer.'),
              timestamp: Date.now()
            });
          }
        })();

        // Immediately return a success status so that the client can initiate the EventSource
        return new Response(
          JSON.stringify({
            status: 'processing',
            id,
          }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
            },
          },
        );
      } catch (error) {
        logger.error('Error setting up analysis in cache:', error);
        return new Response(
          JSON.stringify({
            status: 'error',
            message: 'Error setting up analysis in cache',
          }),
          {
            status: 500,
            headers: {
              'Content-Type': 'application/json',
            },
          },
        );
      }
    }

    // Without an ID, return the result directly as SSE
    try {
      // Return the stream as SSE
      return new Response(result.textStream, {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          Connection: 'keep-alive',
          'Cache-Control': 'no-cache',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    } catch (error) {
      logger.error('Error processing stream for response:', error);

      // Fallback: if an error occurs, return a direct response
      const textResponse = 'Erreur lors du traitement de l\'analyse UI/UX. Veuillez réessayer.';
      return new Response(textToSSE(textResponse), {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          Connection: 'keep-alive',
          'Cache-Control': 'no-cache',
        },
      });
    }
  } catch (error: unknown) {
    logger.error('Error in UI analysis:', error);

    if (error instanceof Error && error.message?.includes('API key')) {
      return new Response('Invalid or missing API key', {
        status: 401,
        statusText: 'Unauthorized',
      });
    }

    // Return an error in SSE format to be handled by the client
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred during the analysis.';

    return new Response(textToSSE(errorMessage), {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        Connection: 'keep-alive',
        'Cache-Control': 'no-cache',
      },
    });
  }
}
