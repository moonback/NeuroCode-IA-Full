import { type LoaderFunctionArgs, json } from '@remix-run/cloudflare';
import { aiAgentQueue, resultStore } from '~/lib/queue/config';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('api.tasks.status');

export async function loader({ params }: LoaderFunctionArgs) {
    const { taskId } = params;

    if (!taskId) {
        return json({ error: 'Task ID manquant' }, { status: 400 });
    }

    try {
        logger.info(`Vérification du statut de la tâche ${taskId}`);

        // 1. Vérifier le statut personnalisé (si vous l'utilisez)
        const customStatusKey = `task:${taskId}:status`;
        const customStatus = await resultStore.get(customStatusKey);

        if (customStatus === 'completed') {
            const resultKey = `task:${taskId}:result`;
            const resultData = await resultStore.get(resultKey);
            if (resultData) {
                logger.info(`Tâche ${taskId} terminée avec succès (statut personnalisé)`);
                return json({ status: 'completed', result: JSON.parse(resultData) });
            } else {
                // Si le statut est 'completed' mais pas de résultat, chercher dans BullMQ
                const job = await aiAgentQueue.getJob(taskId);
                if (job && job.returnvalue) {
                    logger.info(`Tâche ${taskId} terminée avec succès (BullMQ)`);
                    return json({ status: 'completed', result: job.returnvalue });
                }
                // Si toujours rien, c'est peut-être une erreur
                logger.warn(`[API Status] Statut 'completed' pour ${taskId} mais pas de données de résultat.`);
                return json({ status: 'processing', message: 'Résultat en cours de finalisation...' });
            }
        }

        if (customStatus === 'failed') {
            const errorKey = `task:${taskId}:error`;
            const errorData = await resultStore.get(errorKey);
            const error = errorData ? JSON.parse(errorData) : { error: 'Échec de la tâche, détails non disponibles.' };
            logger.warn(`Tâche ${taskId} a échoué: ${error.error || 'Erreur inconnue'}`);
            return json({ status: 'failed', error: error.error || 'Erreur inconnue' });
        }

        // 2. Si pas de statut personnalisé ou en cours, vérifier le statut BullMQ
        const job = await aiAgentQueue.getJob(taskId);

        if (!job) {
            // Si le job n'existe pas et pas de statut personnalisé, il est peut-être expiré ou invalide
            // Vérifions si un résultat ou une erreur existe quand même (au cas où le job BullMQ aurait été nettoyé)
            const resultKey = `task:${taskId}:result`;
            const resultData = await resultStore.get(resultKey);
            if (resultData) {
                logger.info(`Tâche ${taskId} terminée avec succès (résultat trouvé dans Redis)`);
                return json({ status: 'completed', result: JSON.parse(resultData) });
            }
            const errorKey = `task:${taskId}:error`;
            const errorData = await resultStore.get(errorKey);
            if (errorData) {
                const error = JSON.parse(errorData);
                logger.warn(`Tâche ${taskId} a échoué (erreur trouvée dans Redis): ${error.error || 'Erreur inconnue'}`);
                return json({ status: 'failed', error: error.error || 'Erreur inconnue' });
            }

            // Si rien n'est trouvé, la tâche n'existe pas ou a expiré
            logger.warn(`Tâche ${taskId} non trouvée ou expirée`);
            return json({ status: 'not_found', message: 'Tâche non trouvée ou expirée' }, { status: 404 });
        }

        const state = await job.getState();

        switch (state) {
            case 'completed':
                // Double vérification du résultat dans Redis au cas où BullMQ l'aurait déjà nettoyé
                const resultKey = `task:${taskId}:result`;
                const resultData = await resultStore.get(resultKey);
                const result = resultData ? JSON.parse(resultData) : job.returnvalue;
                if (!result) {
                    logger.warn(`[API Status] Job ${taskId} BullMQ marqué comme 'completed' mais pas de valeur de retour.`);
                    return json({ status: 'processing', message: 'Résultat en cours de finalisation...' });
                }
                logger.info(`Tâche ${taskId} terminée avec succès (BullMQ)`);
                return json({ status: 'completed', result });
            case 'failed':
                const errorKey = `task:${taskId}:error`;
                const errorData = await resultStore.get(errorKey);
                const error = errorData ? JSON.parse(errorData) : { error: job.failedReason || 'La tâche a échoué' };
                logger.warn(`Tâche ${taskId} a échoué: ${error.error || 'Erreur inconnue'}`);
                return json({ status: 'failed', error: error.error || 'Erreur inconnue' });
            case 'active':
                logger.info(`Tâche ${taskId} en cours de traitement`);
                return json({ status: 'processing', message: 'Tâche en cours de traitement...' });
            case 'waiting':
            case 'delayed':
                logger.info(`Tâche ${taskId} en attente dans la file`);
                return json({ status: 'pending', message: 'Tâche en attente dans la file...' });
            default:
                logger.info(`Tâche ${taskId} avec statut inconnu: ${state}`);
                return json({ status: 'unknown', message: `Statut inconnu: ${state}` });
        }
    } catch (error) {
        logger.error(`Erreur lors de la récupération du statut de la tâche ${taskId}:`, error);
        const errorMessage = error instanceof Error ? error.message : 'Erreur interne du serveur';
        return json({ error: 'Impossible de récupérer le statut de la tâche', details: errorMessage }, { status: 500 });
    }
}