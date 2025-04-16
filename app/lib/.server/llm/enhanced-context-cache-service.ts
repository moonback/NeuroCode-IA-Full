import { createScopedLogger } from '~/utils/logger';
import type { FileMap } from './constants';

const logger = createScopedLogger('enhanced-context-cache');

// Interface pour les statistiques d'appel LLM
export interface LLMCallStats {
  modelName: string;
  timestamp: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  summarized: boolean;
  summaryMessageCount?: number;
}

// Structure de l'entrée de cache améliorée
interface EnhancedContextCacheEntry {
  timestamp: number;
  contextFiles: FileMap;
  summary?: string;
  expiresAt: number;
  size: number;
  compressed?: boolean;
  originalSize?: number;
  accessCount: number;
  lastAccessTime: number;
  totalAccessTime: number;
}

// Configuration du cache amélioré
const ENHANCED_CACHE_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes par défaut
const MAX_ENHANCED_CACHE_SIZE = 100; // Nombre maximum d'entrées dans le cache
const DEFAULT_COMPRESSION_THRESHOLD = 10 * 1024; // 10KB

// Cache en mémoire amélioré pour stocker le contexte
class EnhancedContextCache {
  private static instance: EnhancedContextCache;
  private cache: Map<string, EnhancedContextCacheEntry>;
  private maxSize: number;
  private defaultExpiryMs: number;
  private hits: number = 0;
  private misses: number = 0;
  private compressionEnabled: boolean = false;
  private adaptiveExpiryEnabled: boolean = false;
  private memoryMonitoringEnabled: boolean = false;
  private autoCompressionThreshold: number = DEFAULT_COMPRESSION_THRESHOLD;
  private llmCalls: LLMCallStats[] = [];

  private constructor() {
    this.cache = new Map<string, EnhancedContextCacheEntry>();
    this.maxSize = MAX_ENHANCED_CACHE_SIZE;
    this.defaultExpiryMs = ENHANCED_CACHE_EXPIRY_MS;
    // Nettoyer le cache périodiquement
    setInterval(() => this.cleanup(), ENHANCED_CACHE_EXPIRY_MS);
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
   * Stocke le contexte dans le cache
   */
  public set(key: string, value: { contextFiles: FileMap; summary?: string }, expiryMs?: number): void {
    this.cleanup(); // Nettoyer le cache avant d'ajouter une nouvelle entrée

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
    const size = this.calculateSize(value.contextFiles, value.summary);
    let entry: EnhancedContextCacheEntry = {
      timestamp: now,
      contextFiles: value.contextFiles,
      summary: value.summary,
      expiresAt: now + expiry,
      size,
      accessCount: 0,
      lastAccessTime: now,
      totalAccessTime: 0
    };

    // Compression si activée et taille supérieure au seuil
    if (this.compressionEnabled && size > this.autoCompressionThreshold) {
      entry = this.compressEntry(entry);
    }

    this.cache.set(key, entry);

    logger.debug(`Contexte mis en cache avec la clé: ${key}, expire dans ${expiry / 1000}s, taille: ${size} bytes`);
  }

  /**
   * Récupère le contexte depuis le cache
   */
  public get(key: string): { contextFiles: FileMap; summary?: string } | null {
    const startTime = Date.now();
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

    // Décompresser si nécessaire
    const decompressedEntry = entry.compressed ? this.decompressEntry(entry) : entry;

    // Mettre à jour les statistiques d'accès
    const accessTime = Date.now() - startTime;
    decompressedEntry.accessCount++;
    decompressedEntry.lastAccessTime = Date.now();
    decompressedEntry.totalAccessTime += accessTime;

    // Mettre à jour le timestamp pour la politique LRU
    decompressedEntry.timestamp = Date.now();
    this.cache.set(key, decompressedEntry);

    // Mettre à jour les statistiques globales
    this.hits++;

    // Ajuster l'expiration si l'expiration adaptative est activée
    if (this.adaptiveExpiryEnabled) {
      this.adjustExpiry(key, decompressedEntry);
    }

    logger.debug(`Contexte récupéré depuis le cache avec la clé: ${key}, temps d'accès: ${accessTime}ms`);
    return {
      contextFiles: decompressedEntry.contextFiles,
      summary: decompressedEntry.summary,
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
    logger.debug('Cache amélioré vidé');
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
      logger.debug(`Nettoyage du cache amélioré: ${expiredCount} entrées expirées supprimées`);
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
   * Calcule la taille approximative d'une entrée de cache
   */
  private calculateSize(contextFiles: FileMap, summary?: string): number {
    let size = 0;
    
    // Calculer la taille des fichiers de contexte
    for (const [path, content] of Object.entries(contextFiles)) {
      size += path.length;
      size += Buffer.from(String(content)).length;
    }
    
    // Ajouter la taille du résumé s'il existe
    if (summary) {
      size += summary.length;
    }
    
    return size;
  }

  /**
   * Compresse une entrée de cache
   */
  private compressEntry(entry: EnhancedContextCacheEntry): EnhancedContextCacheEntry {
    // Simulation de compression (dans une implémentation réelle, utiliser une bibliothèque de compression)
    const originalSize = entry.size;
    
    // Stocker la taille originale pour les statistiques
    return {
      ...entry,
      compressed: true,
      originalSize
    };
  }

  /**
   * Décompresse une entrée de cache
   */
  private decompressEntry(entry: EnhancedContextCacheEntry): EnhancedContextCacheEntry {
    // Simulation de décompression
    return {
      ...entry,
      compressed: false
    };
  }

  /**
   * Ajuste la durée d'expiration en fonction de la fréquence d'accès
   */
  private adjustExpiry(key: string, entry: EnhancedContextCacheEntry): void {
    // Plus une entrée est accédée fréquemment, plus sa durée de vie est prolongée
    const accessFactor = Math.min(entry.accessCount, 10) / 10; // Limiter à un facteur de 1
    const additionalTime = this.defaultExpiryMs * accessFactor;
    
    entry.expiresAt = Math.max(entry.expiresAt, Date.now() + additionalTime);
    logger.debug(`Expiration ajustée pour la clé ${key}: +${additionalTime / 1000}s`);
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
  public setAutoCompressionThreshold(threshold: number): void {
    this.autoCompressionThreshold = threshold;
  }

  /**
   * Retourne des statistiques sur le cache
   */
  public getStats() {
    let totalOriginalSize = 0;
    let totalCompressedSize = 0;
    let compressedEntries = 0;
    const contextFiles: string[] = [];
    
    for (const entry of this.cache.values()) {
      if (entry.compressed && entry.originalSize) {
        totalOriginalSize += entry.originalSize;
        totalCompressedSize += entry.size;
        compressedEntries++;
      }
      
      // Collecter les chemins de fichiers uniques dans le cache
      Object.keys(entry.contextFiles).forEach(path => {
        if (!contextFiles.includes(path)) {
          contextFiles.push(path);
        }
      });
    }
    
    const totalAccesses = this.hits + this.misses;
    const hitRatio = totalAccesses > 0 ? this.hits / totalAccesses : 0;
    const compressionRatio = totalOriginalSize > 0 ? 1 - (totalCompressedSize / totalOriginalSize) : 0;
    
    // Calculer le temps d'accès moyen
    let totalAccessTime = 0;
    let accessCount = 0;
    
    for (const entry of this.cache.values()) {
      totalAccessTime += entry.totalAccessTime;
      accessCount += entry.accessCount;
    }
    
    const averageAccessTime = accessCount > 0 ? totalAccessTime / accessCount : 0;
    
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
      totalAccessTime,
      accessCount,
      memoryMonitoringEnabled: this.memoryMonitoringEnabled,
      totalOriginalSize,
      totalCompressedSize,
      compressedEntries,
      autoCompressionThreshold: this.autoCompressionThreshold,
      contextFiles,
      llmCalls: this.llmCalls
    };
  }
}

// Exporter l'instance singleton
export const enhancedContextCache = EnhancedContextCache.getInstance();
