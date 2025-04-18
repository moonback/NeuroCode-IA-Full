import { type ActionFunctionArgs, json } from '@remix-run/cloudflare';
import { aiAgentQueue } from '~/lib/queue/config'; // Importation de la file d'attente
import { generateId } from 'ai'; // Pour générer des IDs uniques
import { getApiKeysFromCookie, getProviderSettingsFromCookie } from '~/lib/api/cookies';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('api.agents.enqueue');

export async function action({ request, context }: ActionFunctionArgs) {
    try {
        const {
            messages,
            prompt, // Ou toute autre donnée nécessaire à l'agent
            model,
            providerName,
            // ... autres paramètres
        } = await request.json<{
            messages?: any[]; // Adaptez selon ce que votre agent attend
            prompt?: string;
            model: string;
            providerName: string;
            // ...
        }>();

        // Récupérer les clés API et paramètres depuis les cookies/contexte si nécessaire
        const cookieHeader = request.headers.get('Cookie');
        const apiKeys = getApiKeysFromCookie(cookieHeader);
        const providerSettings = getProviderSettingsFromCookie(cookieHeader);
        const serverEnv = context.cloudflare?.env;

        const taskId = generateId(); // Génère un ID unique pour la tâche

        // Préparer les données du job
        const jobData = {
            taskId,
            prompt: prompt || (messages && messages.length > 0 ? messages[messages.length - 1]?.content : undefined),
            messages,
            model,
            providerName,
            apiKeys, // Passez les clés si le worker en a besoin
            providerSettings: providerSettings[providerName], // Passez les paramètres spécifiques
            serverEnv, // Passez l'env serveur si besoin
            // ... autres données nécessaires
        };

        logger.info(`Ajout de la tâche ${taskId} à la file pour le modèle ${model} (${providerName})`);

        // Ajouter la tâche à la file d'attente BullMQ
        await aiAgentQueue.add('process-agent-task', jobData, {
            jobId: taskId, // Utiliser taskId comme ID de job pour récupération facile
            removeOnComplete: { age: 3600 }, // Garde le job 1h après complétion
            removeOnFail: { age: 24 * 3600 }, // Garde le job 24h après échec
            attempts: 3, // Tente 3 fois en cas d'échec
            backoff: { // Stratégie d'attente exponentielle
              type: 'exponential',
              delay: 5000, // Commence avec 5s
            },
        });

        logger.info(`Tâche ${taskId} ajoutée à la file pour le modèle ${model}`);

        // Retourner immédiatement avec le taskId (HTTP 202 Accepted)
        return json({ taskId }, { status: 202 });

    } catch (error) {
        logger.error('Erreur lors de l\'ajout de la tâche:', error);
        const errorMessage = error instanceof Error ? error.message : 'Erreur interne du serveur';
        return json({ error: 'Impossible de démarrer la tâche de l\'agent', details: errorMessage }, { status: 500 });
    }
}