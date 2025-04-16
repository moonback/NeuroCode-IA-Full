import { memo, useState } from 'react';
import { Markdown } from './Markdown';
import type { JSONValue } from 'ai';
import Popover from '~/components/ui/Popover';
import { workbenchStore } from '~/lib/stores/workbench';
import { WORK_DIR } from '~/utils/constants';

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
  const filteredAnnotations = (annotations?.filter(
    (annotation: JSONValue) => annotation && typeof annotation === 'object' && Object.keys(annotation).includes('type'),
  ) || []) as { type: string; value: any } & { [key: string]: any }[];

  let chatSummary: string | undefined = undefined;

  if (filteredAnnotations.find((annotation) => annotation.type === 'chatSummary')) {
    chatSummary = filteredAnnotations.find((annotation) => annotation.type === 'chatSummary')?.summary;
  }

  let codeContext: string[] | undefined = undefined;

  if (filteredAnnotations.find((annotation) => annotation.type === 'codeContext')) {
    codeContext = filteredAnnotations.find((annotation) => annotation.type === 'codeContext')?.files;
  }

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
                  className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center "
                  onClick={() => setIsPopoverOpen(false)}
                  style={{ isolation: 'isolate' }}
                >
                  <div 
                    className="w-[650px] bg-gray-900/95 rounded-xl shadow-2xl border border-gray-700/50 
                             animate-in fade-in zoom-in-95 duration-200 relative z-[10000]"
                    onClick={e => e.stopPropagation()}
                    style={{ marginTop: '-150px' }}
                  >
                    <div className="flex items-center justify-between p-3 border-b border-gray-700/50">
                      <div className="flex items-center gap-2">
                        <div className="i-ph:window-fill text-gray-400" />
                        <h2 className="text-sm font-medium text-gray-200">Informations contextuelles</h2>
                      </div>
                      <button 
                        onClick={() => setIsPopoverOpen(false)}
                        className="p-1 hover:bg-gray-800 rounded-full transition-colors"
                      >
                        <div className="i-ph:x-bold w-4 h-4 text-gray-400" />
                      </button>
                    </div>

                    <div className="p-4 space-y-4 max-h-[80vh] overflow-y-auto custom-scrollbar">
                      {chatSummary && (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-sm text-gray-300">
                            <div className="i-ph:text-aa-fill text-blue-400" />
                            <h3 className="font-medium">Résumé</h3>
                          </div>
                          <div className="relative prose prose-sm prose-invert max-h-[300px] overflow-y-auto custom-scrollbar bg-gray-800/30 rounded-lg p-3">
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                navigator.clipboard.writeText(chatSummary || '');
                                // Feedback visuel temporaire
                                const target = e.currentTarget;
                                target.classList.add('text-green-400');
                                setTimeout(() => target.classList.remove('text-green-400'), 1000);
                              }}
                              className="absolute top-2 right-2 p-1.5 rounded-md bg-gray-700/50 hover:bg-gray-700 transition-colors"
                              title="Copier le résumé"
                            >
                              <div className="i-ph:copy text-gray-400 hover:text-gray-200 w-4 h-4" />
                            </button>
                            <Markdown>{chatSummary}</Markdown>
                          </div>
                        </div>
                      )}
                      
                      {codeContext && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-sm text-gray-300">
                              <div className="i-ph:code-fill text-blue-400" />
                              <h3 className="font-medium">Fichiers référencés</h3>
                            </div>
                            <span className="text-xs text-gray-500">{codeContext.length} files</span>
                          </div>
                          <div className="bg-gray-800/30 rounded-lg p-3">
                            <div className="flex justify-between items-center mb-2">
                              <div className="text-xs text-gray-400">Cliquez sur un fichier pour l'ouvrir</div>
                              <div className="text-xs text-gray-500">{codeContext.length} fichiers</div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {codeContext.map((x, index) => {
                                const normalized = normalizedFilePath(x);
                                const extension = normalized.split('.').pop() || '';
                                // Déterminer l'icône et la couleur en fonction de l'extension
                                let iconClass = "i-ph:file-code";
                                let bgColorClass = "bg-blue-500/10";
                                let textColorClass = "text-blue-400";
                                let hoverBgClass = "hover:bg-blue-500/20";
                                let hoverTextClass = "hover:text-blue-300";
                                
                                if (['js', 'jsx', 'ts', 'tsx'].includes(extension)) {
                                  iconClass = "i-ph:file-js";
                                  bgColorClass = "bg-yellow-500/10";
                                  textColorClass = "text-yellow-400";
                                  hoverBgClass = "hover:bg-yellow-500/20";
                                  hoverTextClass = "hover:text-yellow-300";
                                } else if (['css', 'scss', 'sass'].includes(extension)) {
                                  iconClass = "i-ph:file-css";
                                  bgColorClass = "bg-purple-500/10";
                                  textColorClass = "text-purple-400";
                                  hoverBgClass = "hover:bg-purple-500/20";
                                  hoverTextClass = "hover:text-purple-300";
                                } else if (['html', 'htm'].includes(extension)) {
                                  iconClass = "i-ph:file-html";
                                  bgColorClass = "bg-orange-500/10";
                                  textColorClass = "text-orange-400";
                                  hoverBgClass = "hover:bg-orange-500/20";
                                  hoverTextClass = "hover:text-orange-300";
                                } else if (['json', 'yml', 'yaml'].includes(extension)) {
                                  iconClass = "i-ph:brackets-curly";
                                  bgColorClass = "bg-green-500/10";
                                  textColorClass = "text-green-400";
                                  hoverBgClass = "hover:bg-green-500/20";
                                  hoverTextClass = "hover:text-green-300";
                                } else if (['jpg', 'jpeg', 'png', 'gif', 'svg'].includes(extension)) {
                                  iconClass = "i-ph:image";
                                  bgColorClass = "bg-pink-500/10";
                                  textColorClass = "text-pink-400";
                                  hoverBgClass = "hover:bg-pink-500/20";
                                  hoverTextClass = "hover:text-pink-300";
                                }
                                
                                return (
                                  <code
                                    key={index}
                                    className={`text-xs ${bgColorClass} ${textColorClass} px-2 py-1.5 rounded-md 
                                      ${hoverBgClass} ${hoverTextClass} cursor-pointer transition-all
                                      flex items-center gap-1.5 group`}
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      openArtifactInWorkbench(normalized);
                                      setIsPopoverOpen(false); // Fermer le popover après avoir cliqué sur un fichier
                                    }}
                                    title={`Ouvrir ${normalized}`}
                                  >
                                    <div className={`${iconClass} group-hover:scale-110 transition-transform`} />
                                    {normalized}
                                  </code>
                                );
                              })}
                            </div>
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
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-gray-800/30 text-xs">
              <div className="i-ph:cpu text-gray-400" />
              <span className="text-gray-300 font-medium">{usage.totalTokens}</span>
              <span className="text-gray-500">tokens</span>
              <span className="text-gray-500 mx-1">|</span>
              <span className="text-blue-400/80">{usage.promptTokens}</span>
              <span className="text-gray-500">prompt</span>
              <span className="text-gray-500 mx-1">+</span>
              <span className="text-green-400/80">{usage.completionTokens}</span>
              <span className="text-gray-500">completion</span>
            </div>
          )}
        </div>
      </>
      <Markdown html>{content}</Markdown>
    </div>
  );
});
