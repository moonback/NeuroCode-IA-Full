import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { IconButton } from '~/components/ui/IconButton';
import WithTooltip from '~/components/ui/Tooltip';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('EnhancedContextCacheManager');

interface CacheStats {
  size: number;
  maxSize: number;
  defaultExpiryMs: number;
  hits: number;
  misses: number;
  hitRatio: number;
  compressionEnabled: boolean;
  adaptiveExpiryEnabled: boolean;
  compressionRatio: number;
  averageAccessTime: number;
  totalAccessTime: number;
  accessCount: number;
}

interface EnhancedContextCacheManagerProps {
  className?: string;
}

export function EnhancedContextCacheManager({ className = '' }: EnhancedContextCacheManagerProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [stats, setStats] = useState<CacheStats | null>(null);
  const [showStats, setShowStats] = useState(false);

  // Fonction pour récupérer les statistiques du cache
  const fetchCacheStats = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/enhanced-context-cache', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'stats' }),
      });

      if (!response.ok) {
        throw new Error(`Erreur lors de la récupération des statistiques: ${response.status}`);
      }

      const data = await response.json();
      setStats((data as { stats: CacheStats }).stats);
      setShowStats(true);
      logger.debug('Statistiques du cache récupérées avec succès', (data as { stats: CacheStats }).stats);
    } catch (error) {
      logger.error('Erreur lors de la récupération des statistiques du cache', error);
      toast.error('Impossible de récupérer les statistiques du cache');
    } finally {
      setIsLoading(false);
    }
  };

  // Fonction pour vider le cache
  const clearCache = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/enhanced-context-cache', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'clear' }),
      });

      if (!response.ok) {
        throw new Error(`Erreur lors du vidage du cache: ${response.status}`);
      }

      const data = await response.json();
      toast.success((data as { message?: string }).message || 'Cache vidé avec succès');
      logger.info('Cache vidé avec succès');
      
      // Mettre à jour les statistiques après avoir vidé le cache
      await fetchCacheStats();
    } catch (error) {
      logger.error('Erreur lors du vidage du cache', error);
      toast.error('Impossible de vider le cache');
    } finally {
      setIsLoading(false);
    }
  };

  // Fonction pour basculer la compression
  const toggleCompression = async (enabled: boolean) => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/enhanced-context-cache', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          action: 'toggle-compression',
          enabled
        }),
      });

      if (!response.ok) {
        throw new Error(`Erreur lors de la configuration de la compression: ${response.status}`);
      }

      const data = await response.json();
      toast.success((data as { message?: string }).message || `Compression ${enabled ? 'activée' : 'désactivée'} avec succès`);
      logger.info(`Compression ${enabled ? 'activée' : 'désactivée'} avec succès`);
      
      // Mettre à jour les statistiques après avoir modifié la configuration
      await fetchCacheStats();
    } catch (error) {
      logger.error('Erreur lors de la configuration de la compression', error);
      toast.error('Impossible de configurer la compression');
    } finally {
      setIsLoading(false);
    }
  };

  // Fonction pour basculer l'expiration adaptative
  const toggleAdaptiveExpiry = async (enabled: boolean) => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/enhanced-context-cache', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          action: 'toggle-adaptive-expiry',
          enabled
        }),
      });

      if (!response.ok) {
        throw new Error(`Erreur lors de la configuration de l'expiration adaptative: ${response.status}`);
      }

      const data = await response.json();
      toast.success((data as { message?: string }).message || `Expiration adaptative ${enabled ? 'activée' : 'désactivée'} avec succès`);
      logger.info(`Expiration adaptative ${enabled ? 'activée' : 'désactivée'} avec succès`);
      
      // Mettre à jour les statistiques après avoir modifié la configuration
      await fetchCacheStats();
    } catch (error) {
      logger.error('Erreur lors de la configuration de l\'expiration adaptative', error);
      toast.error('Impossible de configurer l\'expiration adaptative');
    } finally {
      setIsLoading(false);
    }
  };

  // Fonction pour configurer le cache
  const configureCache = async (maxSize?: number, expiryMs?: number) => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/enhanced-context-cache', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          action: 'configure',
          maxSize,
          expiryMs
        }),
      });

      if (!response.ok) {
        throw new Error(`Erreur lors de la configuration du cache: ${response.status}`);
      }

      const data = await response.json();
      toast.success((data as { message?: string }).message || 'Configuration du cache mise à jour avec succès');
      logger.info('Configuration du cache mise à jour avec succès');
      
      // Mettre à jour les statistiques après avoir modifié la configuration
      setStats((data as { stats: CacheStats }).stats);
    } catch (error) {
      logger.error('Erreur lors de la configuration du cache', error);
      toast.error('Impossible de configurer le cache');
    } finally {
      setIsLoading(false);
    }
  };

  // Formater la durée en secondes ou minutes
  const formatDuration = (ms: number) => {
    if (ms < 60000) {
      return `${(ms / 1000).toFixed(1)} secondes`;
    }
    return `${(ms / 60000).toFixed(1)} minutes`;
  };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <WithTooltip tooltip="Gérer le cache de contexte">
        <IconButton
          title="Gérer le cache de contexte"
          onClick={fetchCacheStats}
          disabled={isLoading}
        >
          {isLoading ? (
            <div className="i-svg-spinners:90-ring-with-bg text-bolt-elements-loader-progress text-xl animate-spin"></div>
          ) : (
            <div className="i-ph:database text-xl"></div>
          )}
        </IconButton>
      </WithTooltip>

      {showStats && stats && (
        <div className="absolute bottom-20 right-4 bg-bolt-elements-background-depth-2 p-4 rounded-lg border border-bolt-elements-borderColor shadow-lg z-50 w-80">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-bolt-elements-textPrimary">Cache de Contexte</h3>
            <IconButton title="Fermer" onClick={() => setShowStats(false)}>
              <div className="i-ph:x text-lg"></div>
            </IconButton>
          </div>
          
          <div className="space-y-3 mb-4">
            <div className="flex justify-between">
              <span className="text-bolt-elements-textSecondary">Taille:</span>
              <span className="text-bolt-elements-textPrimary font-medium">{stats.size} / {stats.maxSize} entrées</span>
            </div>
            <div className="flex justify-between">
              <span className="text-bolt-elements-textSecondary">Expiration:</span>
              <span className="text-bolt-elements-textPrimary font-medium">{formatDuration(stats.defaultExpiryMs)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-bolt-elements-textSecondary">Ratio de succès:</span>
              <span className="text-bolt-elements-textPrimary font-medium">{(stats.hitRatio * 100).toFixed(1)}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-bolt-elements-textSecondary">Compression:</span>
              <span className="text-bolt-elements-textPrimary font-medium">
                {stats.compressionEnabled ? 'Activée' : 'Désactivée'} ({(stats.compressionRatio * 100).toFixed(1)}%)
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-bolt-elements-textSecondary">Expiration adaptative:</span>
              <span className="text-bolt-elements-textPrimary font-medium">
                {stats.adaptiveExpiryEnabled ? 'Activée' : 'Désactivée'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-bolt-elements-textSecondary">Temps d'accès moyen:</span>
              <span className="text-bolt-elements-textPrimary font-medium">{stats.averageAccessTime.toFixed(2)}ms</span>
            </div>
          </div>
          
          <div className="flex flex-wrap gap-2">
            <button
              className="px-3 py-1 bg-red-500 hover:bg-red-600 text-white rounded-md text-sm transition-colors"
              onClick={clearCache}
              disabled={isLoading}
            >
              Vider le cache
            </button>
            <button
              className={`px-3 py-1 ${stats.compressionEnabled ? 'bg-amber-500 hover:bg-amber-600' : 'bg-green-500 hover:bg-green-600'} text-white rounded-md text-sm transition-colors`}
              onClick={() => toggleCompression(!stats.compressionEnabled)}
              disabled={isLoading}
            >
              {stats.compressionEnabled ? 'Désactiver' : 'Activer'} compression
            </button>
            <button
              className={`px-3 py-1 ${stats.adaptiveExpiryEnabled ? 'bg-amber-500 hover:bg-amber-600' : 'bg-green-500 hover:bg-green-600'} text-white rounded-md text-sm transition-colors`}
              onClick={() => toggleAdaptiveExpiry(!stats.adaptiveExpiryEnabled)}
              disabled={isLoading}
            >
              {stats.adaptiveExpiryEnabled ? 'Désactiver' : 'Activer'} expiration adaptative
            </button>
          </div>
        </div>
      )}
    </div>
  );
}