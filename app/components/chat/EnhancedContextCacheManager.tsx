import React, { useState, useEffect, useRef } from 'react';
import { toast } from 'react-toastify';
import { IconButton } from '~/components/ui/IconButton';
import WithTooltip from '~/components/ui/Tooltip';
import { createScopedLogger } from '~/utils/logger';
import { formatSize } from '~/utils/formatSize';

const logger = createScopedLogger('EnhancedContextCacheManager');

interface LLMCallStats {
  modelName: string;
  timestamp: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  summarized: boolean;
  summaryMessageCount?: number;
}

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
  memoryMonitoringEnabled?: boolean;
  totalOriginalSize?: number;
  totalCompressedSize?: number;
  compressedEntries?: number;
  autoCompressionThreshold?: number;
  contextFiles?: string[];
  llmCalls?: LLMCallStats[];
}

interface EnhancedContextCacheManagerProps {
  className?: string;
}

export function EnhancedContextCacheManager({ className = '' }: EnhancedContextCacheManagerProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [stats, setStats] = useState<CacheStats | null>(null);
  const [showStats, setShowStats] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState<number | null>(null);
  const [maxSizeInput, setMaxSizeInput] = useState('');
  const [expiryInput, setExpiryInput] = useState('');
  const [, setShowAdvancedSettings] = useState(false);
  const [showConfigForm, setShowConfigForm] = useState(false);
//   const [showLLMStats] = useState(false);
  const statsRef = useRef<HTMLDivElement>(null);
//   const [statsHistory, setStatsHistory] = useState<CacheStats[]>([]);
  const [llmStats, setLLMStats] = useState<LLMCallStats[]>([]);
  const [selectedTab, setSelectedTab] = useState<'cache' | 'performance'>('cache');

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
      const newStats = (data as { stats: CacheStats }).stats;
      setStats(newStats);
    //   setStatsHistory(prev => [...prev.slice(-9), newStats]);
      if (newStats.llmCalls) {
        setLLMStats(newStats.llmCalls);
      }
      setShowStats(true);
      logger.debug('Statistiques du cache récupérées avec succès', JSON.stringify(newStats, null, 2));
    } catch (error) {
      logger.error('Erreur lors de la récupération des statistiques du cache', error);
      toast.error('Impossible de récupérer les statistiques du cache');
    } finally {
      setIsLoading(false);
    }
  };

  // Activer/désactiver le rafraîchissement automatique
  useEffect(() => {
    if (refreshInterval) {
      const interval = setInterval(fetchCacheStats, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [refreshInterval]);

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

  // Formater la taille en KB ou MB
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    if (!bytes) return 'N/A';
    return formatSize(bytes);
  };

  // Fonction pour basculer la surveillance de la mémoire
  const toggleMemoryMonitoring = async (enabled: boolean) => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/enhanced-context-cache', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          action: 'toggle-memory-monitoring',
          enabled
        }),
      });

      if (!response.ok) {
        throw new Error(`Erreur lors de la configuration de la surveillance mémoire: ${response.status}`);
      }

      const data = await response.json();
      toast.success((data as { message?: string }).message || `Surveillance mémoire ${enabled ? 'activée' : 'désactivée'} avec succès`);
      logger.info(`Surveillance mémoire ${enabled ? 'activée' : 'désactivée'} avec succès`);
      
      // Mettre à jour les statistiques après avoir modifié la configuration
      await fetchCacheStats();
    } catch (error) {
      logger.error('Erreur lors de la configuration de la surveillance mémoire', error);
      toast.error('Impossible de configurer la surveillance mémoire');
    } finally {
      setIsLoading(false);
    }
  };

  // Fonction pour configurer le seuil de compression
  const setCompressionThreshold = async (threshold: number) => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/enhanced-context-cache', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          action: 'set-compression-threshold',
          threshold
        }),
      });

      if (!response.ok) {
        throw new Error(`Erreur lors de la configuration du seuil de compression: ${response.status}`);
      }

      const data = await response.json();
      toast.success((data as { message?: string }).message || `Seuil de compression configuré à ${formatBytes(threshold)}`);
      logger.info(`Seuil de compression configuré à ${threshold} bytes`);
      
      // Mettre à jour les statistiques après avoir modifié la configuration
      await fetchCacheStats();
    } catch (error) {
      logger.error('Erreur lors de la configuration du seuil de compression', error);
      toast.error('Impossible de configurer le seuil de compression');
    } finally {
      setIsLoading(false);
    }
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
            <div className="i-svg-spinners:90-ring-with-bg text-bolt-elements-loader-progress text-2xl animate-spin"></div>
          ) : (
            <div className="i-ph:database-duotone text-2xl"></div>
          )}
        </IconButton>
      </WithTooltip>

      {showStats && stats && (
        <div className="absolute bottom-50 right-1 w-full bg-bolt-elements-background-depth-2 p-4 rounded-lg border border-bolt-elements-borderColor shadow-lg z-50 w-[800px]">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-bolt-elements-textPrimary">Cache de Contexte</h3>
            <div className="flex gap-2">
              
              <IconButton 
                title="Configurer" 
                onClick={() => setShowConfigForm(!showConfigForm)}
                className="text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary"
              >
                <div className="i-ph:gear-six-duotone text-xl"></div>
              </IconButton>
              <IconButton 
                title="Fermer" 
                onClick={() => setShowStats(false)}
                className="text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary"
              >
                <div className="i-ph:x-circle-duotone text-xl"></div>
              </IconButton>
            </div>
          </div>
          
          <div className="flex gap-4 mb-4">
            <button
              className={`px-4 bg-bolt-elements-background-depth-24py-2 rounded-lg ${selectedTab === 'cache' ? 'bg-bolt-elements-background-depth-3 text-bolt-elements-textPrimary' : 'text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-1'}`}
              onClick={() => setSelectedTab('cache')}
            >
              <div className="flex items-center gap-2">
                <div className="i-ph:database-duotone text-lg"></div>
                Cache
              </div>
            </button>
            
            <button
              className={`px-4 bg-bolt-elements-background-depth-4 py-2 rounded-lg ${selectedTab === 'performance' ? 'bg-bolt-elements-background-depth-3 text-bolt-elements-textPrimary' : 'text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-1'}`}
              onClick={() => setSelectedTab('performance')}
            >
              <div className="flex items-center gap-2">
                <div className="i-ph:chart-line-up-duotone text-lg"></div>
                Performance
              </div>
            </button>
          </div>

          {selectedTab === 'cache' && (
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
              {stats.totalOriginalSize !== undefined && (
                <div className="flex justify-between">
                  <span className="text-bolt-elements-textSecondary">Taille des données:</span>
                  <span className="text-bolt-elements-textPrimary font-medium">
                    {formatBytes(stats.totalCompressedSize || 0)} / {formatBytes(stats.totalOriginalSize || 0)}
                  </span>
                </div>
              )}
              {stats.memoryMonitoringEnabled !== undefined && (
                <div className="flex justify-between">
                  <span className="text-bolt-elements-textSecondary">Surveillance mémoire:</span>
                  <span className="text-bolt-elements-textPrimary font-medium">
                    {stats.memoryMonitoringEnabled ? 'Activée' : 'Désactivée'}
                  </span>
                </div>
              )}
            </div>
          )}

         

          {selectedTab === 'performance' && (
            <div className="space-y-4">
              <div className="bg-bolt-elements-background-depth-1 rounded-lg p-4">
                <h4 className="text-sm font-medium text-bolt-elements-textPrimary mb-3">Performance du Cache</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-bolt-elements-background-depth-2 rounded-lg p-3">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-bolt-elements-textSecondary">Cache Hit/Miss</span>
                      <span className="text-bolt-elements-textPrimary">
                        {stats.hits}/{stats.hits + stats.misses}
                      </span>
                    </div>
                    <div className="relative h-2 bg-bolt-elements-background-depth-3 rounded-full overflow-hidden">
                      <div
                        className="absolute h-full bg-green-500"
                        style={{ width: `${(stats.hitRatio * 100)}%` }}
                      />
                    </div>
                  </div>
                  <div className="bg-bolt-elements-background-depth-2 rounded-lg p-3">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-bolt-elements-textSecondary">Compression</span>
                      <span className="text-bolt-elements-textPrimary">
                        {(stats.compressionRatio * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="relative h-2 bg-bolt-elements-background-depth-3 rounded-full overflow-hidden">
                      <div
                        className="absolute h-full bg-purple-500"
                        style={{ width: `${(stats.compressionRatio * 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
                {stats.contextFiles && (
                  <div className="mt-4">
                    <h4 className="text-sm font-medium text-bolt-elements-textPrimary mb-2">Fichiers contextuels</h4>
                    <div className="bg-bolt-elements-background-depth-2 rounded-lg p-3 max-h-40 overflow-y-auto">
                      {stats.contextFiles.map((file, index) => (
                        <div key={index} className="text-sm text-bolt-elements-textSecondary py-1">
                          {file}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          
          
          
          {showConfigForm && (
<div className="mb-4 p-2 bg-bolt-elements-background-depth-3 rounded-md">
  <h4 className="text-sm font-medium text-bolt-elements-textPrimary mb-2">Configuration avancée</h4>
  <div className="grid gap-2">
    <div className="flex items-center gap-2">
      <input 
        type="number" 
        className="flex-1 bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor rounded px-2 py-1 text-sm"
        value={maxSizeInput}
        onChange={(e) => setMaxSizeInput(e.target.value)}
        placeholder={`Taille max: ${stats.maxSize}`}
      />
      <button 
        className="px-2 py-1 bg-bolt-elements-background-depth-3 text-white rounded-md text-xs hover:dark:bg-bolt-elements-background-depth-1"
        onClick={() => {
          const size = parseInt(maxSizeInput);
          if (!isNaN(size) && size > 0) {
            configureCache(size, undefined);
            setMaxSizeInput('');
          }
        }}
      >
        OK
      </button>
    </div>

    <div className="flex items-center gap-2">
      <input 
        type="number" 
        className="flex-1 bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor rounded px-2 py-1 text-sm"
        value={expiryInput}
        onChange={(e) => setExpiryInput(e.target.value)}
        placeholder={`Expiration: ${stats.defaultExpiryMs}ms`}
      />
      <button 
        className="px-2 py-1 bg-bolt-elements-background-depth-3 text-white rounded-md text-xs hover:dark:bg-bolt-elements-background-depth-1"
        onClick={() => {
          const expiry = parseInt(expiryInput);
          if (!isNaN(expiry) && expiry > 0) {
            configureCache(undefined, expiry);
            setExpiryInput('');
          }
        }}
      >
        OK
      </button>
    </div>

    {stats.autoCompressionThreshold !== undefined && (
      <select 
        className="w-full bg-bolt-elements-background-depth-1 text-white border border-bolt-elements-borderColor rounded px-2 py-1 text-sm"
        onChange={(e) => {
          const threshold = parseInt(e.target.value);
          if (!isNaN(threshold)) setCompressionThreshold(threshold);
        }}
        defaultValue={stats.autoCompressionThreshold}
      >
        <option value="1024">Seuil compression: 1 KB</option>
        <option value="5120">Seuil compression: 5 KB</option>
        <option value="10240">Seuil compression: 10 KB</option>
        <option value="51200">Seuil compression: 50 KB</option>
        <option value="102400">Seuil compression: 100 KB</option>
        <option value="512000">Seuil compression: 500 KB</option>
      </select>
    )}
  </div>
</div>
          )}
          
          <div className="flex flex-wrap gap-1 mt-2">
            <button
              className="px-2 py-1 bg-red-500 hover:bg-red-600 text-white rounded text-xs font-medium transition-colors duration-200 flex items-center gap-1 shadow-sm"
              onClick={clearCache}
              disabled={isLoading}
            >
              <div className="i-ph:trash-duotone text-base"></div>
              <span>Vider</span>
            </button>
            
            <button
              className={`px-2 py-1 ${stats.compressionEnabled ? 'bg-amber-500 hover:bg-amber-600' : 'bg-green-500 hover:bg-green-600'} text-white rounded text-xs font-medium transition-colors duration-200 flex items-center gap-1 shadow-sm`}
              onClick={() => toggleCompression(!stats.compressionEnabled)}
              disabled={isLoading}
            >
              <div className="i-ph:arrows-in-duotone text-base"></div>
              <span>Compresser</span>
            </button>

            <button
              className={`px-2 py-1 ${stats.adaptiveExpiryEnabled ? 'bg-amber-500 hover:bg-amber-600' : 'bg-green-500 hover:bg-green-600'} text-white rounded text-xs font-medium transition-colors duration-200 flex items-center gap-1 shadow-sm`}
              onClick={() => toggleAdaptiveExpiry(!stats.adaptiveExpiryEnabled)}
              disabled={isLoading}
            >
              <div className="i-ph:clock-countdown-duotone text-base"></div>
              <span>Adapter</span>
            </button>

            {stats.memoryMonitoringEnabled !== undefined && (
              <button
                className={`px-2 py-1 ${stats.memoryMonitoringEnabled ? 'bg-amber-500 hover:bg-amber-600' : 'bg-green-500 hover:bg-green-600'} text-white rounded text-xs font-medium transition-colors duration-200 flex items-center gap-1 shadow-sm`}
                onClick={() => toggleMemoryMonitoring(!stats.memoryMonitoringEnabled)}
                disabled={isLoading}
              >
                <div className="i-ph:chart-line-up-duotone text-base"></div>
                <span>Moniteur</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
