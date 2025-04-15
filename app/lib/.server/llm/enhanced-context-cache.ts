import { createScopedLogger } from '~/utils/logger';
import type { FileMap } from './constants';
import pkg from 'pako';
const {gzip, ungzip} = pkg;
const logger = createScopedLogger('enhanced-context-cache');

// Structure de l'entrée de cache amélioré
interface EnhancedContextCacheEntry {
  timestamp: number;
  contextFiles: FileMap;
  summary?: string;
  expiresAt: number;
  accessCount: number;
  lastAccessed: number;
  compressed?: boolean;
  originalSize?: number;
  compressedSize?: number;
}

// Statistiques du cache
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
  memoryMonitoringEnabled: boolean;
  totalOriginalSize: number;
  totalCompressedSize: number;
  compressedEntries: number;
  autoCompressionThreshold: number;
}

// Configuration du cache
const CACHE_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes par défaut
const MAX_CACHE_SIZE = 100; // Nombre maximum d'entrées dans le cache
const MEMORY_USAGE_THRESHOLD = 0.8; // Seuil d'utilisation mémoire (80%)
const COMPRESSION_THRESHOLD = 10 * 1024; // Taille minimale pour compression (10KB)

// Cache en mémoire amélioré pour stocker le contexte
class EnhancedContextCache {
  private static instance: EnhancedContextCache;
  private cache: Map<string, EnhancedContextCacheEntry>;
  private maxSize: number;
  private defaultExpiryMs: number;
  private hits: number = 0;
  private misses: number = 0;
  private compressionEnabled: boolean = true;
  private adaptiveExpiryEnabled: boolean = true;
  private totalAccessTime: number = 0;
  private accessCount: number = 0;
  private memoryMonitoringEnabled: boolean = true;
  private lastMemoryCheck: number = 0;
  private memoryCheckInterval: number = 60 * 1000; // 1 minute
  private autoCompressionThreshold: number = COMPRESSION_THRESHOLD;

  private constructor() {
    this.cache = new Map<string, EnhancedContextCacheEntry>();
    this.maxSize = MAX_CACHE_SIZE;
    this.defaultExpiryMs = CACHE_EXPIRY_MS;
    // Nettoyer le cache périodiquement
    setInterval(() => this.cleanup(), CACHE_EXPIRY_MS / 2);
    // Vérifier l'utilisation de la mémoire périodiquement
    if (this.memoryMonitoringEnabled) {
      setInterval(() => this.checkMemoryUsage(), this.memoryCheckInterval);
    }
  }

  public static getInstance(): EnhancedContextCache {
    if (!EnhancedContextCache.instance) {
      EnhancedContextCache.instance = new EnhancedContextCache();
    }
    return EnhancedContextCache.instance;
  }

  /**
   * Génère une clé de cache basée sur les messages et les fichiers
   */
  public generateCacheKey(params: {
    promptId?: string;
    messageIds: string[];
    filePaths: string[];
  }): string {
    const { promptId, messageIds, filePaths } = params;
    // Utiliser les 3 derniers messages pour la clé de cache
    const lastMessageIds = messageIds.slice(-3);
    // Trier les chemins de fichiers pour assurer la cohérence
    const sortedFilePaths = [...filePaths].sort();
    
    return JSON.stringify({
      promptId,
      messageIds: lastMessageIds,
      filePaths: sortedFilePaths,
    });
  }

  /**
   * Compresse les données du contexte
   */
  private compressData(data: FileMap): { compressed: Uint8Array; originalSize: number; compressedSize: number } {
    const serialized = JSON.stringify(data);
    const originalSize = serialized.length;
    
    // Ne compresser que si la taille dépasse le seuil
    if (originalSize < this.autoCompressionThreshold && !this.isMemoryPressureHigh()) {
      return { compressed: new TextEncoder().encode(serialized), originalSize, compressedSize: originalSize };
    }
    
    const compressed = gzip(serialized);
    const compressedSize = compressed.length;
    
    return { compressed, originalSize, compressedSize };
  }

  /**
   * Décompresse les données du contexte
   */
  private decompressData(compressed: Uint8Array): FileMap {
    const decompressed = ungzip(compressed);
    const text = new TextDecoder().decode(decompressed);
    return JSON.parse(text);
  }

  /**
   * Stocke le contexte dans le cache
   */
  public set(key: string, value: { contextFiles: FileMap; summary?: string }, expiryMs?: number): void {
    this.cleanup(); // Nettoyer le cache avant d'ajouter une nouvelle entrée

    // Vérifier la pression mémoire avant d'ajouter une entrée
    if (this.memoryMonitoringEnabled) {
      this.checkMemoryUsage();
    }

    // Si le cache est plein, supprimer l'entrée la plus ancienne
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.getOldestEntry();
      if (oldestKey) {
        this.cache.delete(oldestKey);
        logger.debug(`Cache plein, suppression de l'entrée la plus ancienne: ${oldestKey}`);
      }
    }

    const expiry = expiryMs || this.defaultExpiryMs;
    const now = Date.now();

    let entry: EnhancedContextCacheEntry = {
      timestamp: now,
      contextFiles: value.contextFiles,
      summary: value.summary,
      expiresAt: now + expiry,
      accessCount: 0,
      lastAccessed: now,
    };

    // Compresser les données si activé
    if (this.compressionEnabled) {
      try {
        const { compressed, originalSize, compressedSize } = this.compressData(value.contextFiles);
        entry.contextFiles = {} as FileMap; // Libérer la mémoire
        entry.compressed = true;
        entry.originalSize = originalSize;
        entry.compressedSize = compressedSize;
        // Stocker les données compressées dans une propriété non typée
        (entry as any).compressedData = compressed;
        
        logger.debug(`Données compressées: ${originalSize} -> ${compressedSize} bytes (${(compressedSize / originalSize * 100).toFixed(2)}%)`);
      } catch (error) {
        logger.error(`Erreur lors de la compression: ${error}`);
        entry.compressed = false;
      }
    }

    this.cache.set(key, entry);

    logger.debug(`Contexte mis en cache avec la clé: ${key}, expire dans ${expiry / 1000}s`);
  }

  /**
   * Récupère le contexte depuis le cache
   */
  public get(key: string): { contextFiles: FileMap; summary?: string } | null {
    const startTime = performance.now();
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.misses++;
      return null;
    }

    // Vérifier si l'entrée a expiré
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.misses++;
      logger.debug(`Entrée de cache expirée: ${key}`);
      return null;
    }

    // Décompresser les données si nécessaire
    let contextFiles: FileMap;
    if (entry.compressed) {
      try {
        contextFiles = this.decompressData((entry as any).compressedData);
      } catch (error) {
        logger.error(`Erreur lors de la décompression: ${error}`);
        this.cache.delete(key);
        this.misses++;
        return null;
      }
    } else {
      contextFiles = entry.contextFiles;
    }

    // Mettre à jour les statistiques d'accès
    entry.accessCount++;
    entry.lastAccessed = Date.now();
    
    // Mettre à jour le timestamp pour la politique LRU
    entry.timestamp = Date.now();
    
    // Ajuster la durée d'expiration si l'expiration adaptative est activée
    if (this.adaptiveExpiryEnabled) {
      // Plus une entrée est accédée, plus sa durée de vie est prolongée
      const accessBonus = Math.min(entry.accessCount * 0.1, 2.0); // Maximum 2x la durée initiale
      const newExpiry = this.defaultExpiryMs * (1 + accessBonus);
      entry.expiresAt = Date.now() + newExpiry;
      logger.debug(`Expiration adaptative: durée prolongée à ${newExpiry / 1000}s pour la clé ${key}`);
    }
    
    this.cache.set(key, entry);
    this.hits++;

    const endTime = performance.now();
    const accessTime = endTime - startTime;
    this.totalAccessTime += accessTime;
    this.accessCount++;

    logger.debug(`Contexte récupéré depuis le cache avec la clé: ${key} en ${accessTime.toFixed(2)}ms`);
    return {
      contextFiles,
      summary: entry.summary,
    };
  }

  /**
   * Supprime une entrée du cache
   */
  public delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Vide le cache
   */
  public clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
    this.totalAccessTime = 0;
    this.accessCount = 0;
    logger.debug('Cache vidé');
  }

  /**
   * Nettoie les entrées expirées du cache
   */
  private cleanup(): void {
    const now = Date.now();
    let expiredCount = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        expiredCount++;
      }
    }

    if (expiredCount > 0) {
      logger.debug(`Nettoyage du cache: ${expiredCount} entrées expirées supprimées`);
    }
  }

  /**
   * Vérifie l'utilisation de la mémoire et nettoie le cache si nécessaire
   */
  private checkMemoryUsage(): void {
    // Éviter les vérifications trop fréquentes
    const now = Date.now();
    if (now - this.lastMemoryCheck < this.memoryCheckInterval) {
      return;
    }
    this.lastMemoryCheck = now;

    if (this.isMemoryPressureHigh()) {
      logger.warn('Pression mémoire élevée détectée, nettoyage du cache');
      this.reduceMemoryFootprint();
    }
  }

  /**
   * Vérifie si la pression mémoire est élevée
   */
  private isMemoryPressureHigh(): boolean {
    // Cette fonction est une approximation, car nous n'avons pas accès à la mémoire réelle dans le navigateur
    // Dans un environnement Node.js, on pourrait utiliser process.memoryUsage()
    if (typeof performance !== 'undefined' && performance.memory) {
      const memoryInfo = performance.memory as any;
      if (memoryInfo.usedJSHeapSize && memoryInfo.jsHeapSizeLimit) {
        const memoryUsage = memoryInfo.usedJSHeapSize / memoryInfo.jsHeapSizeLimit;
        return memoryUsage > MEMORY_USAGE_THRESHOLD;
      }
    }
    
    // Si on ne peut pas vérifier la mémoire, on se base sur la taille du cache
    return this.cache.size > this.maxSize * 0.9; // 90% de la taille max
  }

  /**
   * Réduit l'empreinte mémoire du cache
   */
  private reduceMemoryFootprint(): void {
    // Stratégie 1: Supprimer les entrées les moins utilisées
    if (this.cache.size > this.maxSize / 2) {
      const entries = Array.from(this.cache.entries());
      // Trier par nombre d'accès (croissant)
      entries.sort((a, b) => a[1].accessCount - b[1].accessCount);
      // Supprimer 25% des entrées les moins utilisées
      const toRemove = Math.ceil(entries.length * 0.25);
      for (let i = 0; i < toRemove; i++) {
        if (entries[i]) {
          this.cache.delete(entries[i][0]);
        }
      }
      logger.debug(`Réduction empreinte mémoire: ${toRemove} entrées supprimées`);
    }

    // Stratégie 2: Forcer la compression des entrées non compressées
    for (const [key, entry] of this.cache.entries()) {
      if (!entry.compressed && entry.contextFiles && Object.keys(entry.contextFiles).length > 0) {
        try {
          const { compressed, originalSize, compressedSize } = this.compressData(entry.contextFiles);
          entry.contextFiles = {} as FileMap;
          entry.compressed = true;
          entry.originalSize = originalSize;
          entry.compressedSize = compressedSize;
          (entry as any).compressedData = compressed;
        } catch (error) {
          // En cas d'erreur, on supprime simplement l'entrée
          this.cache.delete(key);
        }
      }
    }
  }

  /**
   * Récupère la clé de l'entrée la plus ancienne (pour la politique LRU)
   */
  private getOldestEntry(): string | null {
    if (this.cache.size === 0) {
      return null;
    }

    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldestKey = key;
      }
    }

    return oldestKey;
  }

  /**
   * Configure la taille maximale du cache
   */
  public setMaxSize(size: number): void {
    this.maxSize = size;
    this.cleanup();
  }

  /**
   * Configure la durée d'expiration par défaut
   */
  public setDefaultExpiry(expiryMs: number): void {
    this.defaultExpiryMs = expiryMs;
  }

  /**
   * Active ou désactive la compression
   */
  public setCompressionEnabled(enabled: boolean): void {
    this.compressionEnabled = enabled;
  }

  /**
   * Active ou désactive l'expiration adaptative
   */
  public setAdaptiveExpiryEnabled(enabled: boolean): void {
    this.adaptiveExpiryEnabled = enabled;
  }

  /**
   * Active ou désactive la surveillance de la mémoire
   */
  public setMemoryMonitoringEnabled(enabled: boolean): void {
    this.memoryMonitoringEnabled = enabled;
  }

  /**
   * Configure le seuil de compression automatique
   */
  public setAutoCompressionThreshold(bytes: number): void {
    this.autoCompressionThreshold = bytes;
  }

  /**
   * Retourne des statistiques détaillées sur le cache
   */
  public getStats(): CacheStats {
    let totalOriginalSize = 0;
    let totalCompressedSize = 0;
    let compressedEntries = 0;

    for (const entry of this.cache.values()) {
      if (entry.compressed && entry.originalSize && entry.compressedSize) {
        totalOriginalSize += entry.originalSize;
        totalCompressedSize += entry.compressedSize;
        compressedEntries++;
      }
    }

    const compressionRatio = compressedEntries > 0 ? 1 - (totalCompressedSize / totalOriginalSize) : 0;
    const hitRatio = (this.hits + this.misses) > 0 ? this.hits / (this.hits + this.misses) : 0;
    const averageAccessTime = this.accessCount > 0 ? this.totalAccessTime / this.accessCount : 0;

    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      defaultExpiryMs: this.defaultExpiryMs,
      hits: this.hits,
      misses: this.misses,
      hitRatio,
      compressionEnabled: this.compressionEnabled,
      adaptiveExpiryEnabled: this.adaptiveExpiryEnabled,
      compressionRatio,
      averageAccessTime,
      totalAccessTime: this.totalAccessTime,
      accessCount: this.accessCount,
      memoryMonitoringEnabled: this.memoryMonitoringEnabled,
      totalOriginalSize,
      totalCompressedSize,
      compressedEntries,
      autoCompressionThreshold: this.autoCompressionThreshold
    };
  }
}

export const enhancedContextCache = EnhancedContextCache.getInstance();
