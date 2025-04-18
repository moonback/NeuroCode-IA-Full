import { Job } from 'bullmq';
import { createAgentWorker, resultStore } from '~/lib/queue/config';
import { LLMManager } from '~/lib/modules/llm/manager';

console.log('[Worker] Démarrage du worker d\'agent IA...');

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
  options?: Record<string, any>;
}

/**
 * Exécute la logique de l'agent IA en utilisant le LLMManager
 */
async function executeAgentLogic(jobData: AIAgentJobData): Promise<any> {
  console.log(`[Worker] Traitement du job ${jobData.taskId} pour le provider ${jobData.providerName}, modèle ${jobData.model}`);
  
  try {
    // Initialisation du LLMManager avec les variables d'environnement du serveur
    // Convertir process.env en Record<string, string>
const envVars: Record<string, string> = {};
for (const [key, value] of Object.entries(process.env)) {
  if (value !== undefined) {
    envVars[key] = value;
  }
}

const llmManager = LLMManager.getInstance(envVars);
    
    // Récupération du provider demandé
    const providerInstance = llmManager.getProvider(jobData.providerName);
    if (!providerInstance) {
      throw new Error(`Provider ${jobData.providerName} non trouvé`);
    }
    
    // Configuration du modèle avec les clés API fournies
    const modelConfig = {
      model: jobData.model,
      apiKey: jobData.apiKeys?.[jobData.providerName],
      ...jobData.options
    };
    
    // Obtention de l'instance du modèle
    const modelInstance = providerInstance.getModelInstance(modelConfig);
    
    // Génération de texte avec le modèle
    console.log(`[Worker] Génération de texte avec ${jobData.model}...`);
    const response = await providerInstance.generateText({
      model: modelInstance,
      prompt: jobData.prompt,
      options: jobData.options
    });
    
    console.log(`[Worker] Tâche ${jobData.taskId} terminée.`);
    return {
      result: response,
      completionTime: new Date().toISOString()
    };
  } catch (error) {
    console.error(`[Worker] Erreur lors de l'exécution de l'agent IA:`, error);
    throw error; // Relancer l'erreur pour la gestion des erreurs BullMQ
  }
}

/**
 * Fonction de traitement des jobs de la file d'attente
 */
const processor = async (job: Job) => {
  const { taskId, ...jobData } = job.data;
  console.log(`[Worker] Réception du job ${taskId} avec les données:`, Object.keys(jobData));
  
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
    console.log(`[Worker] Résultat stocké pour le job ${taskId} dans Redis.`);
    
    // 3. Mettre à jour le statut
    await resultStore.set(statusKey, 'completed', 'EX', 3600);
    
    // Mise à jour finale de la progression
    await job.updateProgress(100);
    
    return result; // BullMQ stocke aussi le résultat du job
  } catch (error) {
    console.error(`[Worker] Erreur lors du traitement du job ${taskId}:`, error);
    
    // Stocker l'erreur et mettre à jour le statut
    const errorKey = `task:${taskId}:error`;
    const statusKey = `task:${taskId}:status`;
    const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
    
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
  console.log(`[Worker] Job ${job.id} terminé avec succès.`);
});

worker.on('failed', (job, err) => {
  console.error(`[Worker] Job ${job?.id} échoué:`, err);
});

worker.on('error', (err) => {
  console.error(`[Worker] Erreur générale du worker:`, err);
});

console.log('[Worker] Worker prêt et en écoute de la file d\'attente.');

// Garder le worker en vie (pour les déploiements simples)
process.on('SIGTERM', async () => {
  console.log('[Worker] Réception de SIGTERM, fermeture...');
  await worker.close();
  process.exit(0);
});