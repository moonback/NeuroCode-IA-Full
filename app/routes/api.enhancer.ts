import { type ActionFunctionArgs } from '@remix-run/cloudflare';
import { streamText } from '~/lib/.server/llm/stream-text';
import { stripIndents } from '~/utils/stripIndent';
import type { ProviderInfo } from '~/types/model';
import { getApiKeysFromCookie, getProviderSettingsFromCookie } from '~/lib/api/cookies';
import { createScopedLogger } from '~/utils/logger';

export async function action(args: ActionFunctionArgs) {
  return enhancerAction(args);
}

const logger = createScopedLogger('api.enhancher');

async function enhancerAction({ context, request }: ActionFunctionArgs) {
  const { message, model, provider } = await request.json<{
    message: string;
    model: string;
    provider: ProviderInfo;
    apiKeys?: Record<string, string>;
  }>();

  const { name: providerName } = provider;

  // validate 'model' and 'provider' fields
  if (!model || typeof model !== 'string') {
    throw new Response('Invalid or missing model', {
      status: 400,
      statusText: 'Bad Request',
    });
  }

  if (!providerName || typeof providerName !== 'string') {
    throw new Response('Invalid or missing provider', {
      status: 400,
      statusText: 'Bad Request',
    });
  }

  const cookieHeader = request.headers.get('Cookie');
  const apiKeys = getApiKeysFromCookie(cookieHeader);
  const providerSettings = getProviderSettingsFromCookie(cookieHeader);

  try {
    const result = await streamText({
      messages: [
        {
          role: 'user',
          content:
            `[Model: ${model}]\n\n[Provider: ${providerName}]\n\n` +
            stripIndents`
            You are an expert in creating high-performing and aesthetically pleasing landing pages.
              Your task is to improve the initial brief into a detailed specification for an effective landing page.

              I want you to transform the user prompt delimited by \`<original_prompt>\` into a structured specification.

              For all types of landing pages:
              - Detail the complete structure (sections, logical order)
              - Specify the appropriate color palette and recommended typography
              - Specify the necessary visual elements (type of photos, illustrations, videos)
              - Identify priority calls to action (CTAs)
              - Define the tone and communication style
              - Include technical recommendations (responsiveness, loading time, etc.)
              - Add tips for optimizing conversion
              - Adapt your response to the industry mentioned

              Your response should ONLY contain the complete and structured specification.
              Do not include explanations, metadata, or tags.

            <original_prompt>
              ${message}
            </original_prompt>
          `,
        },
      ],
      env: context.cloudflare?.env as any,
      apiKeys,
      providerSettings,
      options: {
        system:
          'You are a web development and UI/UX design expert specializing in creating high-performing landing pages. Your task is to enrich user prompts to create highly converting, aesthetically pleasing landing pages aligned with the brand identity. Focus on structure, key elements, visual aspects, and concrete business objectives. Your answer should be a detailed prompt that can be directly applied by a front-end developer.',

        /*
         * onError: (event) => {
         *   throw new Response(null, {
         *     status: 500,
         *     statusText: 'Internal Server Error',
         *   });
         * }
         */
      },
    });

    // Handle streaming errors in a non-blocking way
    (async () => {
      try {
        for await (const part of result.fullStream) {
          if (part.type === 'error') {
            const error: any = part.error;
            logger.error('Streaming error:', error);
            break;
          }
        }
      } catch (error) {
        logger.error('Error processing stream:', error);
      }
    })();

    // Return the text stream directly since it's already text data
    return new Response(result.textStream, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        Connection: 'keep-alive',
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error: unknown) {
    console.log(error);

    if (error instanceof Error && error.message?.includes('API key')) {
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
