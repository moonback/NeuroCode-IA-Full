import { memo, useState, type Key, useCallback, useMemo } from 'react';
import { Markdown } from './Markdown';
import type { JSONValue } from 'ai';
import { workbenchStore } from '~/lib/stores/workbench';
import { WORK_DIR } from '~/utils/constants';
import Tooltip from '~/components/ui/Tooltip';

interface AssistantMessageProps {
  content: string;
  annotations?: JSONValue[];
}

// Utilitaire pour normaliser les chemins de fichiers
function normalizedFilePath(path: string) {
  let normalizedPath = path;

  if (normalizedPath.startsWith(WORK_DIR)) {
    normalizedPath = path.replace(WORK_DIR, '');
  }

  if (normalizedPath.startsWith('/')) {
    normalizedPath = normalizedPath.slice(1);
  }

  return normalizedPath;
}

// Fonction pour ouvrir un fichier dans le workbench
function openArtifactInWorkbench(filePath: string) {
  filePath = normalizedFilePath(filePath);

  if (workbenchStore.currentView.get() !== 'code') {
    workbenchStore.currentView.set('code');
  }

  workbenchStore.setSelectedFile(`${WORK_DIR}/${filePath}`);
}

// Interface pour les métriques de qualité
interface QualityMetrics {
  score: number;
  feedback: string | string[];
}

// Interface pour l'utilisation des tokens
interface TokenUsage {
  completionTokens: number;
  promptTokens: number;
  totalTokens: number;
}

// Composant pour afficher un badge de qualité
const QualityBadge = memo(({ metrics }: { metrics: QualityMetrics }) => {
  const getBadgeColor = (score: number) => {
    if (score >= 7) return 'bg-green-500/20 text-green-400';
    if (score >= 4) return 'bg-yellow-500/20 text-yellow-400';
    return 'bg-red-500/20 text-red-400';
  };

  const feedbackText = Array.isArray(metrics.feedback)
    ? metrics.feedback.join(', ')
    : metrics.feedback;

  return (
    <Tooltip tooltip={`Qualité: ${metrics.score}/10 - ${feedbackText}`}>
      <div className={`ml-2 px-1.5 py-0.5 rounded text-xs font-medium ${getBadgeColor(metrics.score)}`}>
        {metrics.score}/10
      </div>
    </Tooltip>
  );
});

// Composant pour afficher un fichier référencé
const CodeFile = memo(({ filePath, onFileClick }: { filePath: string; onFileClick: (path: string) => void }) => {
  const normalized = normalizedFilePath(filePath);
  
  const handleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onFileClick(normalized);
  }, [normalized, onFileClick]);

  return (
    <code
      className="text-xs bg-blue-500/10 text-blue-400 px-2 py-1.5 rounded-md 
        hover:bg-blue-500/20 hover:text-blue-300 cursor-pointer transition-all
        flex items-center gap-1.5 group"
      onClick={handleClick}
    >
      <div className="i-ph:file-code group-hover:scale-110 transition-transform" />
      {normalized}
    </code>
  );
});

// Composant pour afficher l'utilisation des tokens
const TokenUsageDisplay = memo(({ usage }: { usage: TokenUsage }) => (
  <Tooltip tooltip="Nombre total de tokens utilisés pour cette réponse">
    <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-gray-800/30 text-xs">
      <div className="i-ph:calculator text-gray-400" />
      <span>{usage.totalTokens} tokens</span>
      <span className="text-gray-500 text-[10px]">({usage.promptTokens}+{usage.completionTokens})</span>
    </div>
  </Tooltip>
));

// Composant pour le contenu du modal contextuel
const ContextModal = memo(({ 
  isOpen, 
  onClose, 
  chatSummary, 
  codeContext, 
  qualityMetrics 
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  chatSummary?: string; 
  codeContext?: string[];
  qualityMetrics?: QualityMetrics;
}) => {
  const [activeTab, setActiveTab] = useState<'summary' | 'code'>('summary');

  const handleFileClick = useCallback((filePath: string) => {
    openArtifactInWorkbench(filePath);
    onClose();
  }, [onClose]);

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center "
      onClick={onClose}
      style={{ isolation: 'isolate' }}
    >
      <div 
        className="w-[500px] max-w-[90vw] bg-gray-900/95 rounded-xl shadow-2xl border border-gray-700/50 
                 animate-in fade-in-50 duration-200 relative z-[10000]"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-3 border-b border-gray-700/50">
          <div className="flex items-center gap-2">
            <div className="i-ph:window-fill text-gray-400" />
            <h2 className="text-sm font-medium text-gray-200">Informations contextuelles</h2>
          </div>
          <button 
            onClick={onClose}
            className="p-1 hover:bg-gray-800 rounded-full transition-colors"
            aria-label="Fermer"
          >
            <div className="i-ph:x-bold w-4 h-4 text-gray-400" />
          </button>
        </div>

        {/* Tabs navigation */}
        {chatSummary && codeContext && (
          <div className="flex border-b border-gray-700/50">
            <button
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === 'summary' 
                  ? 'text-blue-400 border-b-2 border-blue-400' 
                  : 'text-gray-400 hover:text-gray-300'
              }`}
              onClick={() => setActiveTab('summary')}
            >
              Résumé
            </button>
            <button
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === 'code' 
                  ? 'text-blue-400 border-b-2 border-blue-400' 
                  : 'text-gray-400 hover:text-gray-300'
              }`}
              onClick={() => setActiveTab('code')}
            >
              Fichiers ({codeContext.length})
            </button>
          </div>
        )}

        <div className="p-4 space-y-4 max-h-[80vh] overflow-y-auto custom-scrollbar">
          {/* Summary tab content */}
          {chatSummary && (activeTab === 'summary' || !codeContext) && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-gray-300">
                <div className="i-ph:text-aa-fill text-blue-400" />
                <h3 className="font-medium">Résumé</h3>
                
                {qualityMetrics && <QualityBadge metrics={qualityMetrics} />}
              </div>
              <div className="prose prose-sm prose-invert max-h-[400px] overflow-y-auto custom-scrollbar bg-gray-800/30 rounded-lg p-3">
                <Markdown>{chatSummary}</Markdown>
              </div>
            </div>
          )}
          
          {/* Code context tab content */}
          {codeContext && (activeTab === 'code' || !chatSummary) && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-gray-300">
                  <div className="i-ph:code-fill text-blue-400" />
                  <h3 className="font-medium">Fichiers référencés</h3>
                </div>
                <span className="text-xs text-gray-500">{codeContext.length} fichiers</span>
              </div>
              <div className="flex flex-wrap gap-2 bg-gray-800/30 rounded-lg p-3 max-h-[400px] overflow-y-auto">
                {codeContext.map((filePath: string, index: Key) => (
                  <CodeFile key={index} filePath={filePath} onFileClick={handleFileClick} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

// Composant principal pour les messages de l'assistant
export const AssistantMessage = memo(({ content, annotations }: AssistantMessageProps) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // Extraction et traitement des annotations avec useMemo pour optimiser les performances
  const { 
    chatSummary, 
    codeContext, 
    qualityMetrics, 
    usage 
  } = useMemo(() => {
    // Filtrage des annotations avec type safety
    const filteredAnnotations = (annotations?.filter(
      (annotation: JSONValue) => annotation && typeof annotation === 'object' && Object.keys(annotation).includes('type'),
    ) || []) as { type: string; value: any } & { [key: string]: any }[];

    // Extraction du résumé du chat
    const chatSummaryAnnotation = filteredAnnotations.find((annotation) => annotation.type === 'chatSummary');
    const chatSummary = chatSummaryAnnotation?.summary;
    
    // Extraction des métriques de qualité
    const qualityMetricsAnnotation = filteredAnnotations.find((annotation) => annotation.type === 'qualityMetrics');
    const qualityMetrics = chatSummaryAnnotation?.qualityMetrics || 
                          qualityMetricsAnnotation?.value || 
                          qualityMetricsAnnotation;
    
    // Extraction du contexte de code
    const codeContextAnnotation = filteredAnnotations.find((annotation) => annotation.type === 'codeContext');
    const codeContext = codeContextAnnotation?.files;

    // Extraction de l'utilisation des tokens
    const usage = filteredAnnotations.find((annotation) => annotation.type === 'usage')?.value;

    return { chatSummary, codeContext, qualityMetrics, usage };
  }, [annotations]);

  // Gestionnaires d'événements avec useCallback pour éviter les re-rendus inutiles
  const handleOpenModal = useCallback(() => setIsModalOpen(true), []);
  const handleCloseModal = useCallback(() => setIsModalOpen(false), []);

  return (
    <div className="overflow-hidden w-full">
      <div className="flex gap-2 items-center text-sm text-bolt-elements-textSecondary mb-2">
        {(codeContext || chatSummary) && (
          <div 
            className="group flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-gray-800/50 cursor-pointer"
            onClick={handleOpenModal}
          >
            <div className="i-ph:info-fill text-blue-400/80 group-hover:text-blue-400" />
            <span className="text-xs text-gray-400 group-hover:text-gray-300">
              Contexte et résumé
            </span>
          </div>
        )}

        

        {usage && <TokenUsageDisplay usage={usage} />}
        {qualityMetrics && <QualityBadge metrics={qualityMetrics} />}
      </div>

      {/* Modal contextuel */}
      <ContextModal 
        isOpen={isModalOpen} 
        onClose={handleCloseModal} 
        chatSummary={chatSummary} 
        codeContext={codeContext} 
        qualityMetrics={qualityMetrics} 
      />

      {/* Contenu du message */}
      <Markdown html>{content}</Markdown>
    </div>
  );
});
