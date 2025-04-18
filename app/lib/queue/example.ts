/**
 * Exemple d'utilisation du système de file d'attente
 * 
 * Ce fichier montre comment utiliser le service de file d'attente
 * pour ajouter des tâches et récupérer leurs résultats.
 */

import { QueueService } from './service';
import type { AIAgentTask } from './worker';

/**
 * Exemple d'ajout d'une tâche de génération de code
 */
async function exempleGenerationCode() {
  // Création d'une tâche de génération de code
  const tache: AIAgentTask = {
    type: 'code_generation',
    payload: {
      prompt: 'Créer une fonction qui calcule la factorielle d\'un nombre',
      language: 'typescript',
      commentStyle: 'jsdoc'
    },
    userId: 'user-123',
    metadata: {
      source: 'exemple',
      timestamp: Date.now()
    }
  };

  try {
    // Ajout de la tâche à la file d'attente avec une priorité élevée
    const jobId = await QueueService.addTask(tache, {
      priority: 1, // Priorité élevée
      attempts: 3  // 3 tentatives en cas d'échec
    });

    console.log(`Tâche ajoutée avec l'ID: ${jobId}`);

    // Simulation d'attente pour le traitement
    console.log('Traitement en cours...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Vérification du statut de la tâche
    const statut = await QueueService.getJobStatus(jobId);
    console.log('Statut de la tâche:', statut);

    return statut;
  } catch (error) {
    console.error('Erreur lors de l\'exemple de génération de code:', error);
    throw error;
  }
}

/**
 * Exemple d'ajout d'une tâche d'analyse de code
 */
async function exempleAnalyseCode() {
  // Création d'une tâche d'analyse de code
  const tache: AIAgentTask = {
    type: 'code_analysis',
    payload: {
      code: `function calculerFactorielle(n) {
        if (n <= 1) return 1;
        return n * calculerFactorielle(n - 1);
      }`,
      analysisType: 'complexity'
    }
  };

  try {
    // Ajout de la tâche à la file d'attente
    const jobId = await QueueService.addTask(tache);

    console.log(`Tâche d'analyse ajoutée avec l'ID: ${jobId}`);

    // Simulation d'attente pour le traitement
    console.log('Analyse en cours...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Vérification du statut de la tâche
    const statut = await QueueService.getJobStatus(jobId);
    console.log('Statut de l\'analyse:', statut);

    return statut;
  } catch (error) {
    console.error('Erreur lors de l\'exemple d\'analyse de code:', error);
    throw error;
  }
}

/**
 * Exemple de récupération de tous les jobs actifs
 */
async function exempleListeJobsActifs() {
  try {
    const jobsActifs = await QueueService.getActiveJobs();
    console.log(`Nombre de jobs actifs: ${jobsActifs.length}`);
    
    // Afficher les détails de chaque job actif
    for (const job of jobsActifs) {
      console.log(`- Job #${job.id}: ${job.name}`);
    }
    
    return jobsActifs;
  } catch (error) {
    console.error('Erreur lors de la récupération des jobs actifs:', error);
    throw error;
  }
}

// Exporter les exemples pour utilisation
export {
  exempleGenerationCode,
  exempleAnalyseCode,
  exempleListeJobsActifs
};

/**
 * Comment utiliser ce module:
 * 
 * ```typescript
 * import { exempleGenerationCode } from './lib/queue/example';
 * 
 * // Exécuter l'exemple
 * exempleGenerationCode()
 *   .then(resultat => {
 *     console.log('Résultat:', resultat);
 *   })
 *   .catch(erreur => {
 *     console.error('Erreur:', erreur);
 *   });
 * ```
 */