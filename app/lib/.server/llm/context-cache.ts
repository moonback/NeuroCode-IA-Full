import { createScopedLogger } from '~/utils/logger';
import type { FileMap } from './constants';

const logger = createScopedLogger('context-cache');

// Structure de l'entrée de cache
interface ContextCacheEntry {
  timestamp: number;
  contextFiles: FileMap;
  summary?: string;
  expiresAt: number;
}

// Configuration du cache
const CACHE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes par défaut
const MAX_CACHE_SIZE = 50; // Nombre maximum d'entrées dans le cache

// Cache en mémoire pour stocker le contexte
class ContextCache {
  private static instance: ContextCache;
  private cache: Map<string, ContextCacheEntry>;
  private maxSize: number;
  private defaultExpiryMs: number;

  private constructor() {
    this.cache = new Map<string, ContextCacheEntry>();
    this.maxSize = MAX_CACHE_SIZE;
    this.defaultExpiryMs = CACHE_EXPIRY_MS;
    // Nettoyer le cache périodiquement
    setInterval(() => this.cleanup(), CACHE_EXPIRY_MS);
  }

  public static getInstance(): ContextCache {
    if (!ContextCache.instance) {
      ContextCache.instance = new ContextCache();
    }
    return ContextCache.instance;
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

    this.cache.set(key, {
      timestamp: now,
      contextFiles: value.contextFiles,
      summary: value.summary,
      expiresAt: now + expiry,
    });

    logger.debug(`Contexte mis en cache avec la clé: ${key}, expire dans ${expiry / 1000}s`);
  }

  /**
   * Récupère le contexte depuis le cache
   */
  public get(key: string): { contextFiles: FileMap; summary?: string } | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return null;
    }

    // Vérifier si l'entrée a expiré
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      logger.debug(`Entrée de cache expirée: ${key}`);
      return null;
    }

    // Mettre à jour le timestamp pour la politique LRU
    entry.timestamp = Date.now();
    this.cache.set(key, entry);

    logger.debug(`Contexte récupéré depuis le cache avec la clé: ${key}`);
    return {
      contextFiles: entry.contextFiles,
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
   * Retourne des statistiques sur le cache
   */
  public getStats(): { size: number; maxSize: number; defaultExpiryMs: number } {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      defaultExpiryMs: this.defaultExpiryMs,
    };
  }
}

export const contextCache = ContextCache.getInstance();