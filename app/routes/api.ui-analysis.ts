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
const analysisCache = new Map<string, ReadableStream>();

/**
 * Helper function to convert a stream to text and apply transformations
 * This approach is more straightforward and better handles formatting issues
 */
async function streamToText(stream: ReadableStream, transformer?: (text: string) => string): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let result = '';

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      result += decoder.decode(value, { stream: true });
    }
    // Last chunk with stream: false to ensure proper decoding
    result += decoder.decode(undefined, { stream: false });

    return transformer ? transformer(result) : result;
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

  logger.debug(`Converting text to SSE. Size: ${text.length}, Lines: ${chunks.length}`);

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

  // If the cache is empty for this ID
  if (!analysisCache.has(id)) {
    logger.warn(`Analysis with ID ${id} not found in cache`);

    // Return a waiting message, as processing may be ongoing
    return new Response(textToSSE('Waiting for analysis processing. Please wait...'), {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        Connection: 'keep-alive',
        'Cache-Control': 'no-cache',
      },
    });
  }

  // Return the stored stream from the cache
  const streamResponse = analysisCache.get(id)!;
  logger.debug(`Returning analysis from cache with ID: ${id}`);

  // If the stream is empty (still processing), send a waiting message
  if (streamResponse === textToSSE('')) {
    logger.debug(`Cache for ID ${id} exists, but is still empty (processing)`);
    return new Response(textToSSE('Processing analysis. Please wait...'), {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        Connection: 'keep-alive',
        'Cache-Control': 'no-cache',
      },
    });
  }

  return new Response(streamResponse, {
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

                1. Component Architecture:
                   - Use the 'use client' directive in all client-side rendered components
                   - Implement pure components when possible for rendering optimization
                   - Follow the component composition pattern for reusability and maintainability

                2. Styling and Responsiveness:
                   - Use exclusively Tailwind CSS utility classes for styling
                   - Implement complete responsive design with mobile-first breakpoints
                   - Ensure adequate contrast between background and text colors (accessibility)

                3. Visual Resources:
                   - Use the lucide-react package for icons (DO NOT use other UI libraries)
                   - For placeholder images, use photos from picsum.photos (format: https://picsum.photos/seed/{id}/{width}/{height})
                   - Configure remotePatterns in next.config.js to enable images from picsum.photos

                4. Project Structure:
                   - Create a root layout.tsx file encapsulating common navigation elements
                   - Properly implement navigation (left sidebar, top header)
                   - Use grid layouts precisely for element alignment

                5. Best Practices:
                   - Use path aliases (@/) for all imports
                   - Keep component imports organized by category
                   - Update src/app/page.tsx with comprehensive code for the main page
                   - Properly implement the root route (page.tsx)
                   - Fully and coherently implement all requested functionalities
                </summary_title>

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
        temperature: 0.5, // Lower for greater accuracy
        presencePenalty: 0.1, // Small penalty for repetition
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
        analysisCache.set(id, textToSSE('')); // Initially empty

        // Process the stream in the background and update the cache
        (async () => {
          try {
            // Convert the first stream to text
            const fullText = await streamToText(clonedStream[0]);

            // Update the cache with the complete text
            analysisCache.set(id, textToSSE(fullText));
            logger.debug(`Analysis stored in cache with ID: ${id}, size: ${fullText.length}`);
          } catch (error) {
            logger.error(`Error processing stream for cache (ID: ${id}):`, error);
            // In case of error, ensure the cache has at least an error message
            analysisCache.set(id, textToSSE('Error processing the analysis. Please try again.'));
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
      const textResponse = 'Error processing the UI/UX analysis. Please try again.';

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