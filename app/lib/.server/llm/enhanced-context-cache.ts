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
}

// Configuration du cache
const CACHE_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes par défaut
const MAX_CACHE_SIZE = 100; // Nombre maximum d'entrées dans le cache

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

  private constructor() {
    this.cache = new Map<string, EnhancedContextCacheEntry>();
    this.maxSize = MAX_CACHE_SIZE;
    this.defaultExpiryMs = CACHE_EXPIRY_MS;
    // Nettoyer le cache périodiquement
    setInterval(() => this.cleanup(), CACHE_EXPIRY_MS / 2);
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

    // Si le cache est plein, supprimer l'entrée la plus ancienne
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.getOldestEntry();
      if (oldestKey) {
        this.cache.delete(oldestKey);
        logger.info(`Cache plein, suppression de l'entrée la plus ancienne: ${oldestKey}`);
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
        
        logger.info(`Données compressées: ${originalSize} -> ${compressedSize} bytes (${(compressedSize / originalSize * 100).toFixed(2)}%)`);
      } catch (error) {
        logger.error(`Erreur lors de la compression: ${error}`);
        entry.compressed = false;
      }
    }

    this.cache.set(key, entry);

    logger.info(`Contexte mis en cache avec la clé: ${key}, expire dans ${expiry / 1000}s`);
  }

  /**
   * Récupère le contexte depuis le cache
   */
  public get(key: string): { contextFiles: FileMap; summary?: string } | null {
    const startTime = performance.now();
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.misses++;
      logger.info(`Cache miss pour la clé: ${key}`);
      return null;
    }

    // Vérifier si l'entrée a expiré
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.misses++;
      logger.info(`Entrée de cache expirée: ${key}`);
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
      logger.info(`Expiration adaptative: durée prolongée à ${newExpiry / 1000}s pour la clé ${key}`);
    }
    
    this.cache.set(key, entry);
    this.hits++;

    const endTime = performance.now();
    const accessTime = endTime - startTime;
    this.totalAccessTime += accessTime;
    this.accessCount++;

    logger.info(`Cache hit pour la clé: ${key} en ${accessTime.toFixed(2)}ms`);
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
      accessCount: this.accessCount
    };
  }
}

export const enhancedContextCache = EnhancedContextCache.getInstance();
