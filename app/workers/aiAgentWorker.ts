import { Job } from 'bullmq';
import { createAgentWorker, resultStore } from '~/lib/queue/config';
import { LLMManager } from '~/lib/modules/llm/manager';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('aiAgentWorker');

logger.info('[Worker] Démarrage du worker d\'agent IA...');

/**
 * Interface pour les données de tâche d'agent IA
 */
interface AIAgentJobData {
  taskId: string;
  prompt: string;
  model: string;
  providerName: string;
  apiKeys?: Record<string, string>;
  userId?: string;
  // Données contextuelles supplémentaires
  files?: any[];
  uploadedFiles?: Array<{name: string; size: number; type: string}>;
  imageDataList?: string[];
  contextOptimization?: boolean;
  customInstructions?: string;
  targetedFiles?: string[];
  options?: Record<string, any>;
}

/**
 * Exécute la logique de l'agent IA en utilisant le LLMManager
 */
async function executeAgentLogic(jobData: AIAgentJobData): Promise<any> {
  logger.info(`[Worker] Traitement du job ${jobData.taskId} pour le provider ${jobData.providerName}, modèle ${jobData.model}`);
  logger.debug(`[Worker] Options reçues:`, JSON.stringify(jobData.options || {}));
  
  try {
    // Initialisation du LLMManager avec les variables d'environnement du serveur
    // Convertir process.env en Record<string, string>
    const envVars: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined) {
        envVars[key] = value;
      }
    }

    // Obtenir l'instance du LLMManager avec les variables d'environnement
    const llmManager = LLMManager.getInstance(envVars);
    logger.debug(`[Worker] LLMManager initialisé`);
    
    // Récupération du provider demandé
    const providerInstance = llmManager.getProvider(jobData.providerName);
    if (!providerInstance) {
      logger.error(`[Worker] Provider ${jobData.providerName} non trouvé`);
      throw new Error(`Provider ${jobData.providerName} non trouvé`);
    }
    logger.debug(`[Worker] Provider ${jobData.providerName} récupéré avec succès`);
    
    // Obtention de l'instance du modèle avec les paramètres corrects
    logger.debug(`[Worker] Initialisation du modèle avec les paramètres:`, {
      model: jobData.model,
      apiKeys: jobData.apiKeys ? 'Présent' : 'Non fourni',
      providerSettings: jobData.options?.providerSettings ? 'Présent' : 'Non fourni'
    });
    
    const modelInstance = providerInstance.getModelInstance({
      model: jobData.model,
      serverEnv: envVars as any,
      apiKeys: jobData.apiKeys,
      providerSettings: jobData.options?.providerSettings
    });
    logger.debug(`[Worker] Instance du modèle ${jobData.model} créée avec succès`);
    
    // Importation de la fonction generateText depuis la bibliothèque ai
    const { generateText } = await import('ai');
    
    // Génération de texte avec le modèle en utilisant la fonction generateText
    logger.info(`[Worker] Génération de texte avec ${jobData.model}...`);
    
    // Préparation des messages pour le modèle
    const messages = [
      {
        role: 'user' as const,
        content: jobData.prompt
      }
    ];
    
    // Log de la longueur du prompt pour le débogage
    logger.debug(`[Worker] Longueur du prompt: ${jobData.prompt.length} caractères`);
    
    // Appel à la fonction generateText avec les paramètres appropriés
    logger.debug(`[Worker] Paramètres de génération:`, {
      maxTokens: jobData.options?.maxTokens || 4000,
      temperature: jobData.options?.temperature || 0.7,
      systemPrompt: jobData.options?.systemPrompt ? 'Personnalisé' : 'Par défaut'
    });
    
    const response = await generateText({
      model: modelInstance,
      messages: messages,
      maxTokens: jobData.options?.maxTokens || 4000,
      temperature: jobData.options?.temperature || 0.7,
      system: jobData.options?.systemPrompt || 'Vous êtes un assistant IA utile et précis.',
    });
    
    logger.info(`[Worker] Tâche ${jobData.taskId} terminée avec succès.`);
    logger.debug(`[Worker] Longueur de la réponse: ${response.text.length} caractères`);
    logger.debug(`[Worker] Informations d'utilisation:`, response.usage);
    
    return {
      result: response.text,
      usage: response.usage,
      completionTime: new Date().toISOString()
    };
  } catch (error) {
    logger.error(`[Worker] Erreur lors de l'exécution de l'agent IA:`, error);
    logger.debug(`[Worker] Détails de l'erreur:`, {
      message: error instanceof Error ? error.message : 'Erreur inconnue',
      stack: error instanceof Error ? error.stack : 'Pas de stack trace disponible'
    });
    throw error; // Relancer l'erreur pour la gestion des erreurs BullMQ
  }
}

/**
 * Fonction de traitement des jobs de la file d'attente
 */
const processor = async (job: Job) => {
  const { taskId, ...jobData } = job.data;
  logger.info(`[Worker] Réception du job ${taskId} avec les données:`, Object.keys(jobData));
  logger.debug(`[Worker] Données contextuelles reçues:`, {
    filesCount: jobData.files?.length || 0,
    uploadedFilesCount: jobData.uploadedFiles?.length || 0,
    imageDataCount: jobData.imageDataList?.length || 0,
    contextOptimization: jobData.contextOptimization || false,
    hasCustomInstructions: !!jobData.customInstructions,
    targetedFilesCount: jobData.targetedFiles?.length || 0
  });
  
  try {
    // Mise à jour du statut dans Redis
    const statusKey = `task:${taskId}:status`;
    await resultStore.set(statusKey, 'processing', 'EX', 3600);
    
    // Mise à jour de la progression
    await job.updateProgress(10);
    
    // 1. Exécuter la logique de l'agent IA
    const result = await executeAgentLogic({ taskId, ...jobData });
    
    // Mise à jour de la progression
    await job.updateProgress(90);
    
    // 2. Stocker le résultat dans Redis
    const resultKey = `task:${taskId}:result`;
    await resultStore.set(resultKey, JSON.stringify(result), 'EX', 3600);
    logger.info(`[Worker] Résultat stocké pour le job ${taskId} dans Redis.`);
    logger.debug(`[Worker] Contenu du résultat:`, JSON.stringify(result).substring(0, 200) + '...');
    
    // 3. Mettre à jour le statut
    await resultStore.set(statusKey, 'completed', 'EX', 3600);
    
    // Mise à jour finale de la progression
    await job.updateProgress(100);
    
    return result; // BullMQ stocke aussi le résultat du job
  } catch (error) {
    logger.error(`[Worker] Erreur lors du traitement du job ${taskId}:`, error);
    
    // Stocker l'erreur et mettre à jour le statut
    const errorKey = `task:${taskId}:error`;
    const statusKey = `task:${taskId}:status`;
    const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
    
    logger.error(`[Worker] Stockage de l'erreur pour le job ${taskId}: ${errorMessage}`);
    await resultStore.set(errorKey, JSON.stringify({ error: errorMessage }), 'EX', 3600);
    await resultStore.set(statusKey, 'failed', 'EX', 3600);
    
    // Rejeter le job pour qu'il soit marqué comme échoué dans BullMQ
    throw error;
  }
};

// Créer et démarrer le worker
const worker = createAgentWorker(processor);

// Gestion des événements du worker
worker.on('completed', (job, result) => {
  logger.info(`[Worker] Job ${job.id} terminé avec succès.`);
  logger.debug(`[Worker] Résultat du job ${job.id}:`, result ? JSON.stringify(result).substring(0, 200) + '...' : 'Aucun résultat');
});

worker.on('failed', (job, err) => {
  logger.error(`[Worker] Job ${job?.id} échoué:`, err);
});

worker.on('error', (err) => {
  logger.error(`[Worker] Erreur générale du worker:`, err);
});

logger.info('[Worker] Worker prêt et en écoute de la file d\'attente.');

// Garder le worker en vie (pour les déploiements simples)
process.on('SIGTERM', async () => {
  logger.info('[Worker] Réception de SIGTERM, fermeture...');
  await worker.close();
  process.exit(0);
});

// Gestion du signal SIGINT (Ctrl+C)
process.on('SIGINT', async () => {
  logger.info('[Worker] Réception de SIGINT (Ctrl+C), fermeture...');
  await worker.close();
  process.exit(0);
});
