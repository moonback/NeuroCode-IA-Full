import { memo, useState, type Key } from 'react';
import { Markdown } from './Markdown';
import type { JSONValue } from 'ai';
import Popover from '~/components/ui/Popover';
import { workbenchStore } from '~/lib/stores/workbench';
import { WORK_DIR } from '~/utils/constants';
import Tooltip from '~/components/ui/Tooltip';

interface AssistantMessageProps {
  content: string;
  annotations?: JSONValue[];
}

function openArtifactInWorkbench(filePath: string) {
  filePath = normalizedFilePath(filePath);

  if (workbenchStore.currentView.get() !== 'code') {
    workbenchStore.currentView.set('code');
  }

  workbenchStore.setSelectedFile(`${WORK_DIR}/${filePath}`);
}

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

export const AssistantMessage = memo(({ content, annotations }: AssistantMessageProps) => {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'summary' | 'code'>('summary');
  
  // Improved filtering with type safety
  const filteredAnnotations = (annotations?.filter(
    (annotation: JSONValue) => annotation && typeof annotation === 'object' && Object.keys(annotation).includes('type'),
  ) || []) as { type: string; value: any } & { [key: string]: any }[];

  // Extract chat summary
  const chatSummaryAnnotation = filteredAnnotations.find((annotation) => annotation.type === 'chatSummary');
  const chatSummary = chatSummaryAnnotation?.summary;
  
  // Extract quality metrics if available - fix the extraction path
  const qualityMetrics = chatSummaryAnnotation?.qualityMetrics || 
                         filteredAnnotations.find((annotation) => annotation.type === 'qualityMetrics')?.value;
  
  // Add debug logging to see what's in the annotations
  console.log('Filtered annotations:', filteredAnnotations);
  console.log('Chat summary annotation:', chatSummaryAnnotation);
  console.log('Quality metrics:', qualityMetrics);

  // Extract code context
  const codeContextAnnotation = filteredAnnotations.find((annotation) => annotation.type === 'codeContext');
  const codeContext = codeContextAnnotation?.files;

  // Extract token usage
  const usage: {
    completionTokens: number;
    promptTokens: number;
    totalTokens: number;
  } = filteredAnnotations.find((annotation) => annotation.type === 'usage')?.value;

  return (
    <div className="overflow-hidden w-full">
      <>
        <div className="flex gap-2 items-center text-sm text-bolt-elements-textSecondary mb-2">
          {(codeContext || chatSummary) && (
            <>
              <div 
                className="group flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-gray-800/50 cursor-pointer"
                onClick={() => setIsPopoverOpen(true)}
              >
                <div className="i-ph:info-fill text-blue-400/80 group-hover:text-blue-400" />
                <span className="text-xs text-gray-400 group-hover:text-gray-300">
                  Contexte et résumé
                </span>
              </div>

              {isPopoverOpen && (
                <div 
                  className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center gap-2 "
                  onClick={() => setIsPopoverOpen(false)}
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
                        onClick={() => setIsPopoverOpen(false)}
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
                            
                            {qualityMetrics && (
                              <Tooltip tooltip={`Qualité: ${qualityMetrics.score}/10 - ${
                                Array.isArray(qualityMetrics.feedback) 
                                  ? qualityMetrics.feedback.join(', ') 
                                  : qualityMetrics.feedback
                              }`}>
                                <div className={`ml-2 px-1.5 py-0.5 rounded text-xs font-medium ${
                                  qualityMetrics.score >= 7 
                                    ? 'bg-green-500/20 text-green-400' 
                                    : qualityMetrics.score >= 4 
                                      ? 'bg-yellow-500/20 text-yellow-400' 
                                      : 'bg-red-500/20 text-red-400'
                                }`}>
                                  {qualityMetrics.score}/10
                                </div>
                              </Tooltip>
                            )}
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
                            {codeContext.map((x: string, index: Key | null | undefined) => {
                              const normalized = normalizedFilePath(x);
                              return (
                                <code
                                  key={index}
                                  className="text-xs bg-blue-500/10 text-blue-400 px-2 py-1.5 rounded-md 
                                    hover:bg-blue-500/20 hover:text-blue-300 cursor-pointer transition-all
                                    flex items-center gap-1.5 group"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    openArtifactInWorkbench(normalized);
                                    setIsPopoverOpen(false);
                                  }}
                                >
                                  <div className="i-ph:file-code group-hover:scale-110 transition-transform" />
                                  {normalized}
                                </code>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
          {usage && (
            <Tooltip tooltip="Nombre total de tokens utilisés pour cette réponse">
              <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-gray-800/30 text-xs">
                <div className="i-ph:calculator text-gray-400" />
                <span>{usage.totalTokens} tokens</span>
                <span className="text-gray-500 text-[10px]">({usage.promptTokens}+{usage.completionTokens})</span>
              </div>
            </Tooltip>
          )}
        </div>
      </>
      <Markdown html>{content}</Markdown>
    </div>
  );
});
