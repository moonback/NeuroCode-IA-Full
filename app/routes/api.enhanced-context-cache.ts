import { type ActionFunctionArgs, json } from '@remix-run/cloudflare';
import { enhancedContextCache } from '~/lib/.server/llm/enhanced-context-cache';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('api.enhanced-context-cache');

// Interface pour typer les données de la requête
interface EnhancedContextCacheRequest {
  action: 'clear' | 'stats' | 'configure' | 'toggle-compression' | 'toggle-adaptive-expiry' | 'toggle-memory-monitoring' | 'set-compression-threshold';
  maxSize?: number;
  expiryMs?: number;
  enabled?: boolean;
  threshold?: number;
}

export async function action({ request }: ActionFunctionArgs) {
  const { action, maxSize, expiryMs, enabled, threshold } = await request.json() as EnhancedContextCacheRequest;

  switch (action) {
    case 'clear':
      enhancedContextCache.clear();
      logger.info('Cache de contexte amélioré vidé');
      return json({ success: true, message: 'Cache de contexte amélioré vidé avec succès' });

    case 'stats':
      const stats = enhancedContextCache.getStats();
      logger.info(`Statistiques du cache amélioré: ${JSON.stringify(stats)}`);
      return json({ 
        success: true, 
        stats,
        metrics: {
          hitRatio: `${(stats.hitRatio * 100).toFixed(2)}%`,
          compressionRatio: `${(stats.compressionRatio * 100).toFixed(2)}%`,
          averageAccessTime: `${stats.averageAccessTime.toFixed(2)}ms`
        }
      });

    case 'configure':
      if (maxSize !== undefined) {
        enhancedContextCache.setMaxSize(maxSize);
        logger.info(`Taille maximale du cache configurée à ${maxSize}`);
      }

      if (expiryMs !== undefined) {
        enhancedContextCache.setDefaultExpiry(expiryMs);
        logger.info(`Durée d'expiration du cache configurée à ${expiryMs}ms`);
      }

      return json({
        success: true,
        message: 'Configuration du cache amélioré mise à jour',
        stats: enhancedContextCache.getStats(),
      });
      
    case 'toggle-compression':
      if (enabled !== undefined) {
        enhancedContextCache.setCompressionEnabled(enabled);
        logger.info(`Compression ${enabled ? 'activée' : 'désactivée'}`);
      }
      
      return json({
        success: true,
        message: `Compression ${enabled ? 'activée' : 'désactivée'} avec succès`,
        compressionEnabled: enabled
      });
      
    case 'toggle-adaptive-expiry':
      if (enabled !== undefined) {
        enhancedContextCache.setAdaptiveExpiryEnabled(enabled);
        logger.info(`Expiration adaptative ${enabled ? 'activée' : 'désactivée'}`);
      }
      
      return json({
        success: true,
        message: `Expiration adaptative ${enabled ? 'activée' : 'désactivée'} avec succès`,
        adaptiveExpiryEnabled: enabled
      });

    case 'toggle-memory-monitoring':
      if (enabled !== undefined) {
        enhancedContextCache.setMemoryMonitoringEnabled(enabled);
        logger.info(`Surveillance mémoire ${enabled ? 'activée' : 'désactivée'}`);
      }
      
      return json({
        success: true,
        message: `Surveillance mémoire ${enabled ? 'activée' : 'désactivée'} avec succès`,
        memoryMonitoringEnabled: enabled
      });

    case 'set-compression-threshold':
      if (threshold !== undefined) {
        enhancedContextCache.setAutoCompressionThreshold(threshold);
        logger.info(`Seuil de compression configuré à ${threshold} bytes`);
      }
      
      return json({
        success: true,
        message: `Seuil de compression configuré avec succès`,
        autoCompressionThreshold: threshold
      });

    default:
      logger.error(`Action inconnue: ${action}`);
      return json({ success: false, message: 'Action inconnue' }, { status: 400 });
  }
}
