import { type LoaderFunctionArgs, json } from '@remix-run/cloudflare';
import { QueueService } from '~/lib/queue/service';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('api.agents.status');

export async function loader({ request }: LoaderFunctionArgs) {
    try {
        // Récupérer l'ID de la tâche depuis les paramètres de requête
        const url = new URL(request.url);
        const taskId = url.searchParams.get('taskId');

        if (!taskId) {
            return json({ error: 'ID de tâche manquant' }, { status: 400 });
        }

        logger.info(`Vérification du statut de la tâche ${taskId}`);

        // Récupérer le statut de la tâche depuis le service de file d'attente
        const status = await QueueService.getJobStatus(taskId);

        // Si la tâche est terminée avec succès, renvoyer le résultat
        if (status.status === 'completed') {
            logger.info(`Tâche ${taskId} terminée avec succès`);
            return json({
                status: status.status,
                result: status.result,
                progress: status.progress
            });
        }
        
        // Si la tâche a échoué, renvoyer l'erreur
        if (status.status === 'failed') {
            logger.warn(`Tâche ${taskId} a échoué: ${status.error}`);
            return json({
                status: status.status,
                error: status.error,
                progress: status.progress
            }, { status: 500 });
        }

        // Si la tâche est toujours en cours, renvoyer le statut actuel
        logger.info(`Tâche ${taskId} en cours: ${status.status}, progression: ${status.progress}%`);
        return json({
            status: status.status,
            progress: status.progress
        });

    } catch (error) {
        logger.error('Erreur lors de la récupération du statut de la tâche:', error);
        const errorMessage = error instanceof Error ? error.message : 'Erreur interne du serveur';
        return json({ error: 'Impossible de récupérer le statut de la tâche', details: errorMessage }, { status: 500 });
    }
}