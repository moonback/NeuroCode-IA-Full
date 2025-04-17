import { createScopedLogger } from '~/utils/logger';
import type { FileMap } from './constants';
import pako from 'pako';

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
const ENHANCED_CACHE_EXPIRY_MS = 30 * 60 * 1000; // 30 minutes par défaut
const MAX_ENHANCED_CACHE_SIZE = 200; // Augmentation du nombre maximum d'entrées
const DEFAULT_COMPRESSION_THRESHOLD = 512; // 512 bytes - Seuil de compression plus agressif
const MIN_COMPRESSION_RATIO = 0.5; // Ratio minimum pour conserver la compression

// Cache en mémoire amélioré pour stocker le contexte
class EnhancedContextCache {
  debugCacheKeysDetailed() {
    throw new Error('Method not implemented.');
  }
  private static instance: EnhancedContextCache;
  private cache: Map<string, EnhancedContextCacheEntry>;
  private maxSize: number;
  private defaultExpiryMs: number;
  private hits: number = 0;
  private misses: number = 0;
  private compressionEnabled: boolean = true;
  private adaptiveExpiryEnabled: boolean = true;
  private memoryMonitoringEnabled: boolean = true;
  private autoCompressionThreshold: number = DEFAULT_COMPRESSION_THRESHOLD;
  private llmCalls: LLMCallStats[] = [];
  private compressionStats = {
    successCount: 0,
    failureCount: 0,
    totalSavedBytes: 0,
    averageCompressionRatio: 0
  };

  private constructor() {
    this.cache = new Map<string, EnhancedContextCacheEntry>();
    this.maxSize = MAX_ENHANCED_CACHE_SIZE;
    this.defaultExpiryMs = ENHANCED_CACHE_EXPIRY_MS;
    // Nettoyer le cache périodiquement et vérifier la compression
    setInterval(() => {
      this.cleanup();
      // Vérifier et ajuster le seuil de compression si nécessaire
      if (this.compressionEnabled) {
        const stats = this.getStats();
        if (stats.compressionRatio < 0.1) { // Si le ratio de compression est faible
          this.autoCompressionThreshold = Math.max(1024, this.autoCompressionThreshold / 2); // Réduire le seuil
        }
      }
    }, ENHANCED_CACHE_EXPIRY_MS);
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
  private hashString(str: string): string {
    // Utiliser un algorithme plus robuste pour réduire les collisions
    let hash = 0;
    const prime = 31;
    
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = Math.imul(hash, prime) + char;
    }
    
    // Convertir en base 36 pour une représentation plus compacte
    return Math.abs(hash).toString(36);
  }

  public generateCacheKey(params: {
    promptId?: string;
    messageIds: string[];
    filePaths: string[];
  }): string {
    const { promptId, messageIds, filePaths } = params;
    
    // Normaliser les IDs de messages pour une meilleure correspondance
    const normalizedMessageIds = messageIds
      .filter(id => id && id.trim().length > 0)
      .map(id => id.trim())
      .slice(-3); // Garder les 3 derniers messages
    
    // Normaliser et trier les chemins de fichiers
    // Convertir tous les séparateurs de chemin en format uniforme (/ au lieu de \)
    const normalizedFilePaths = filePaths
      .filter(path => path && path.trim().length > 0)
      .map(path => path.trim().toLowerCase().replace(/\\/g, '/'))
      .sort();
    
    // Créer un hash stable pour les chemins de fichiers
    // Utiliser un hash plus simple basé sur le nombre de fichiers et leur longueur totale
    // pour éviter les variations entre les appels
    const fileCount = normalizedFilePaths.length;
    const filePathsSignature = fileCount > 0 
      ? `${fileCount}-${this.hashString(normalizedFilePaths[0] || '')}`
      : '0';
    
    // Créer une clé de cache simplifiée
    const cacheKey = {
      promptId: promptId?.trim() || "default",
      messageIds: normalizedMessageIds,
      fileCount: fileCount,
      filePathsSignature
    };
    
    const cacheKeyStr = JSON.stringify(cacheKey);
    
    logger.debug(`Clé de cache générée: ${cacheKeyStr} (basée sur ${messageIds.length} messages et ${filePaths.length} fichiers)`);
    
    return cacheKeyStr;
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

    // Vérifier si la clé existe déjà (mise à jour vs nouvelle entrée)
    const isUpdate = this.cache.has(key);
    this.cache.set(key, entry);

    logger.debug(
      `Contexte ${isUpdate ? 'mis à jour' : 'ajouté'} dans le cache - ` +
      `Clé: ${key.substring(0, 30)}..., ` +
      `Expire dans: ${expiry / 1000}s, ` +
      `Taille: ${size} bytes, ` +
      `Total entrées: ${this.cache.size}/${this.maxSize}`
    );
  }

  /**
   * Récupère le contexte depuis le cache
   */
  public get(key: string): { contextFiles: FileMap; summary?: string } | null {
    const startTime = Date.now();
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.misses++;
      logger.debug(`Cache miss - Clé: ${key.substring(0, 30)}..., Total misses: ${this.misses}`);
      return null;
    }

    // Vérifier si l'entrée a expiré
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.misses++;
      logger.debug(`Entrée de cache expirée - Clé: ${key.substring(0, 30)}..., Total misses: ${this.misses}`);
      return null;
    }

    // Décompresser si nécessaire
    const decompressedEntry = entry.compressed ? this.decompressEntry(entry) : entry;

    // Mettre à jour les statistiques d'accès de manière atomique
    const now = Date.now();
    const accessTime = now - startTime;
    
    // Mettre à jour les compteurs d'accès
    decompressedEntry.accessCount = (decompressedEntry.accessCount || 0) + 1;
    decompressedEntry.lastAccessTime = now;
    decompressedEntry.totalAccessTime = (decompressedEntry.totalAccessTime || 0) + accessTime;
    decompressedEntry.timestamp = now; // Mise à jour pour LRU
    
    // Mettre à jour les statistiques globales
    this.hits++;
    
    // Sauvegarder les modifications dans le cache
    this.cache.set(key, decompressedEntry);
    
    // Ajuster l'expiration si l'expiration adaptative est activée
    if (this.adaptiveExpiryEnabled) {
      this.adjustExpiry(key, decompressedEntry);
    }
    
    logger.debug(
      `Cache hit - ` +
      `Clé: ${key.substring(0, 30)}..., ` +
      `Temps d'accès: ${accessTime}ms, ` +
      `Accès #${decompressedEntry.accessCount}, ` +
      `Total hits: ${this.hits}, ` +
      `Ratio: ${(this.hits / (this.hits + this.misses)).toFixed(2)}`
    );

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
    try {
      // Vérifier si la compression est activée et si l'entrée n'est pas déjà compressée
      if (!this.compressionEnabled || entry.compressed) {
        logger.debug('Compression désactivée ou entrée déjà compressée');
        return entry;
      }

      const originalSize = entry.size;
      
      // Vérifier si la taille est suffisante pour justifier la compression
      if (originalSize <= this.autoCompressionThreshold) {
        logger.debug(`Taille (${originalSize} bytes) inférieure au seuil de compression (${this.autoCompressionThreshold} bytes), compression ignorée`);
        return entry;
      }

      // Vérifier si les données sont valides pour la compression
      if (!entry.contextFiles || Object.keys(entry.contextFiles).length === 0) {
        logger.debug('Données invalides pour la compression');
        return entry;
      }

      // Préparer les données pour la compression
      const dataToCompress = {
        contextFiles: entry.contextFiles,
        summary: entry.summary || ''
      };
      
      // Sérialiser les données avec gestion d'erreur
      let serializedData: string;
      try {
        serializedData = JSON.stringify(dataToCompress);
      } catch (serializationError) {
        logger.error(`Erreur lors de la sérialisation des données: ${serializationError}`);
        return entry;
      }
      
      // Convertir en Uint8Array et compresser avec pako
      const originalData = new TextEncoder().encode(serializedData);
      
      // Utiliser pako.deflate pour la compression
      let compressedData = pako.deflate(originalData, { 
        level: 9 // Niveau de compression maximal
      });
      
      let compressedSize = compressedData.length;
      let compressionRatio = (1 - compressedSize/originalSize) * 100;
      
      // Vérifier si la compression est suffisamment efficace
      if (compressionRatio <= MIN_COMPRESSION_RATIO) {
        logger.debug(`Compression insuffisante (ratio: ${compressionRatio.toFixed(2)}%), minimum requis: ${MIN_COMPRESSION_RATIO * 100}%`);
        this.compressionStats.failureCount++;
        // Essayer une compression plus agressive si le ratio est insuffisant
        const compressedDataAggressive = pako.deflate(originalData, { 
          level: 9,
          strategy: 2 // Z_HUFFMAN_ONLY
        });
        
        const compressedSizeAggressive = compressedDataAggressive.length;
        const compressionRatioAggressive = (1 - compressedSizeAggressive/originalSize) * 100;
        
        if (compressionRatioAggressive > MIN_COMPRESSION_RATIO) {
          // Utiliser la compression plus agressive si elle donne un meilleur ratio
          compressedData = compressedDataAggressive;
          compressedSize = compressedSizeAggressive;
          compressionRatio = compressionRatioAggressive;
        } else {
          return entry;
        }
      }

      // Mettre à jour les statistiques de compression
      this.compressionStats.successCount++;
      this.compressionStats.totalSavedBytes += (originalSize - compressedSize);
      this.compressionStats.averageCompressionRatio = (
        (this.compressionStats.averageCompressionRatio * (this.compressionStats.successCount - 1) + compressionRatio) /
        this.compressionStats.successCount
      );
      
      // Convertir les données compressées
      // Convertir les données compressées en base64
      const compressedBase64 = Buffer.from(compressedData).toString('base64');

      const compressedContextFiles = {
        _compressed: compressedBase64,
        _originalSize: originalSize,
        _compressionRatio: compressionRatio
      } as unknown as FileMap;
      
      logger.debug(`Compression réussie - Taille originale: ${originalSize}, Taille compressée: ${compressedSize}, Ratio: ${compressionRatio.toFixed(2)}%`);
      
      return {
        ...entry,
        contextFiles: compressedContextFiles,
        summary: entry.summary,
        compressed: true,
        originalSize,
        size: compressedSize
      };
    } catch (error) {
      logger.error(`Erreur lors de la compression: ${error}`);
      return entry;
    }
  }

  /**
   * Décompresse une entrée de cache
   */
  private decompressEntry(entry: EnhancedContextCacheEntry): EnhancedContextCacheEntry {
    if (!entry.compressed) return entry;
    
    try {
      // Vérifier la validité des données compressées
      const compressedData = (entry.contextFiles as any)?._compressed;
      if (!compressedData || typeof compressedData !== 'string') {
        throw new Error('Format des données compressées invalide');
      }

      // Récupérer les métadonnées de compression
      const originalSize = (entry.contextFiles as any)._originalSize;
      const compressionRatio = (entry.contextFiles as any)._compressionRatio;
      
      if (!originalSize) {
        throw new Error('Taille originale manquante');
      }

      // Décompresser les données avec pako et gestion d'erreur
      let decompressedData: Uint8Array;
      try {
        const compressedBuffer = Buffer.from(compressedData, 'base64');
        decompressedData = pako.inflate(compressedBuffer);
      } catch (decompressionError) {
        throw new Error(`Erreur lors de la décompression avec pako: ${decompressionError instanceof Error ? decompressionError.message : String(decompressionError)}`);
      }
      
      // Parser les données décompressées
      let parsedData: { contextFiles: FileMap; summary?: string };
      try {
        const decompressedString = new TextDecoder().decode(decompressedData);
        parsedData = JSON.parse(decompressedString);
      } catch (parseError) {
        throw new Error(`Erreur lors du parsing des données décompressées: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
      }
      
      // Valider la structure des données
      if (!parsedData?.contextFiles || typeof parsedData.contextFiles !== 'object') {
        throw new Error('Structure des données décompressées invalide');
      }

      logger.debug(
        `Décompression réussie - ` +
        `Taille originale: ${originalSize} bytes, ` +
        `Taille compressée: ${entry.size} bytes, ` +
        `Ratio: ${compressionRatio?.toFixed(2)}%, ` +
        `Taille décompressée: ${decompressedData.length} bytes`
      );
      
      return {
        ...entry,
        contextFiles: parsedData.contextFiles,
        summary: parsedData.summary,
        compressed: false,
        size: originalSize
      };

    } catch (error) {
      logger.error(`Erreur lors de la décompression: ${error}`);
      return entry;
    }
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
   * Affiche les clés actuellement dans le cache (pour le débogage)
   */
public debugCacheKeys(): void {
  logger.debug(`==== CACHE KEYS DEBUG (${this.cache.size} entrées) ====`);
  let i = 0;
  for (const key of this.cache.keys()) {
    const entry = this.cache.get(key)!;
    logger.debug(
      `[${i++}] Clé: ${key.substring(0, 50)}..., ` +
      `Accès: ${entry.accessCount}, ` +
      `Âge: ${Math.round((Date.now() - entry.timestamp) / 1000)}s, ` +
      `Expire dans: ${Math.round((entry.expiresAt - Date.now()) / 1000)}s`
    );
  }
  logger.debug(`=======================================`);
}
/**
   * Ajoute une méthode pour diagnostiquer les problèmes de cache
   */
public diagnoseCache(): void {
  logger.debug(`==== DIAGNOSTIC DU CACHE ====`);
  logger.debug(`Taille du cache: ${this.cache.size}/${this.maxSize}`);
  logger.debug(`Hits: ${this.hits}, Misses: ${this.misses}`);
  logger.debug(`Ratio de hits: ${this.hits + this.misses > 0 ? (this.hits / (this.hits + this.misses) * 100).toFixed(2) : 0}%`);
  
  // Vérifier si le cache est vide
  if (this.cache.size === 0) {
    logger.debug(`Le cache est vide. Vérifiez si clear() est appelé quelque part ou si les entrées expirent trop rapidement.`);
  } else {
    // Afficher quelques exemples de clés
    logger.debug(`Exemples de clés dans le cache:`);
    let count = 0;
    for (const key of this.cache.keys()) {
      if (count < 3) { // Limiter à 3 exemples
        logger.debug(`- ${key}`);
        count++;
      } else {
        break;
      }
    }
  }
  
  logger.debug(`============================`);
}
/**
   * Méthode de test pour vérifier le fonctionnement du cache
   */
  public testCacheHit(): void {
    // Créer une clé de test
    const testKey = JSON.stringify({
      promptId: "test",
      messageIds: ["test1", "test2"],
      fileCount: 1,
      filePathsSignature: "1-test"
    });
    
    const testData = {
      contextFiles: { "test.txt": "Contenu de test" } as unknown as FileMap,
      summary: "Résumé de test"
    };
    
    // Stocker dans le cache
    this.set(testKey, testData);
    logger.debug(`Test: Données stockées dans le cache avec la clé ${testKey}`);
    
    // Récupérer du cache (première fois)
    const cachedData1 = this.get(testKey);
    
    if (cachedData1) {
      logger.debug(`Test: Première récupération réussie depuis le cache pour la clé ${testKey}`);
      logger.debug(`Test: Hits=${this.hits}, Misses=${this.misses}`);
      
      // Récupérer du cache (deuxième fois)
      const cachedData2 = this.get(testKey);
      
      if (cachedData2) {
        logger.debug(`Test: Deuxième récupération réussie depuis le cache pour la clé ${testKey}`);
        logger.debug(`Test: Hits=${this.hits}, Misses=${this.misses}`);
      } else {
        logger.error(`Test: ÉCHEC de la deuxième récupération depuis le cache pour la clé ${testKey}`);
      }
    } else {
      logger.error(`Test: ÉCHEC de la première récupération depuis le cache pour la clé ${testKey}`);
    }
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





