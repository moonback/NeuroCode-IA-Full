import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import os from 'os'; // Import os pour obtenir le nombre de CPU

// Assurez-vous que les variables d'environnement sont chargées (ex: via dotenv si nécessaire)
const redisConnection = new IORedis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
  maxRetriesPerRequest: null, // Important pour BullMQ
});

const QUEUE_NAME = 'ai-agent-tasks';

export const aiAgentQueue = new Queue(QUEUE_NAME, { connection: redisConnection });

// Fonction pour créer un worker (sera utilisé dans le fichier worker)
export const createAgentWorker = (processor: (job: any) => Promise<any>) => {
  // Déterminer la simultanéité en fonction des cœurs de processeur disponibles
  const concurrency = Math.max(1, os.cpus().length - 1); // Laisse un cœur pour le système
  console.log(`[Worker] Initialisation avec une concurrence de ${concurrency}`);

  return new Worker(QUEUE_NAME, processor, {
    connection: redisConnection,
    concurrency: concurrency, // Ajustez selon les ressources disponibles
    limiter: { // Limite le nombre de jobs traités par intervalle
      max: 10, // Max 10 jobs
      duration: 1000, // Par seconde
    },
  });
};

// Instance Redis pour le stockage des résultats (peut être la même connexion)
export const resultStore = redisConnection;

console.log('[Queue] Connexion Redis et file d\'attente initialisées.');

// Gestion des erreurs de connexion Redis
redisConnection.on('error', (err) => {
    console.error('[Queue] Erreur de connexion Redis:', err);
});