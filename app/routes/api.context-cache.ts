import { type ActionFunctionArgs, json } from '@remix-run/cloudflare';
import { contextCache } from '~/lib/.server/llm/context-cache';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('api.context-cache');

// Interface pour typer les données de la requête
interface ContextCacheRequest {
  action: 'clear' | 'stats' | 'configure';
  maxSize?: number;
  expiryMs?: number;
}

export async function action({ request }: ActionFunctionArgs) {
  const { action, maxSize, expiryMs } = await request.json() as ContextCacheRequest;

  switch (action) {
    case 'clear':
      contextCache.clear();
      logger.info('Cache de contexte vidé');
      return json({ success: true, message: 'Cache de contexte vidé avec succès' });

    case 'stats':
      const stats = contextCache.getStats();
      logger.info(`Statistiques du cache: ${JSON.stringify(stats)}`);
      return json({ success: true, stats });

    case 'configure':
      if (maxSize !== undefined) {
        contextCache.setMaxSize(maxSize);
        logger.info(`Taille maximale du cache configurée à ${maxSize}`);
      }

      if (expiryMs !== undefined) {
        contextCache.setDefaultExpiry(expiryMs);
        logger.info(`Durée d'expiration du cache configurée à ${expiryMs}ms`);
      }

      return json({
        success: true,
        message: 'Configuration du cache mise à jour',
        stats: contextCache.getStats(),
      });

    default:
      logger.error(`Action inconnue: ${action}`);
      return json({ success: false, message: 'Action inconnue' }, { status: 400 });
  }
}