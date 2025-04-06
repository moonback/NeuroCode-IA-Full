import { memo, useState, useMemo } from 'react';

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
 // Use memoization to prevent unnecessary re-renders during streaming
 const memoizedContent = useMemo(() => content, [content]);

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
                  className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center"
                  onClick={() => setIsPopoverOpen(false)}
                  style={{ isolation: 'isolate' }}
                >
                  <div 
                    className="w-[600px] ml-4 mt-[-150px] bg-gray-900/95 rounded-xl shadow-2xl border border-gray-700/50 
                             animate-in slide-in-from-left duration-200 relative z-[10000]"
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
                          <div className="prose prose-sm prose-invert max-h-[300px] overflow-y-auto custom-scrollbar bg-gray-800/30 rounded-lg p-3">
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
                          <div className="flex flex-wrap gap-2 bg-gray-800/30 rounded-lg p-3">
                            {codeContext.map((x, index) => {
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
            <div>
              Tokens: {usage.totalTokens} (prompt: {usage.promptTokens}, completion: {usage.completionTokens})
            </div>
          )}
        </div>
      </>
      <Markdown html>{memoizedContent}</Markdown>
    </div>
  );
});
