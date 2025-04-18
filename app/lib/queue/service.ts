import { Job } from 'bullmq';
import { aiAgentQueue, resultStore } from './config';
import type { AIAgentTask } from './worker';

/**
 * Service pour gérer les opérations de file d'attente
 */
export class QueueService {
  /**
   * Ajoute une tâche à la file d'attente
   * @param task La tâche à ajouter
   * @param options Options supplémentaires pour le job
   * @returns L'ID du job créé
   */
  static async addTask(
    task: AIAgentTask,
    options: {
      priority?: number;
      delay?: number;
      attempts?: number;
      timeout?: number;
      jobId?: string;
    } = {}
  ): Promise<string> {
    try {
      const job = await aiAgentQueue.add('task', task, {
        priority: options.priority,
        delay: options.delay,
        attempts: options.attempts || 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
        timeout: options.timeout || 60000, // 1 minute par défaut
        removeOnComplete: false, // Garder l'historique des jobs complétés
        removeOnFail: false, // Garder l'historique des jobs échoués
        jobId: options.jobId, // ID personnalisé si fourni
      });

      console.log(`[QueueService] Tâche ajoutée avec l'ID: ${job.id}`);
      return job.id as string;
    } catch (error) {
      console.error('[QueueService] Erreur lors de l\'ajout de la tâche:', error);
      throw new Error(`Échec de l'ajout de la tâche: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
    }
  }

  /**
   * Récupère le statut d'un job
   * @param jobId L'ID du job
   * @returns Le statut et les détails du job
   */
  static async getJobStatus(jobId: string): Promise<{
    id: string;
    status: 'waiting' | 'active' | 'completed' | 'failed' | 'delayed' | 'unknown';
    progress: number;
    result?: any;
    error?: string;
    timestamp?: number;
  }> {
    try {
      const job = await Job.fromId(aiAgentQueue, jobId);
      
      if (!job) {
        throw new Error(`Job avec l'ID ${jobId} non trouvé`);
      }

      // Récupérer l'état du job
      const state = await job.getState();
      
      // Récupérer le résultat si le job est terminé
      let result;
      let error;
      
      if (state === 'completed') {
        result = await job.returnvalue;
      } else if (state === 'failed') {
        error = job.failedReason;
      }

      return {
        id: job.id as string,
        status: state as 'waiting' | 'active' | 'completed' | 'failed' | 'delayed' | 'unknown',
        progress: job.progress as number || 0,
        result,
        error,
        timestamp: job.timestamp,
      };
    } catch (error) {
      console.error(`[QueueService] Erreur lors de la récupération du statut du job ${jobId}:`, error);
      return {
        id: jobId,
        status: 'unknown',
        progress: 0,
        error: `Erreur lors de la récupération du statut: ${error instanceof Error ? error.message : 'Erreur inconnue'}`,
      };
    }
  }

  /**
   * Récupère tous les jobs actifs
   * @returns Liste des jobs actifs
   */
  static async getActiveJobs(): Promise<Job[]> {
    return await aiAgentQueue.getActive();
  }

  /**
   * Récupère tous les jobs en attente
   * @returns Liste des jobs en attente
   */
  static async getWaitingJobs(): Promise<Job[]> {
    return await aiAgentQueue.getWaiting();
  }

  /**
   * Récupère tous les jobs terminés
   * @param limit Nombre maximum de jobs à récupérer
   * @returns Liste des jobs terminés
   */
  static async getCompletedJobs(limit = 50): Promise<Job[]> {
    return await aiAgentQueue.getCompleted(0, limit);
  }

  /**
   * Récupère tous les jobs échoués
   * @param limit Nombre maximum de jobs à récupérer
   * @returns Liste des jobs échoués
   */
  static async getFailedJobs(limit = 50): Promise<Job[]> {
    return await aiAgentQueue.getFailed(0, limit);
  }

  /**
   * Supprime un job de la file d'attente
   * @param jobId L'ID du job à supprimer
   * @returns true si la suppression a réussi, false sinon
   */
  static async removeJob(jobId: string): Promise<boolean> {
    try {
      const job = await Job.fromId(aiAgentQueue, jobId);
      
      if (!job) {
        return false;
      }
      
      await job.remove();
      return true;
    } catch (error) {
      console.error(`[QueueService] Erreur lors de la suppression du job ${jobId}:`, error);
      return false;
    }
  }

  /**
   * Vide la file d'attente (supprime tous les jobs)
   * @returns Le nombre de jobs supprimés
   */
  static async clearQueue(): Promise<number> {
    try {
      const count = await aiAgentQueue.obliterate({ force: true });
      console.log(`[QueueService] File d'attente vidée, ${count} jobs supprimés`);
      return count;
    } catch (error) {
      console.error('[QueueService] Erreur lors du vidage de la file d\'attente:', error);
      throw new Error(`Échec du vidage de la file d'attente: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
    }
  }
}