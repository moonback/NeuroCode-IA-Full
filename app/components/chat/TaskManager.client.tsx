import { useState, useEffect, useCallback } from 'react';
import { toast } from 'react-toastify';

// Définition des types pour les réponses de l'API des tâches
interface TaskResponseBase {
  status: 'completed' | 'failed' | 'processing' | 'pending' | 'not_found' | 'unknown';
  message?: string;
}

interface CompletedTaskResponse extends TaskResponseBase {
  status: 'completed';
  result: any; // Le résultat peut être de n'importe quel type selon la tâche
}

interface FailedTaskResponse extends TaskResponseBase {
  status: 'failed';
  error: string;
}

interface ProcessingTaskResponse extends TaskResponseBase {
  status: 'processing' | 'pending';
  message: string;
}

interface NotFoundTaskResponse extends TaskResponseBase {
  status: 'not_found';
  message: string;
}

interface UnknownTaskResponse extends TaskResponseBase {
  status: 'unknown';
  message: string;
}

type TaskResponse = CompletedTaskResponse | FailedTaskResponse | ProcessingTaskResponse | NotFoundTaskResponse | UnknownTaskResponse;


interface TaskManagerProps {
  onTaskCompleted?: (result: any) => void;
}

export function useTaskManager({ onTaskCompleted }: TaskManagerProps = {}) {
  const [pollingIntervalId, setPollingIntervalId] = useState<NodeJS.Timeout | null>(null);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [taskStatus, setTaskStatus] = useState<'idle' | 'submitted' | 'processing' | 'completed' | 'failed'>('idle');

  // Nettoyage à la désinstallation du composant
  useEffect(() => {
    return () => {
      if (pollingIntervalId) {
        clearInterval(pollingIntervalId);
      }
    };
  }, [pollingIntervalId]);

  const pollStatus = useCallback(async (taskId: string) => {
    try {
      console.log(`[TaskManager] Vérification du statut de la tâche ${taskId}...`);
      const response = await fetch(`/api/tasks/${taskId}`);
      
      if (!response.ok) {
        // Gère 404 (not found) ou d'autres erreurs serveur
        if (response.status === 404) {
          console.warn(`[TaskManager] Tâche ${taskId} non trouvée.`);
          // Peut-être arrêter le polling ici ou après quelques tentatives
        } else {
          console.error(`[TaskManager] Erreur de polling ${response.status}`);
        }
        // Ne pas arrêter le polling immédiatement pour les erreurs serveur temporaires
        return;
      }
      
      console.log(`[TaskManager] Réponse reçue pour la tâche ${taskId}`);

      const data = await response.json() as TaskResponse;

      switch (data.status) {
        case 'completed':
          setTaskStatus('completed');
          if (pollingIntervalId) clearInterval(pollingIntervalId);
          setPollingIntervalId(null);
          setActiveTaskId(null);
          toast.success(`Tâche ${taskId.substring(0, 6)}... terminée !`);
          // Traiter et afficher data.result (ex: ajouter aux messages du chat)
          if (onTaskCompleted) {
            onTaskCompleted(data.result);
          }
          console.log("Résultat de la tâche:", data.result);
          break;
        case 'failed':
          setTaskStatus('failed');
          if (pollingIntervalId) clearInterval(pollingIntervalId);
          setPollingIntervalId(null);
          setActiveTaskId(null);
          toast.error(`La tâche ${taskId.substring(0, 6)}... a échoué: ${data.error}`);
          // Afficher l'erreur dans l'UI
          break;
        case 'processing':
        case 'pending':
          setTaskStatus('processing'); // Maintient l'état de traitement
          // Afficher un message de statut (optionnel) : data.message
          console.log(`Statut de la tâche ${taskId}: ${data.status} - ${data.message || ''}`);
          break;
        case 'not_found':
          console.warn(`Tâche ${taskId} non trouvée ou expirée.`);
          setTaskStatus('failed'); // Ou un autre état pour indiquer l'échec
          if (pollingIntervalId) clearInterval(pollingIntervalId);
          setPollingIntervalId(null);
          setActiveTaskId(null);
          toast.warn(`La tâche ${taskId.substring(0, 6)}... est introuvable.`);
          break;
        default:
          console.warn("Statut de tâche inconnu:", data.status);
          // Garder le polling actif par défaut pour les statuts inconnus
      }
    } catch (error) {
      console.error("Erreur de polling:", error);
      // Peut-être arrêter le polling après plusieurs erreurs consécutives
    }
  }, [pollingIntervalId, onTaskCompleted]);

  const startPolling = useCallback((taskId: string) => {
    // Arrête tout polling existant
    if (pollingIntervalId) {
      clearInterval(pollingIntervalId);
    }
    // Interroge immédiatement une fois
    pollStatus(taskId);
    // Puis interroge toutes les 3 secondes
    const intervalId = setInterval(() => pollStatus(taskId), 3000);
    setPollingIntervalId(intervalId);
  }, [pollingIntervalId, pollStatus]);

  // Définition d'une interface pour la réponse de l'API d'enqueue
  interface EnqueueResponse {
    taskId: string;
  }
  
  // Définition d'une interface pour la réponse d'erreur
  interface ErrorResponse {
    error: string;
  }

  // Définition d'une interface pour le résultat de submitAgentTask
  interface TaskSubmissionResult {
    success: boolean;
    taskId?: string;
    error?: any;
  }

  const submitAgentTask = useCallback(async (data: any): Promise<TaskSubmissionResult> => {
    if (pollingIntervalId) clearInterval(pollingIntervalId); // Arrête le polling précédent
    setActiveTaskId(null);
    setTaskStatus('submitted');
    // Afficher un indicateur de chargement initial
    console.log('[TaskManager] Soumission d\'une tâche à l\'agent IA...', Object.keys(data));

    try {
      // Vérifier que les données sont complètes
      if (!data.model || !data.providerName || !data.prompt) {
        console.error('[TaskManager] Données incomplètes pour la tâche:', data);
        throw new Error('Données incomplètes pour la tâche');
      }

      console.log('[TaskManager] Envoi de la requête à /api/agents/enqueue');
      const response = await fetch('/api/agents/enqueue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      console.log('[TaskManager] Réponse reçue:', response.status, response.statusText);
      // Afficher le corps de la réponse en cas d'erreur
      if (response.status !== 202) {
        const errorText = await response.text();
        console.error('[TaskManager] Corps de la réponse d\'erreur:', errorText);
        try {
          const errorData = JSON.parse(errorText) as ErrorResponse;
          throw new Error(errorData.error || `Erreur ${response.status}`);
        } catch (parseError) {
          throw new Error(`Erreur ${response.status}: ${errorText.substring(0, 100)}...`);
        }
      }
      
      const responseData = await response.json() as EnqueueResponse;
      console.log('[TaskManager] Tâche soumise avec succès, ID:', responseData.taskId);
      setActiveTaskId(responseData.taskId);
      setTaskStatus('processing');
      startPolling(responseData.taskId); // Commence à interroger le statut
      toast.info(`Tâche ${responseData.taskId.substring(0, 6)}... soumise.`);
      return { success: true, taskId: responseData.taskId };
    } catch (error) {
      console.error('[TaskManager] Exception lors de la soumission de la tâche:', error);
      setTaskStatus('failed');
      toast.error(`Échec de la soumission de la tâche: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
      // Gérer l'erreur dans l'UI
      return { success: false, error };
    }
  }, [pollingIntervalId, startPolling]);

  return {
    activeTaskId,
    taskStatus,
    submitAgentTask,
    startPolling,
    pollStatus
  };
}

// Composant pour afficher le statut de la tâche
export function TaskStatusIndicator({ status }: { status: 'idle' | 'submitted' | 'processing' | 'completed' | 'failed' }) {
  let statusText = '';
  let statusClass = '';

  switch (status) {
    case 'idle':
      statusText = 'Prêt';
      statusClass = 'text-gray-500';
      break;
    case 'submitted':
      statusText = 'Soumis';
      statusClass = 'text-blue-500 animate-pulse';
      break;
    case 'processing':
      statusText = 'En cours';
      statusClass = 'text-yellow-500 animate-pulse';
      break;
    case 'completed':
      statusText = 'Terminé';
      statusClass = 'text-green-500';
      break;
    case 'failed':
      statusText = 'Échoué';
      statusClass = 'text-red-500';
      break;
  }

  return (
    <div className={`flex items-center ${statusClass}`}>
      <span className="mr-2">{statusText}</span>
      {(status === 'submitted' || status === 'processing') && (
        <div className="w-4 h-4 border-2 border-current rounded-full border-t-transparent animate-spin"></div>
      )}
    </div>
  );
}
