/**
 * Module de file d'attente pour les tâches d'agent IA
 * 
 * Ce module fournit une interface pour ajouter des tâches à une file d'attente Redis/BullMQ
 * et les traiter de manière asynchrone avec des workers.
 */

// Exporter la configuration
export * from './config';

// Exporter les types et interfaces
export type { AIAgentTask } from './worker';

// Exporter le service de file d'attente
export { QueueService } from './service';

// Note: Le worker n'est pas exporté par défaut car il devrait être
// importé et exécuté séparément dans un processus dédié