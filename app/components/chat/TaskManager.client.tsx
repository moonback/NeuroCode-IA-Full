import { useState, useEffect, useCallback } from 'react';
import { toast } from 'react-toastify';


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
      const response = await fetch(`/api/tasks/${taskId}`);
      if (!response.ok) {
        // Gère 404 (not found) ou d'autres erreurs serveur
        if (response.status === 404) {
          console.warn(`Tâche ${taskId} non trouvée.`);
          // Peut-être arrêter le polling ici ou après quelques tentatives
        } else {
          console.error(`Erreur de polling ${response.status}`);
        }
        // Ne pas arrêter le polling immédiatement pour les erreurs serveur temporaires
        return;
      }

      const data = await response.json();

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

  const submitAgentTask = useCallback(async (data: any) => {
    if (pollingIntervalId) clearInterval(pollingIntervalId); // Arrête le polling précédent
    setActiveTaskId(null);
    setTaskStatus('submitted');
    // Afficher un indicateur de chargement initial

    try {
      const response = await fetch('/api/agents/enqueue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (response.status === 202) {
        const { taskId } = await response.json();
        setActiveTaskId(taskId);
        setTaskStatus('processing');
        startPolling(taskId); // Commence à interroger le statut
        toast.info(`Tâche ${taskId.substring(0, 6)}... soumise.`);
        return { success: true, taskId };
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || `Erreur ${response.status}`);
      }
    } catch (error) {
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