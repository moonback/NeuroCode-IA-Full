/*
 * @ts-nocheck
 * Preventing TS checks with files presented in the video for a better presentation.
 */
import type { JSONValue, Message } from 'ai';
import React, { type RefCallback, useEffect, useState } from 'react';
import { ClientOnly } from 'remix-utils/client-only';
import { Menu } from '~/components/sidebar/Menu.client';
import { IconButton } from '~/components/ui/IconButton';
import { Workbench } from '~/components/workbench/Workbench.client';
import { classNames } from '~/utils/classNames';
import { PROVIDER_LIST } from '~/utils/constants';
import { Messages } from './Messages.client';
import { SendButton } from './SendButton.client';
import { APIKeyManager, getApiKeysFromCookies } from './APIKeyManager';
import Cookies from 'js-cookie';
import * as Tooltip from '@radix-ui/react-tooltip';

import styles from './BaseChat.module.scss';
import { ExportChatButton } from '~/components/chat/chatExportAndImport/ExportChatButton';
import { ImportButtons } from '~/components/chat/chatExportAndImport/ImportButtons';
import { ExamplePrompts } from '~/components/chat/ExamplePrompts';
import GitCloneButton from './GitCloneButton';

import FilePreview from './FilePreview';
import { ModelSelector } from '~/components/chat/ModelSelector';
import { SpeechRecognitionButton } from '~/components/chat/SpeechRecognition';
import type { ProviderInfo } from '~/types/model';
import { ScreenshotStateManager } from './ScreenshotStateManager';
import { toast } from 'react-toastify';
import StarterTemplates from './StarterTemplates';
import type { ActionAlert, SupabaseAlert, DeployAlert } from '~/types/actions';
import DeployChatAlert from '../deploy/DeployAlert';
import ChatAlert from './ChatAlert';
import type { ModelInfo } from '~/lib/modules/llm/types';
import ProgressCompilation from './ProgressCompilation';
import type { ProgressAnnotation } from '~/types/context';
import type { ActionRunner } from '~/lib/runtime/action-runner';
import { enableContextOptimizationStore, LOCAL_PROVIDERS } from '~/lib/stores/settings';
import { SupabaseChatAlert } from '~/components/chat/SupabaseAlert';
import { SupabaseConnection } from './SupabaseConnection';
import { TargetedFilesDisplay } from './TargetedFilesDisplay';
import { useStore } from '@nanostores/react';
import { useSettings } from '~/lib/hooks/useSettings';
import { EnhancedContextCacheManager } from './EnhancedContextCacheManager';
import { TaskStatusIndicator } from './TaskManager.client';


const TEXTAREA_MIN_HEIGHT = 76;
/*
 * Flag to use only fallback method
 * const USE_ONLY_FALLBACK = true;
 */
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

interface BaseChatProps {
  textareaRef?: React.RefObject<HTMLTextAreaElement> | undefined;
  messageRef?: RefCallback<HTMLDivElement> | undefined;
  scrollRef?: RefCallback<HTMLDivElement> | undefined;
  showChat?: boolean;
  chatStarted?: boolean;
  isStreaming?: boolean;
  onStreamingChange?: (streaming: boolean) => void;
  messages?: Message[];
  description?: string;
  enhancingPrompt?: boolean;
  promptEnhanced?: boolean;
  input?: string;
  model?: string;
  setModel?: (model: string) => void;
  provider?: ProviderInfo;
  setProvider?: (provider: ProviderInfo) => void;
  providerList?: ProviderInfo[];
  handleStop?: () => void;
  sendMessage?: (event: React.UIEvent, messageInput?: string) => void;
  handleInputChange?: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  enhancePrompt?: () => void;
  importChat?: (description: string, messages: Message[]) => Promise<void>;
  exportChat?: () => void;
  uploadedFiles?: File[];
  setUploadedFiles?: (files: File[]) => void;
  imageDataList?: string[];
  setImageDataList?: (dataList: string[]) => void;
  actionAlert?: ActionAlert;
  clearAlert?: () => void;
  supabaseAlert?: SupabaseAlert;
  clearSupabaseAlert?: () => void;
  deployAlert?: DeployAlert;
  clearDeployAlert?: () => void;
  data?: JSONValue[] | undefined;
  actionRunner?: ActionRunner;
  // Propriétés pour le gestionnaire de tâches
  taskStatus?: 'idle' | 'submitted' | 'processing' | 'completed' | 'failed';
  activeTaskId?: string | null;
  TaskStatusIndicator?: React.ComponentType<{status: 'idle' | 'submitted' | 'processing' | 'completed' | 'failed'}>;
  submitAgentTask?: (prompt: string, options?: Record<string, any>) => Promise<void>;
}

export const BaseChat = React.forwardRef<HTMLDivElement, BaseChatProps>(
  (
    {
      textareaRef,
      messageRef,
      scrollRef,
      showChat = true,
      chatStarted = false,
      isStreaming = false,
      onStreamingChange,
      model,
      setModel,
      provider,
      setProvider,
      providerList,
      input = '',
      enhancingPrompt,
      handleInputChange,

      // promptEnhanced,
      enhancePrompt,
      sendMessage,
      handleStop,
      importChat,
      exportChat,
      uploadedFiles = [],
      setUploadedFiles,
      imageDataList = [],
      setImageDataList,
      messages,
      actionAlert,
      clearAlert,
      supabaseAlert,
      clearSupabaseAlert,
      deployAlert,
      clearDeployAlert,
      data,
      actionRunner,
      // Add these props to the destructuring
      taskStatus,
      TaskStatusIndicator,
    },
    ref,
  ) => {
    const TEXTAREA_MAX_HEIGHT = chatStarted ? 400 : 200;
    const [apiKeys, setApiKeys] = useState<Record<string, string>>(getApiKeysFromCookies());
    const [modelList, setModelList] = useState<ModelInfo[]>([]);
    const [isModelSettingsCollapsed, setIsModelSettingsCollapsed] = useState(true);
    const [isListening, setIsListening] = useState(false);
    const [recognition, setRecognition] = useState<SpeechRecognition | null>(null);
    const [transcript, setTranscript] = useState('');
    const [isModelLoading, setIsModelLoading] = useState<string | undefined>('all');
    const [progressAnnotations, setProgressAnnotations] = useState<ProgressAnnotation[]>([]);
    const contextOptimizationEnabled = useStore(enableContextOptimizationStore);
    const { autoSelectTemplate } = useSettings();
    
    useEffect(() => {
      if (data) {
        const progressList = data.filter(
          (x) => typeof x === 'object' && (x as any).type === 'progress',
        ) as ProgressAnnotation[];
        setProgressAnnotations(progressList);
      }
    }, [data]);

    useEffect(() => {
      console.log(transcript);
    }, [transcript]);

    useEffect(() => {
      onStreamingChange?.(isStreaming);
    }, [isStreaming, onStreamingChange]);

    useEffect(() => {
      if (typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;

        recognition.onresult = (event) => {
          const transcript = Array.from(event.results)
            .map((result) => result[0])
            .map((result) => result.transcript)
            .join('');

          setTranscript(transcript);

          if (handleInputChange) {
            const syntheticEvent = {
              target: { value: transcript },
            } as React.ChangeEvent<HTMLTextAreaElement>;
            handleInputChange(syntheticEvent);
          }
        };

        recognition.onerror = (event) => {
          console.error('Speech recognition error:', event.error);
          setIsListening(false);
        };

        setRecognition(recognition);
      }
    }, []);

    useEffect(() => {
      if (typeof window !== 'undefined') {
        let parsedApiKeys: Record<string, string> | undefined = {};

        try {
          parsedApiKeys = getApiKeysFromCookies();
          setApiKeys(parsedApiKeys);
        } catch (error) {
          console.error('Error loading API keys from cookies:', error);
          Cookies.remove('apiKeys');
        }

        setIsModelLoading('all');
        fetch('/api/models')
          .then((response) => response.json())
          .then((data) => {
            const typedData = data as { modelList: ModelInfo[] };
            setModelList(typedData.modelList);
          })
          .catch((error) => {
            console.error('Error fetching model list:', error);
          })
          .finally(() => {
            setIsModelLoading(undefined);
          });
      }
    }, [providerList, provider]);

    const onApiKeysChange = async (providerName: string, apiKey: string) => {
      const newApiKeys = { ...apiKeys, [providerName]: apiKey };
      setApiKeys(newApiKeys);
      Cookies.set('apiKeys', JSON.stringify(newApiKeys));

      setIsModelLoading(providerName);

      let providerModels: ModelInfo[] = [];

      try {
        const response = await fetch(`/api/models/${encodeURIComponent(providerName)}`);
        const data = await response.json();
        providerModels = (data as { modelList: ModelInfo[] }).modelList;
      } catch (error) {
        console.error('Error loading dynamic models for:', providerName, error);
      }

      // Only update models for the specific provider
      setModelList((prevModels) => {
        const otherModels = prevModels.filter((model) => model.provider !== providerName);
        return [...otherModels, ...providerModels];
      });
      setIsModelLoading(undefined);
    };

    const startListening = () => {
      if (recognition) {
        recognition.start();
        setIsListening(true);
      }
    };

    const stopListening = () => {
      if (recognition) {
        recognition.stop();
        setIsListening(false);
      }
    };

    const handleSendMessage = (event: React.UIEvent, messageInput?: string) => {
      if (sendMessage) {
        sendMessage(event, messageInput);

        if (recognition) {
          recognition.abort(); // Stop current recognition
          setTranscript(''); // Clear transcript
          setIsListening(false);

          // Clear the input by triggering handleInputChange with empty value
          if (handleInputChange) {
            const syntheticEvent = {
              target: { value: '' },
            } as React.ChangeEvent<HTMLTextAreaElement>;
            handleInputChange(syntheticEvent);
          }
        }
      }
    };

    const handleFileUpload = () => {
      // Vérifier si la sélection automatique de template est activée
      if (autoSelectTemplate) {
        toast.warning(
          <div>
            <div className="font-bold">Importation de fichiers désactivée</div>
            <div className="text-xs text-gray-200">
              L'importation de fichiers est désactivée lorsque la sélection automatique de template est activée.
              Désactivez cette option dans les paramètres pour pouvoir importer des fichiers.
            </div>
          </div>,
          { autoClose: 5000 },
        );
        return;
      }

      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*,.txt,.md,.docx,.pdf';
      input.multiple = true;

      input.onchange = async (e) => {
        const selectedFiles = Array.from((e.target as HTMLInputElement).files || []);
        processNewFiles(selectedFiles, 'upload');
      };
      input.click();
    };
         // Unified file processing function
    const processNewFiles = (filesToProcess: File[], source: 'upload' | 'paste') => {
      // Vérifier si la sélection automatique de template est activée
      if (autoSelectTemplate) {
        toast.warning(
          <div>
            <div className="font-bold">Importation de fichiers désactivée</div>
            <div className="text-xs text-gray-200">
              L'importation de fichiers est désactivée lorsque la sélection automatique de template est activée.
              Désactivez cette option dans les paramètres pour pouvoir importer des fichiers.
            </div>
          </div>,
          { autoClose: 5000 },
        );
        return;
      }
      
      // Validate file types and sizes first
      const filteredFiles = filesToProcess.filter((file) => {
        // Block script files
        if (file.name.match(/\.(sh|bat|ps1)$/i)) {
          toast.error(
            <div>
              <div className="font-bold">Les fichiers de script ne sont pas autorisés</div>
              <div className="text-xs text-gray-200">
              Pour des raisons de sécurité, les fichiers de script (.sh, .bat, .ps1) ne sont pas pris en charge.
              </div>
            </div>,
            { autoClose: 5000 },
          );
          return false;
        }

          // Validate file size
        if (file.size > MAX_FILE_SIZE) {
          toast.warning(`Ficher ${file.name} dépasse la taille maximale de 5 Mo et a été ignoré.`);
          return false;
        }
      

        return true;
      });

      if (filteredFiles.length === 0) {
        return;
      }

      // Prepare new files array
      const newUploadedFiles = [...uploadedFiles, ...filteredFiles];
      const newImageDataList = [
        ...imageDataList,
        ...filteredFiles.map((file) => (file.type.startsWith('image/') ? 'loading-image' : 'non-image')),
      ];

      // Update state
      setUploadedFiles?.(newUploadedFiles);
      setImageDataList?.(newImageDataList);

      // Process individual files
      filteredFiles.forEach((file, index) => {
        const actualIndex = uploadedFiles.length + index;
        processIndividualFiles(file, actualIndex, source);
      });
    };

    const processIndividualFiles = (file: File, index: number, _source: 'upload' | 'paste') => {
      if (file.type.startsWith('image/')) {
        processImageFile(file, index);
      } else if (file.type.includes('text') || file.name.match(/\.(txt|md|pdf|docx)$/i)) {
        previewTextFile(file, index);
      }
    };

    // Rename and update processPastedFiles to use new unified function
    const processPastedFiles = (filesToProcess: File[]) => {
      processNewFiles(filesToProcess, 'paste');
    };

    // Function to process image files
    const processImageFile = (file: File, _index: number) => {
      // Handle image files for display
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();

        reader.onload = (e) => {
          if (e.target && e.target.result && setImageDataList) {
            setImageDataList([...imageDataList, e.target.result as string]);
          }
        };
        reader.readAsDataURL(file);

        toast.info(
          <div>
            <div className="font-bold">Image ci-jointe :</div>
            <div className="text-xs text-gray-200 bg-gray-800 p-2 mt-1 rounded">
              {file.name} ({Math.round(file.size / 1024)} KB)
            </div>
          </div>,
          { autoClose: 3000 },
        );
      } else if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        // Special handling for PDF files
        const fileSize = Math.round(file.size / 1024);
        const isLargePdf = fileSize > 5000; // 5MB threshold

        const toastId = toast.info(
          <div>
            <div className="font-bold">PDF ci-joint :</div>
            <div className="text-xs text-gray-200 bg-gray-800 p-2 mt-1 rounded">
              {file.name} ({fileSize} KB){isLargePdf ? ' - Fichier volumineux, le traitement peut prendre plus de temps' : ''}
            </div>
            <div className="mt-2">
              <div className="w-full bg-gray-700 rounded-full h-2.5 mb-1">
                <div className="bg-blue-600 h-2.5 rounded-full w-1/4"></div>
              </div>
              <div className="text-xs text-gray-400">Extraction de texte...</div>
            </div>
          </div>,
          { autoClose: false },
        );

        // Process the PDF file asynchronously
        import('~/utils/documentUtils').then(async ({ extractTextFromDocument }) => {
          try {
            await extractTextFromDocument(file);

            // Update toast with success message
            toast.update(toastId, {
              render: (
                <div>
                  <div className="font-bold">PDF traité avec succès:</div>
                  <div className="text-xs text-gray-200 bg-gray-800 p-2 mt-1 rounded">
                    {file.name} ({fileSize} KB)
                  </div>
                  <div className="mt-1 text-xs text-green-400">Texte extrait et prêt à être envoyé</div>
                </div>
              ),
              autoClose: 3000,
              type: 'success',
            });
          } catch (error) {
            console.error('Error processing PDF:', error);

            // Update toast with error message
            toast.update(toastId, {
              render: (
                <div>
                  <div className="font-bold">Erreur lors du traitement du PDF:</div>
                  <div className="text-xs text-gray-200 bg-gray-800 p-2 mt-1 rounded">
                    {file.name} ({fileSize} KB)
                  </div>
                  <div className="mt-1 text-xs text-red-400">
                  Le fichier sera joint mais l'extraction du texte a rencontré des problèmes
                  </div>
                </div>
              ),
              autoClose: 5000,
              type: 'error',
            });
          }
        });
      }
    };

    // Function to process text files and show preview
    const previewTextFile = (file: File, _index: number) => {
      // If it's a PDF or DOCX file, show a special preview
      if (
        file.type === 'application/pdf' ||
        file.name.endsWith('.pdf') ||
        file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        file.name.endsWith('.docx')
      ) {
        toast.info(
          <div>
            <div className="font-bold">Fichier de document joint :</div>
            <div className="text-xs text-gray-200 bg-gray-800 p-2 mt-1 rounded flex items-center">
              <div
                className={
                  file.type === 'application/pdf' || file.name.endsWith('.pdf')
                    ? 'i-ph:file-pdf text-red-500 mr-2'
                    : 'i-ph:file-doc text-blue-500 mr-2'
                }
                style={{ fontSize: '1.25rem' }}
              ></div>
              <div>
                <div>{file.name}</div>
                <div className="text-xs text-gray-400">
                  {Math.round(file.size / 1024)} KB - Le texte sera extrait lors de l'envoi
                </div>
              </div>
            </div>
          </div>,
          { autoClose: 4000 },
        );

        return;
      }

      // For other file types, maintain previous behavior
      toast.info(
        <div>
          <div className="font-bold">Fichier joint :</div>
          <div className="text-xs text-gray-200 bg-gray-800 p-2 mt-1 rounded">
            {file.name} ({Math.round(file.size / 1024)} KB)
          </div>
        </div>,
        { autoClose: 3000 },
      );    };

    const handlePaste = async (e: React.ClipboardEvent) => {
      const items = e.clipboardData?.items;

      if (!items) {
        return;
      }

      // Check if there are files in the clipboard
      const clipboardFiles: File[] = [];

      for (const item of items) {
        if (item.kind === 'file') {
          const file = item.getAsFile();

          if (file) {
            clipboardFiles.push(file);
          }
        }
      }

      if (clipboardFiles && clipboardFiles.length > 0) {
        // If there are PDF or DOCX files, check possible filters
        if (
          clipboardFiles.some(
            (file) =>
              file.type === 'application/pdf' ||
              file.name.endsWith('.pdf') ||
              file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
              file.name.endsWith('.docx'),
          )
        ) {
          // Filter large files
          const filteredFiles = clipboardFiles.filter((file) => file.size <= MAX_FILE_SIZE);

          if (filteredFiles.length < clipboardFiles.length) {
            toast.warning('Certains fichiers ont été ignorés car ils dépassent la taille maximale de 100 Mo.');

            // Continue only with valid files
            processPastedFiles(filteredFiles);
          } else {
            processPastedFiles(clipboardFiles);
          }
        } else {
          processPastedFiles(clipboardFiles);
        }
      }
    };

    const baseChat = (
      <div
        ref={ref}
        className={classNames(styles.BaseChat, 'relative flex h-full w-full overflow-hidden')}
        data-chat-visible={showChat}
      >
        <ClientOnly>{() => <Menu />}</ClientOnly>
        <div ref={scrollRef} className="flex flex-col lg:flex-row overflow-y-auto w-full h-full">
          <div className={classNames(styles.Chat, 'flex flex-col flex-grow lg:min-w-[var(--chat-min-width)] h-full')}>
            {!chatStarted && (
              <div id="intro" className="mt-[5vh] max-w-chat mx-auto text-center px-4 lg:px-0">
                <h1 className="text-3xl lg:text-6xl font-bold text-bolt-elements-textPrimary mb-4 animate-fade-in">
                  NeuroCode Assistant
                </h1>
                <p className="text-md lg:text-xl mb-8 text-bolt-elements-textSecondary animate-fade-in animation-delay-200">
                  Transformez vos idées en solutions concrètes.
                </p>
              </div>
            )}
            <div
              className={classNames('pt-6 px-2 sm:px-6', {
                'h-full flex flex-col': chatStarted,
              })}
              ref={scrollRef}
            >
              <ClientOnly>
                {() => {
                  return chatStarted ? (
                    <Messages
                      ref={messageRef}
                      className="flex flex-col w-full flex-1 max-w-chat pb-6 mx-auto z-1"
                      messages={messages}
                      isStreaming={isStreaming}
                    />
                  ) : null;
                }}
              </ClientOnly>
              {deployAlert && (
                <DeployChatAlert
                  alert={deployAlert}
                  clearAlert={() => clearDeployAlert?.()}
                  postMessage={(message: string | undefined) => {
                    sendMessage?.({} as any, message);
                    clearSupabaseAlert?.();
                  }}
                />
              )}
              {supabaseAlert && (
                <SupabaseChatAlert
                  alert={supabaseAlert}
                  clearAlert={() => clearSupabaseAlert?.()}
                  postMessage={(message) => {
                    sendMessage?.({} as any, message);
                    clearSupabaseAlert?.();
                  }}
                />
              )}
              <div
                className={classNames('flex flex-col gap-4 w-full max-w-chat mx-auto z-prompt mb-6', {
                  'sticky bottom-2': chatStarted,
                })}
              >
                <div className="bg-bolt-elements-background-depth-2">
                  {actionAlert && (
                    <ChatAlert
                      alert={actionAlert}
                      clearAlert={() => clearAlert?.()}
                      postMessage={(message) => {
                        sendMessage?.({} as any, message);
                        clearAlert?.();
                      }}
                    />
                  )}
                </div>
                              <div
                  className={classNames(
                    'bg-bolt-elements-background-depth-2 p-3 rounded-lg border border-bolt-elements-borderColor relative w-full max-w-chat mx-auto z-prompt',

                    /*
                     * {
                     *   'sticky bottom-2': chatStarted,
                     * },
                     */
                  )}
                >
                  <svg className={classNames(styles.PromptEffectContainer)}>
                    <defs>
                      <linearGradient
                        id="line-gradient"
                        x1="20%"
                        y1="0%"
                        x2="-14%"
                        y2="10%"
                        gradientUnits="userSpaceOnUse"
                        gradientTransform="rotate(-45)"
                      >
                        <stop offset="0%" stopColor="#b44aff" stopOpacity="0%"></stop>
                        <stop offset="40%" stopColor="#b44aff" stopOpacity="80%"></stop>
                        <stop offset="50%" stopColor="#b44aff" stopOpacity="80%"></stop>
                        <stop offset="100%" stopColor="#b44aff" stopOpacity="0%"></stop>
                      </linearGradient>
                      
                      <linearGradient id="shine-gradient">
                        <stop offset="0%" stopColor="white" stopOpacity="0%"></stop>
                        <stop offset="40%" stopColor="#ffffff" stopOpacity="80%"></stop>
                        <stop offset="50%" stopColor="#ffffff" stopOpacity="80%"></stop>
                        <stop offset="100%" stopColor="white" stopOpacity="0%"></stop>
                      </linearGradient>
                    </defs>
                    <rect className={classNames(styles.PromptEffectLine)} pathLength="100" strokeLinecap="round"></rect>
                    <rect className={classNames(styles.PromptShine)} x="48" y="24" width="70" height="1"></rect>
                  </svg>
                  <div>
                    <ClientOnly>
                      
                      {() => (
                        <div className={isModelSettingsCollapsed ? 'hidden' : ''}>
                          
                          <ModelSelector
                            key={provider?.name + ':' + modelList.length}
                            model={model}
                            setModel={setModel}
                            modelList={modelList}
                            provider={provider}
                            setProvider={setProvider}
                            providerList={providerList || (PROVIDER_LIST as ProviderInfo[])}
                            apiKeys={apiKeys}
                            modelLoading={isModelLoading}
                          />
                          {(providerList || []).length > 0 &&
                            provider &&
                            (!LOCAL_PROVIDERS.includes(provider.name) || 'OpenAILike') && (
                              <APIKeyManager
                                provider={provider}
                                apiKey={apiKeys[provider.name] || ''}
                                setApiKey={(key) => {
                                  onApiKeysChange(provider.name, key);
                                }}
                              />
                            )}
                        </div>
                      )}
                    </ClientOnly>
                  </div>
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      {contextOptimizationEnabled && progressAnnotations.length > 0 && (
                        <div className="animate-fade-in mb-2">
                          <ProgressCompilation data={progressAnnotations} />
                        </div>
                      )}
                    </div>
                    <div className="flex-2 ml-4">
                      {/* Ajout du gestionnaire de cache de contexte amélioré */}
                      {chatStarted && contextOptimizationEnabled && <EnhancedContextCacheManager />}
                    </div>
                  </div>
                    
                  <FilePreview
                    files={uploadedFiles}
                    imageDataList={imageDataList}
                    model={model}
                    provider={provider}
                    
                    onRemove={(index) => {
                      if (index === -1) {
                        // Clear all files
                        setUploadedFiles?.([]);
                        setImageDataList?.([]);
                        toast.success('Tous les fichiers ont été supprimés');
                      } else {
                        // Remove single file
                        setUploadedFiles?.(uploadedFiles.filter((_, i) => i !== index));
                        setImageDataList?.(imageDataList.filter((_, i) => i !== index));
                      }
                    }}
                  />
                  <ClientOnly>
                    {() => (
                      <ScreenshotStateManager
                        setUploadedFiles={setUploadedFiles}
                        setImageDataList={setImageDataList}
                        uploadedFiles={uploadedFiles}
                        imageDataList={imageDataList}
                      />
                    )}
                    
                  </ClientOnly>
                  <div
                    className={classNames(
                      'relative shadow-xs border border-bolt-elements-borderColor backdrop-blur rounded-lg',
                    )}
                  >
                    <textarea
                      id="chat-textarea"
                      data-targeted-files="[]"
                      ref={textareaRef}
                      className={classNames(
                        'w-full px-6 py-5 rounded-2xl outline-none resize-none text-bolt-elements-textPrimary placeholder-bolt-elements-textTertiary/60 bg-bolt-elements-background-depth-3 text-base transition-all duration-300 ',
                        'transition-all duration-200',
                        'hover:border-bolt-elements-focus',
                      )}
                      onDragEnter={(e) => {
                        e.preventDefault();
                        e.stopPropagation();

                        const files = Array.from(e.dataTransfer.files);
                        
                        // Check if there are script files
                        const hasScripts = files.some((file) => file.name.match(/\.(sh|bat|ps1)$/i));

                        let filteredFiles = files;

                        if (hasScripts) {
                          toast.error(
                            <div>
                              <div className="font-bold">Script files not allowed</div>
                              <div className="text-xs text-gray-200">
                                For security reasons, script files (.sh, .bat, .ps1) are not supported.
                              </div>
                            </div>,
                            { autoClose: 5000 },
                          );

                          // Remove script files
                          filteredFiles = filteredFiles.filter(
                            (file) =>
                              !file.name.endsWith('.sh') && !file.name.endsWith('.bat') && !file.name.endsWith('.ps1'),
                          );
                        }

                        if (filteredFiles.length === 0) {
                          return;
                        } // If there were only unsupported files, cancel processing

                        // Process valid files
                        processPastedFiles(filteredFiles);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          if (event.shiftKey) {
                            return;
                          }

                          event.preventDefault();

                          if (isStreaming) {
                            handleStop?.();
                            return;
                          }

                          // ignore if using input method engine
                          if (event.nativeEvent.isComposing) {
                            return;
                          }

                          handleSendMessage?.(event);
                        }
                      }}
                      value={input}
                      onChange={(event) => {
                        handleInputChange?.(event);
                      }}
                      onPaste={handlePaste}
                      style={{
                        minHeight: TEXTAREA_MIN_HEIGHT,
                        maxHeight: TEXTAREA_MAX_HEIGHT,
                      }}
                      placeholder="Comment NeuroCode peut-il vous aider aujourd'hui ?"
                      translate="no"
                    />
                    <ClientOnly>
                      
                      {() => (
                        <SendButton
                          show={input.length > 0 || isStreaming || uploadedFiles.length > 0}
                          isStreaming={isStreaming}
                          disabled={!providerList || providerList.length === 0}
                          onClick={(event) => {
                            if (isStreaming) {
                              handleStop?.();
                              return;
                            }

                            if (input.length > 0 || uploadedFiles.length > 0) {
                              handleSendMessage?.(event);
                            }
                          }}
                        />
                      )}
                    </ClientOnly>
                    
                    <TargetedFilesDisplay textareaRef={textareaRef} className="mt-2" />
                  <div className="flex justify-between items-center text-sm p-4 pt-2">
                      {/* Afficher l'indicateur de statut de tâche s'il est disponible */}
                      {TaskStatusIndicator && taskStatus && taskStatus !== 'idle' && (
                        <div className="mb-2">
                          <TaskStatusIndicator status={taskStatus} />
                        </div>
                      )}
                      <div className="flex gap-1 items-center">
                      <Tooltip.Root>
                          <Tooltip.Trigger asChild>
                            <IconButton
                              title="Importer un fichier"
                              className="transition-all"
                              onClick={() => handleFileUpload()}
                            >
                              <div className="i-ph:paperclip text-xl"></div>
                            </IconButton>
                          </Tooltip.Trigger>
                          
                        </Tooltip.Root>
                        <IconButton
                          title="Améliorer l'invite"
                          disabled={input.length === 0 || enhancingPrompt}
                          className={classNames('transition-all', enhancingPrompt ? 'opacity-100' : '')}
                          onClick={() => {
                            enhancePrompt?.();
                            toast.success('Prompt amélioré !');
                          }}
                        >
                          {enhancingPrompt ? (
                            <div className="i-svg-spinners:90-ring-with-bg text-bolt-elements-loader-progress text-xl animate-spin"></div>
                          ) : (
                            <div className="i-bolt:stars text-xl"></div>
                          )}
                        </IconButton>

                        <SpeechRecognitionButton
                          isListening={isListening}
                          onStart={startListening}
                          onStop={stopListening}
                          disabled={isStreaming}
                        />
                        {!chatStarted && ImportButtons(importChat)}
                        {!chatStarted && <GitCloneButton importChat={importChat} />}
                        {chatStarted && <ClientOnly>{() => <ExportChatButton exportChat={exportChat} />}</ClientOnly>}
                        
                        
                        <IconButton
                          title="Paramètres des modèles"
                          className={classNames('transition-all flex items-center gap-1', {
                            'bg-bolt-elements-item-backgroundAccent text-bolt-elements-item-contentAccent':
                              isModelSettingsCollapsed,
                            'bg-bolt-elements-item-backgroundDefault text-bolt-elements-item-contentDefault':
                              !isModelSettingsCollapsed,
                          })}
                          onClick={() => setIsModelSettingsCollapsed(!isModelSettingsCollapsed)}
                          disabled={!providerList || providerList.length === 0}
                        >
                          <div className={`i-ph:caret-${isModelSettingsCollapsed ? 'right' : 'down'} text-lg`} />
                          {isModelSettingsCollapsed ? <span className="text-xs">Réglages API</span> : <span />}
                          
                        </IconButton>
                      </div>
                      {input.length > 3 ? (
                        <div className="text-xs text-bolt-elements-textTertiary flex items-center">
                          <kbd className="px-2.5 py-1 rounded-lg bg-bolt-elements-background-depth-1 font-medium border border-bolt-elements-borderColor text-bolt-elements-textSecondary transition-colors duration-200">⇧</kbd>
                          <span className="mx-1">+</span>
                          <kbd className="px-2.5 py-1 rounded-lg bg-bolt-elements-background-depth-1 font-medium border border-bolt-elements-borderColor text-bolt-elements-textSecondary transition-colors duration-200">↵</kbd>
                          <span className="ml-1">pour saut de ligne</span>
                        </div>
                      ) : null}
                      <SupabaseConnection />
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex flex-col justify-center gap-5">
              {!chatStarted && (
                <div className="flex justify-center gap-2">
                  {/* <GitCloneButton importChat={importChat} /> */}
                </div>
              )}
              {!chatStarted &&
                ExamplePrompts((event, messageInput) => {
                  if (isStreaming) {
                    handleStop?.();
                    return;
                  }

                  handleSendMessage?.(event, messageInput);
                })}
              {!chatStarted && <StarterTemplates />}
            </div>
          </div>
          <ClientOnly>
            {() => (
              <Workbench
                actionRunner={actionRunner ?? ({} as ActionRunner)}
                chatStarted={chatStarted}
                isStreaming={isStreaming}
              />
            )}
          </ClientOnly>
        </div>
      </div>
    );

    return <Tooltip.Provider delayDuration={200}>{baseChat}</Tooltip.Provider>;
  },
);
