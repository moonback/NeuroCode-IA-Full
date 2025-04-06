import React, { useEffect, useState } from 'react';
import { getDocument } from 'pdfjs-dist';
import { GlobalWorkerOptions } from 'pdfjs-dist';
import UIAnalysisButton from './UIAnalysisButton';
import type { ProviderInfo } from '~/types/model';
import * as Dialog from '@radix-ui/react-dialog';

// Import the worker as a virtual URL from Vite (if not configured elsewhere)
const pdfjsWorkerUrl = new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url).href;

// Configure the worker if not already configured
if (typeof window !== 'undefined' && !GlobalWorkerOptions.workerSrc) {
  GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;
}
interface FilePreviewProps {
  files: File[];
  imageDataList: string[];
  onRemove: (index: number) => void; // -1 means remove all
  model?: string;
  provider?: ProviderInfo;
  onUiAnalysisComplete?: (prompt: string) => void;
}

interface FileWithKey extends File {
  previewKey?: string;
}

interface PDFThumbnailData {
  dataUrl: string;
  pageCount: number;
}

const FilePreview: React.FC<FilePreviewProps> = ({
  files,
  imageDataList,
  onRemove,
  model = '',
  provider,
  onUiAnalysisComplete,
}) => {
  const [pdfThumbnails, setPdfThumbnails] = useState<Record<string, PDFThumbnailData>>({});
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [processedFiles, setProcessedFiles] = useState<Set<string>>(new Set());
  const [localImageDataList, setLocalImageDataList] = useState<string[]>([]);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  useEffect(() => {
    // Initialiser la liste avec des états de chargement pour les images
    const newImageDataList = files.map(file => {
      if (file.type.startsWith('image/')) {
        return 'loading-image';
      }
      return 'non-image';
    });
    setLocalImageDataList(newImageDataList);

    // Charger les aperçus d'images
    files.forEach((file, index) => {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => {
          setLocalImageDataList(prev => {
            const newList = [...prev];
            newList[index] = e.target?.result as string;
            return newList;
          });
        };
        reader.readAsDataURL(file);
      }
    });
  }, [files]);

  // Generate a unique key for each file
  const getFileKey = (file: File): string => {
    return `${file.name}-${file.size}-${file.lastModified}`;
  };

  // Check if a file has already been processed
  const isFileProcessed = (file: File): boolean => {
    return processedFiles.has(getFileKey(file));
  };

  // Mark a file as processed
  const markFileAsProcessed = (file: File): void => {
    setProcessedFiles(prev => new Set([...prev, getFileKey(file)]));
  };

  useEffect(() => {
    // Process PDF thumbnails
    const processPdfThumbnails = async () => {
      for (const file of files) {
        const fileKey = getFileKey(file);
        // Check if it's a PDF and hasn't been processed yet
        if (
          (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) &&
          !isFileProcessed(file) &&
          !pdfThumbnails[fileKey]
        ) {
          try {
            // Load the PDF and generate thumbnail of the first page
            const arrayBuffer = await file.arrayBuffer();
            const loadingTask = getDocument({ data: arrayBuffer });
            const pdf = await loadingTask.promise;
            const pageCount = pdf.numPages;

            // Render the first page as thumbnail
            const page = await pdf.getPage(1);
            // Reduced scale for smaller thumbnail
            const viewport = page.getViewport({ scale: 0.3 });

            // Create canvas for the thumbnail
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;

            if (context) {
              // Render page on canvas
              await page.render({
                canvasContext: context,
                viewport,
              }).promise;

              // Convert to dataURL
              const dataUrl = canvas.toDataURL('image/jpeg', 0.8);

              // Save thumbnail with the new file key
              const fileKey = getFileKey(file);
              setPdfThumbnails((prev) => ({
                ...prev,
                [fileKey]: {
                  dataUrl,
                  pageCount,
                },
              }));
              markFileAsProcessed(file);
            }
          } catch (error) {
            console.error('Error generating PDF thumbnail:', error);
          }
        }
      }
    };

    processPdfThumbnails();
  }, [files, pdfThumbnails]);
  if (!files || files.length === 0) {
    return null;
  }
// Function to get the icon based on file type
const getFileIcon = (fileType: string) => {
  if (fileType.startsWith('image/')) {
    return 'i-ph:image';
  }

  const fileName = fileType.toLowerCase();

  if (fileName.includes('pdf') || fileName.endsWith('.pdf')) {
    return 'i-ph:file-pdf';
  }

  if (fileName.includes('docx') || fileName.endsWith('.docx')) {
    return 'i-ph:file-doc';
  }

  if (fileName.includes('text') || fileName.includes('txt') || fileName.endsWith('.txt')) {
    return 'i-ph:file-text';
  }

  if (fileName.endsWith('.md')) {
    return 'i-ph:file-text';
  }

  return 'i-ph:file-text';
};

// Function to check if a file is a PDF
const isPdf = (file: File) => {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
};

// Function to get a PDF thumbnail using the file key system
const getPdfThumbnail = (file: File) => {
  const fileKey = getFileKey(file);
  return pdfThumbnails[fileKey];
};

// Function to format file size
const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) {
    return bytes + ' B';
  }

  if (bytes < 1024 * 1024) {
    return (bytes / 1024).toFixed(1) + ' KB';
  }

  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
};

  const visibleFiles = showAll ? files : files.slice(0, 3);
  const hasMoreFiles = files.length > 3;

  // Removing the standalone DeleteConfirmationModal component since we're using Radix UI Dialog

  return (
    <div className="relative bg-gray-900/40 rounded-lg p-3 mb-3 border border-gray-800/50 shadow-lg backdrop-blur-sm">
      {/* Header with collapse/expand control */}
      <div className="flex items-center justify-between mb-2 px-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="flex items-center justify-center w-6 h-6 bg-gray-800/50 rounded-md hover:bg-gray-700/50 text-gray-400 hover:text-gray-300 transition-all duration-200 focus:outline-none focus:ring-1 focus:ring-gray-500/30"
            aria-label={isCollapsed ? 'Déplier les fichiers' : 'Replier les fichiers'}
            title={isCollapsed ? 'Afficher les fichiers joints' : 'Masquer les fichiers joints'}
          >
            <div 
              className={`i-ph:caret-${isCollapsed ? 'right' : 'down'} w-3.5 h-3.5 transition-transform duration-200`}
              style={{ transform: isCollapsed ? 'rotate(0deg)' : 'rotate(-90deg)' }}
              aria-hidden="true"
            />
          </button>
          <span className="text-sm text-gray-200 font-medium flex items-center gap-1.5">
            <span className="i-ph:paperclip w-4 h-4 text-violet-400"></span>
            Fichiers joints ({files.length})
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Clear all files button - only show when there are files */}
          {files.length > 0 && (
            <Dialog.Root open={showDeleteModal} onOpenChange={setShowDeleteModal}>
              <Dialog.Trigger asChild>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                  }}
                  className="text-xs bg-red-500/20 text-red-400 hover:bg-red-500/30 hover:text-red-300 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500/50 px-2 py-1 rounded-full flex items-center gap-1"
                  aria-label="Supprimer tous les fichiers"
                  title="Supprimer tous les fichiers"
                >
                  <span className="i-ph:trash w-3 h-3"></span>
                  Tout supprimer
                </button>
              </Dialog.Trigger>
              
              <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 data-[state=open]:animate-fade-in" />
                <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-gray-900/90 border border-violet-500/20 rounded-xl shadow-xl p-6 max-w-md w-full mx-4 z-50 data-[state=open]:animate-scale-in backdrop-blur-sm">
                  <div className="flex items-center justify-center mb-4">
                    <div className="bg-violet-500/15 rounded-full p-3">
                      <div className="i-ph:warning-circle-fill w-8 h-8 text-violet-400"></div>
                    </div>
                  </div>
                  
                  <Dialog.Title className="text-xl font-semibold text-white text-center mb-3">
                    Confirmation de suppression
                  </Dialog.Title>
                  
                  <Dialog.Description className="text-gray-300 mb-6 text-center">
                    Êtes-vous sûr de vouloir supprimer tous les fichiers joints ? 
                    <span className="block mt-2 text-red-500 text-sm font-medium">Cette action ne peut pas être annulée.</span>
                  </Dialog.Description>
                  
                  <div className="flex justify-center gap-4">
                    <Dialog.Close asChild>
                      <button
                        className="px-5 py-2.5 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition-colors border border-gray-700/50 focus:outline-none focus:ring-2 focus:ring-violet-500/50 min-w-[120px]"
                      >
                        Annuler
                      </button>
                    </Dialog.Close>
                    <button
                      onClick={() => {
                        onRemove(-1);
                        setShowDeleteModal(false);
                      }}
                      className="px-5 py-2.5 bg-red-500/20 hover:bg-red-500/50 text-red-300 hover:text-red-200 rounded-lg transition-colors flex items-center justify-center gap-2 shadow-md focus:outline-none focus:ring-2 focus:ring-red-500/50 min-w-[120px] border border-red-500/30"
                    >
                      <span className="i-ph:trash w-4 h-4"></span>
                      Supprimer tout
                    </button>
                  </div>
                  
                  <Dialog.Close asChild>
                    <button
                      className="absolute top-3 right-3 text-gray-400 hover:text-white rounded-full p-1 hover:bg-violet-500/10 transition-colors"
                      aria-label="Fermer"
                    >
                      <span className="i-ph:x-bold w-4 h-4" />
                    </button>
                  </Dialog.Close>
                </Dialog.Content>
              </Dialog.Portal>
            </Dialog.Root>
          )}
          
          {hasMoreFiles && !isCollapsed && (
            <button
              onClick={() => setShowAll(!showAll)}
              className="text-xs bg-transparent text-violet-400 hover:text-violet-300 transition-colors focus:outline-none focus:underline px-2 py-1 rounded-full hover:bg-violet-500/10"
              aria-label={showAll ? 'Afficher moins de fichiers' : `Afficher tous les fichiers ${files.length}`}
            >
              {showAll ? 'Afficher moins' : `Voir tout (${files.length})`}
            </button>
          )}
        </div>
      </div>

      {/* Files container with collapse/expand animation */}
      <div 
        className={`transition-all duration-300 ease-in-out overflow-hidden ${
          isCollapsed ? 'max-h-0 opacity-0' : 'max-h-[1000px] opacity-100'
        }`}
      >
        <div className="flex flex-wrap gap-3 p-2">
          {visibleFiles.map((file, index) => (
            <div 
              key={file.name + file.size + index} 
              className="relative group transition-all duration-200 hover:scale-[1.02]"
            >
              <div className="relative p-1.5 bg-white/5 rounded-xl border border-gray-700/50 shadow-md hover:border-violet-500/30 hover:shadow-violet-500/10 transition-all">
                {localImageDataList[index] === 'loading-image' ? (
                  <div className="flex flex-col items-center justify-center p-3 w-[100px] h-[100px] rounded-lg bg-gradient-to-br from-gray-800/50 to-gray-900/70">
                    <div className="i-svg-spinners:90-ring-with-bg text-blue-400 text-xl animate-spin"></div>
                    <div className="text-xs text-gray-400 mt-2">Chargement...</div>
                  </div>
                ) : localImageDataList[index] && localImageDataList[index] !== 'non-image' ? (
                  <div className="flex flex-col items-center">
                    <div className="relative overflow-hidden rounded-lg shadow-inner" style={{ width: '100px', height: '80px' }}>
                      <img
                        src={localImageDataList[index]}
                        alt={file.name}
                        className="object-cover w-full h-full"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-1.5">
                        <div className="text-[9px] text-white/90 truncate w-full">
                          {file.name}
                        </div>
                      </div>
                    </div>
                    <div className="text-xs text-gray-400 mt-1.5">{formatFileSize(file.size)}</div>
                    {file.type.startsWith('image/') && provider && onUiAnalysisComplete && (
                      <UIAnalysisButton
                        imageData={imageDataList[index]}
                        model={model}
                        provider={provider}
                        onAnalysisComplete={onUiAnalysisComplete}
                      />
                    )}
                  </div>
                ) : isPdf(file) && getPdfThumbnail(file) ? (
                  <div className="flex flex-col items-center">
                    <div className="relative w-[100px] h-[80px] rounded-lg overflow-hidden">
                      <img
                        src={getPdfThumbnail(file)?.dataUrl}
                        alt={`${file.name} (page 1)`}
                        className="object-contain w-full h-full bg-white/5"
                      />
                      <div className="absolute bottom-1 right-1 bg-black/80 text-white text-[8px] px-1.5 py-0.5 rounded">
                        {getPdfThumbnail(file)?.pageCount || '?'} pages
                      </div>
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-1.5">
                        <div className="text-[9px] text-white/90 truncate w-full">
                          {file.name}
                        </div>
                      </div>
                    </div>
                    <div className="text-xs text-gray-400 mt-1.5">{formatFileSize(file.size)}</div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center p-3 w-[100px] h-[100px] rounded-lg bg-gradient-to-br from-gray-800/50 to-gray-900/70">
                    <div className={`${getFileIcon(file.type)} w-8 h-8 text-blue-400`} />
                    <div className="text-xs text-gray-300 mt-2 text-center truncate w-full px-1">
                      {file.name}
                    </div>
                    <div className="text-[10px] text-gray-500 mt-0.5">
                      {formatFileSize(file.size)}
                    </div>
                  </div>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(index);
                  }}
                  className="absolute -top-2 -right-2 z-10 bg-red-500 rounded-full w-5 h-5 shadow-lg hover:bg-red-600 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100"
                  aria-label={`Supprimer ${file.name}`}
                >
                  <div className="i-ph:x-bold w-2.5 h-2.5 text-white" />
                </button>
              </div>
            </div>
          ))}
          
          {/* Preview counter for collapsed state */}
          {!showAll && hasMoreFiles && !isCollapsed && (
            <div className="flex items-center justify-center w-[100px] h-[100px] rounded-lg border border-gray-700/50 bg-gray-800/30">
              <div className="text-gray-400 text-sm">+{files.length - 3} fichiers</div>
            </div>
          )}
        </div>
      </div>
      
      {/* Remove the DeleteConfirmationModal call here */}
    </div>
  );
};

export default FilePreview;
