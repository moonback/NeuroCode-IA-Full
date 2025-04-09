import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { FileMap } from '~/lib/stores/files';
import { classNames } from '~/utils/classNames';
import { createScopedLogger, renderLogger } from '~/utils/logger';
import * as ContextMenu from '@radix-ui/react-context-menu';
import type { FileHistory } from '~/types/actions';
import { diffLines, type Change } from 'diff';
import { workbenchStore } from '~/lib/stores/workbench';
import { toast } from 'react-toastify';
import { path } from '~/utils/path';
import { addTargetedFile, removeTargetedFile } from '~/utils/fileUtils';

const logger = createScopedLogger('FileTree');

const NODE_PADDING_LEFT = 8;
const DEFAULT_HIDDEN_FILES = [/\/node_modules\//, /\/\.next/, /\/\.astro/];

interface Props {
  files?: FileMap;
  selectedFile?: string;
  onFileSelect?: (filePath: string) => void;
  rootFolder?: string;
  hideRoot?: boolean;
  collapsed?: boolean;
  allowFolderSelection?: boolean;
  hiddenFiles?: Array<string | RegExp>;
  unsavedFiles?: Set<string>;
  fileHistory?: Record<string, FileHistory>;
  className?: string;
}

interface InlineInputProps {
  depth: number;
  placeholder: string;
  initialValue?: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}

export const FileTree = memo(
  ({
    files = {},
    onFileSelect,
    selectedFile,
    rootFolder,
    hideRoot = false,
    collapsed = false,
    allowFolderSelection = false,
    hiddenFiles,
    className,
    unsavedFiles,
    fileHistory = {},
  }: Props) => {
    renderLogger.trace('FileTree');

    const computedHiddenFiles = useMemo(() => [...DEFAULT_HIDDEN_FILES, ...(hiddenFiles ?? [])], [hiddenFiles]);

    const fileList = useMemo(() => {
      return buildFileList(files, rootFolder, hideRoot, computedHiddenFiles);
    }, [files, rootFolder, hideRoot, computedHiddenFiles]);

    const [collapsedFolders, setCollapsedFolders] = useState(() => {
      return collapsed
        ? new Set(fileList.filter((item) => item.kind === 'folder').map((item) => item.fullPath))
        : new Set<string>();
    });

    useEffect(() => {
      if (collapsed) {
        setCollapsedFolders(new Set(fileList.filter((item) => item.kind === 'folder').map((item) => item.fullPath)));
        return;
      }

      setCollapsedFolders((prevCollapsed) => {
        const newCollapsed = new Set<string>();

        for (const folder of fileList) {
          if (folder.kind === 'folder' && prevCollapsed.has(folder.fullPath)) {
            newCollapsed.add(folder.fullPath);
          }
        }

        return newCollapsed;
      });
    }, [fileList, collapsed]);

    const filteredFileList = useMemo(() => {
      const list = [];

      let lastDepth = Number.MAX_SAFE_INTEGER;

      for (const fileOrFolder of fileList) {
        const depth = fileOrFolder.depth;

        // if the depth is equal we reached the end of the collaped group
        if (lastDepth === depth) {
          lastDepth = Number.MAX_SAFE_INTEGER;
        }

        // ignore collapsed folders
        if (collapsedFolders.has(fileOrFolder.fullPath)) {
          lastDepth = Math.min(lastDepth, depth);
        }

        // ignore files and folders below the last collapsed folder
        if (lastDepth < depth) {
          continue;
        }

        list.push(fileOrFolder);
      }

      return list;
    }, [fileList, collapsedFolders]);

    const toggleCollapseState = (fullPath: string) => {
      setCollapsedFolders((prevSet) => {
        const newSet = new Set(prevSet);

        if (newSet.has(fullPath)) {
          newSet.delete(fullPath);
        } else {
          newSet.add(fullPath);
        }

        return newSet;
      });
    };

    const onCopyPath = (fileOrFolder: FileNode | FolderNode) => {
      try {
        navigator.clipboard.writeText(fileOrFolder.fullPath);
      } catch (error) {
        logger.error(error);
      }
    };

    const onCopyRelativePath = (fileOrFolder: FileNode | FolderNode) => {
      try {
        navigator.clipboard.writeText(fileOrFolder.fullPath.substring((rootFolder || '').length));
      } catch (error) {
        logger.error(error);
      }
    };

    return (
      <div className={classNames('text-sm', className, 'overflow-y-auto')}>
        {filteredFileList.map((fileOrFolder) => {
          switch (fileOrFolder.kind) {
            case 'file': {
              return (
                <File
                  key={fileOrFolder.id}
                  selected={selectedFile === fileOrFolder.fullPath}
                  file={fileOrFolder}
                  unsavedChanges={unsavedFiles?.has(fileOrFolder.fullPath)}
                  fileHistory={fileHistory}
                  onCopyPath={() => {
                    onCopyPath(fileOrFolder);
                  }}
                  onCopyRelativePath={() => {
                    onCopyRelativePath(fileOrFolder);
                  }}
                  onClick={() => {
                    onFileSelect?.(fileOrFolder.fullPath);
                  }}
                />
              );
            }
            case 'folder': {
              return (
                <Folder
                  key={fileOrFolder.id}
                  folder={fileOrFolder}
                  selected={allowFolderSelection && selectedFile === fileOrFolder.fullPath}
                  collapsed={collapsedFolders.has(fileOrFolder.fullPath)}
                  onCopyPath={() => {
                    onCopyPath(fileOrFolder);
                  }}
                  onCopyRelativePath={() => {
                    onCopyRelativePath(fileOrFolder);
                  }}
                  onClick={() => {
                    toggleCollapseState(fileOrFolder.fullPath);
                  }}
                />
              );
            }
            default: {
              return undefined;
            }
          }
        })}
      </div>
    );
  },
);

export default FileTree;

interface FolderProps {
  folder: FolderNode;
  collapsed: boolean;
  selected?: boolean;
  onCopyPath: () => void;
  onCopyRelativePath: () => void;
  onClick: () => void;
}

interface FolderContextMenuProps {
  onCopyPath?: () => void;
  onCopyRelativePath?: () => void;
  children: ReactNode;
}

function ContextMenuItem({ onSelect, children, className }: { 
  onSelect?: () => void; 
  children: ReactNode;
  className?: string;
}) {
  return (
    <ContextMenu.Item
      onSelect={onSelect}
      className={classNames(
        'flex items-center gap-2 px-2 py-1.5 outline-0 text-sm text-bolt-elements-textPrimary cursor-pointer ws-nowrap text-bolt-elements-item-contentDefault hover:text-bolt-elements-item-contentActive hover:bg-bolt-elements-item-backgroundActive rounded-md',
        className
      )}
    >
      <span className="size-4 shrink-0"></span>
      <span>{children}</span>
    </ContextMenu.Item>
  );
}

function InlineInput({ depth, placeholder, initialValue = '', onSubmit, onCancel }: InlineInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();

        if (initialValue) {
          inputRef.current.value = initialValue;
          inputRef.current.select();
        }
      }
    }, 50);

    return () => clearTimeout(timer);
  }, [initialValue]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      const value = inputRef.current?.value.trim();

      if (value) {
        onSubmit(value);
      }
    } else if (e.key === 'Escape') {
      onCancel();
    }
  };

  return (
    <div
      className="flex items-center w-full px-2 bg-bolt-elements-background-depth-4 border border-bolt-elements-item-contentAccent py-0.5 text-bolt-elements-textPrimary"
      style={{ paddingLeft: `${6 + depth * NODE_PADDING_LEFT}px` }}
    >
      <div className="scale-120 shrink-0 i-ph:file-plus text-bolt-elements-textTertiary" />
      <input
        ref={inputRef}
        type="text"
        className="ml-2 flex-1 bg-transparent border-none outline-none py-0.5 text-sm text-bolt-elements-textPrimary placeholder:text-bolt-elements-textTertiary min-w-0"
        placeholder={placeholder}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          setTimeout(() => {
            if (document.activeElement !== inputRef.current) {
              onCancel();
            }
          }, 100);
        }}
      />
    </div>
  );
}

function FileContextMenu({
  onCopyPath,
  onCopyRelativePath,
  fullPath,
  children,
}: FolderContextMenuProps & { fullPath: string }) {
  const [isCreatingFile, setIsCreatingFile] = useState(false);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isTargeted, setIsTargeted] = useState(false);
  const depth = useMemo(() => fullPath.split('/').length, [fullPath]);
  const fileName = useMemo(() => path.basename(fullPath), [fullPath]);

  const isFolder = useMemo(() => {
    const files = workbenchStore.files.get();
    const fileEntry = files[fullPath];

    return !fileEntry || fileEntry.type === 'folder';
  }, [fullPath]);

  const targetPath = useMemo(() => {
    return isFolder ? fullPath : path.dirname(fullPath);
  }, [fullPath, isFolder]);
  
  // Vérifier si le fichier est ciblé
  useEffect(() => {
    if (isFolder) return;
    
    const checkIfTargeted = () => {
      try {
        const textarea = document.querySelector('textarea[data-targeted-files]');
        if (!textarea) return;
        
        const filesAttr = textarea.getAttribute('data-targeted-files');
        if (!filesAttr) return;
        
        const targetedFiles = JSON.parse(filesAttr);
        setIsTargeted(Array.isArray(targetedFiles) && targetedFiles.includes(fullPath));
      } catch (error) {
        console.error('Error checking if file is targeted:', error);
      }
    };
    
    // Vérifier immédiatement
    checkIfTargeted();
    
    // Puis vérifier périodiquement
    const interval = setInterval(checkIfTargeted, 1000);
    return () => clearInterval(interval);
  }, [fullPath, isFolder]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const items = Array.from(e.dataTransfer.items);
      const files = items.filter((item) => item.kind === 'file');

      for (const item of files) {
        const file = item.getAsFile();

        if (file) {
          try {
            const filePath = path.join(fullPath, file.name);

            // Convert file to binary data (Uint8Array)
            const arrayBuffer = await file.arrayBuffer();
            const binaryContent = new Uint8Array(arrayBuffer);

            const success = await workbenchStore.createFile(filePath, binaryContent);

            if (success) {
              toast.success(`File ${file.name} uploaded successfully`);
            } else {
              toast.error(`Failed to upload file ${file.name}`);
            }
          } catch (error) {
            toast.error(`Error uploading ${file.name}`);
            logger.error(error);
          }
        }
      }

      setIsDragging(false);
    },
    [fullPath],
  );

  const handleCreateFile = async (fileName: string) => {
    const newFilePath = path.join(targetPath, fileName);
    const success = await workbenchStore.createFile(newFilePath, '');

    if (success) {
      toast.success('File created successfully');
    } else {
      toast.error('Failed to create file');
    }

    setIsCreatingFile(false);
  };

  const handleCreateFolder = async (folderName: string) => {
    const newFolderPath = path.join(targetPath, folderName);
    const success = await workbenchStore.createFolder(newFolderPath);

    if (success) {
      toast.success('Folder created successfully');
    } else {
      toast.error('Failed to create folder');
    }

    setIsCreatingFolder(false);
  };

const handleDelete = async () => {
  try {
    if (!confirm(`Êtes-vous sûr de vouloir supprimer ${isFolder ? 'le dossier' : 'le fichier'} : ${fileName} ?`)) {
      return;
    }

    let success;

    if (isFolder) {
      success = await workbenchStore.deleteFolder(fullPath);
    } else {
      success = await workbenchStore.deleteFile(fullPath);
    }

    if (success) {
      toast.success(`${isFolder ? 'Dossier' : 'Fichier'} supprimé avec succès`);
    } else {
      toast.error(`Échec de la suppression ${isFolder ? 'du dossier' : 'du fichier'}`);
    }
  } catch (error) {
    toast.error(`Erreur lors de la suppression ${isFolder ? 'du dossier' : 'du fichier'}`);
    logger.error(error);
  }
};

function handleFileUpload(): void {
  // Create a hidden file input element
  const input = document.createElement('input');
  input.type = 'file';
  input.multiple = true;
  
  // Handle file selection
  input.onchange = async (e) => {
    const files = (e.target as HTMLInputElement).files;
    if (!files) return;

    for (const file of Array.from(files)) {
      try {
        const filePath = path.join(targetPath, file.name);

        // Convert file to binary data
        const arrayBuffer = await file.arrayBuffer();
        const binaryContent = new Uint8Array(arrayBuffer);

        const success = await workbenchStore.createFile(filePath, binaryContent);

        if (success) {
          toast.success(`File ${file.name} uploaded successfully`);
        } else {
          toast.error(`Failed to upload file ${file.name}`);
        }
      } catch (error) {
        toast.error(`Error uploading ${file.name}`);
        logger.error(error);
      }
    }
  };

  // Trigger file selection dialog
  input.click();
}

  return (
    <>
      <ContextMenu.Root>
        <ContextMenu.Trigger asChild>
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={classNames('relative transition-all duration-200', {
              'bg-bolt-elements-background-depth-2 border-2 border-dashed border-bolt-elements-item-contentAccent rounded-md scale-[0.98]':
                isDragging,
              'hover:bg-bolt-elements-background-depth-1': !isDragging,
            })}
          >
            {children}
            {isDragging && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/20 backdrop-blur-sm rounded-md">
                <div className="flex flex-col items-center gap-2 text-bolt-elements-textPrimary">
                  <div className="i-ph:upload-simple text-2xl" />
                  <span className="text-sm">Déposer ici</span>
                </div>
              </div>
            )}
          </div>
        </ContextMenu.Trigger>
        <ContextMenu.Portal>
          <ContextMenu.Content
            style={{ zIndex: 998 }}
            className="border border-bolt-elements-borderColor rounded-md z-context-menu bg-bolt-elements-background-depth-1 dark:bg-bolt-elements-background-depth-2 data-[state=open]:animate-in animate-duration-100 data-[state=open]:fade-in-0 data-[state=open]:zoom-in-98 w-56 shadow-lg"
          >
            <ContextMenu.Group className="p-1 border-b-px border-solid border-bolt-elements-borderColor">
              {/* Add the new upload button before other items */}
              <ContextMenuItem 
                onSelect={handleFileUpload}
                className="hover:bg-orange-500/10"
              >
                <div className="flex items-center gap-2">
                  <div className="i-ph:upload-simple text-orange-500" />
                  <span className="text-orange-500">Importer un fichier</span>
                </div>
              </ContextMenuItem>
              
              {!isFolder && (
                <>
                  {!isTargeted ? (
                    <ContextMenuItem 
                      onSelect={() => {
                        const textarea = document.querySelector('textarea[data-targeted-files]');
                        if (textarea) {
                          const success = addTargetedFile(fullPath, textarea as HTMLTextAreaElement);
                          if (success) {
                            toast.success(`Fichier ciblé : ${fileName}`);
                            (textarea as HTMLTextAreaElement).focus();
                          } else {
                            toast.info(`Le fichier ${fileName} est déjà ciblé`);
                          }
                        } else {
                          toast.error('Impossible de trouver la zone de texte du chat');
                        }
                      }}
                      className="hover:bg-green-500/10"
                    >
                      <div className="flex items-center gap-2">
                        <div className="i-ph:target text-green-500" />
                        <span className="text-green-500">Cibler le fichier</span>
                      </div>
                    </ContextMenuItem>
                  ) : (
                    <ContextMenuItem 
                      onSelect={() => {
                        const textarea = document.querySelector('textarea[data-targeted-files]');
                        if (textarea) {
                          const success = removeTargetedFile(fullPath, textarea as HTMLTextAreaElement);
                          if (success) {
                            toast.success(`Ciblage retiré : ${fileName}`);
                            (textarea as HTMLTextAreaElement).focus();
                          } else {
                            toast.info(`Le fichier ${fileName} n'est pas ciblé`);
                          }
                        } else {
                          toast.error('Impossible de trouver la zone de texte du chat');
                        }
                      }}
                      className="hover:bg-yellow-500/10"
                    >
                      <div className="flex items-center gap-2">
                        <div className="i-ph:target-slash text-yellow-500" />
                        <span className="text-yellow-500">Retirer le ciblage</span>
                      </div>
                    </ContextMenuItem>
                  )}
                </>
              )}
              <ContextMenuItem 
                onSelect={() => setIsCreatingFile(true)}
                className="hover:bg-blue-500/10"
              >
                <div className="flex items-center gap-2">
                  <div className="i-ph:file-plus text-blue-500" />
                  <span className="text-blue-500">Nouveau fichier</span>
                </div>
              </ContextMenuItem>
              <ContextMenuItem 
                onSelect={() => setIsCreatingFolder(true)}
                className="hover:bg-purple-500/10"
              >
                <div className="flex items-center gap-2">
                  <div className="i-ph:folder-plus text-purple-500" />
                  <span className="text-purple-500">Nouveau dossier</span>
                </div>
              </ContextMenuItem>
            </ContextMenu.Group>
            <ContextMenu.Group className="p-1">
              <ContextMenuItem 
                onSelect={onCopyPath}
                className="hover:bg-gray-500/10"
              >
                <div className="flex items-center gap-2">
                  <div className="i-ph:copy text-gray-500" />
                  <span className="text-gray-500">Copier le chemin</span>
                </div>
              </ContextMenuItem>
              <ContextMenuItem 
                onSelect={onCopyRelativePath}
                className="hover:bg-gray-500/10"
              >
                <div className="flex items-center gap-2">
                  <div className="i-ph:copy-simple text-gray-500" />
                  <span className="text-gray-500">Copier le chemin relatif</span>
                </div>
              </ContextMenuItem>
            </ContextMenu.Group>
            <ContextMenu.Group className="p-1 border-t-px border-solid border-bolt-elements-borderColor">
              <ContextMenuItem 
                onSelect={handleDelete}
                className="hover:bg-red-500/10"
              >
                <div className="flex items-center gap-2">
                  <div className="i-ph:trash text-red-500" />
                  <span className="text-red-500">Supprimer {isFolder ? 'Dossier' : 'Fichier'}</span>
                </div>
              </ContextMenuItem>
            </ContextMenu.Group>
          </ContextMenu.Content>
        </ContextMenu.Portal>
      </ContextMenu.Root>
      {isCreatingFile && (
        <InlineInput
          depth={depth}
          placeholder="Entrez le nom du fichier..."
          onSubmit={handleCreateFile}
          onCancel={() => setIsCreatingFile(false)}
        />
      )}
      {isCreatingFolder && (
        <InlineInput
          depth={depth}
          placeholder="Entrez le nom du dossier..."
          onSubmit={handleCreateFolder}
          onCancel={() => setIsCreatingFolder(false)}
        />
      )}
    </>
  );
}

function Folder({ folder, collapsed, selected = false, onCopyPath, onCopyRelativePath, onClick }: FolderProps) {
  return (
    <FileContextMenu onCopyPath={onCopyPath} onCopyRelativePath={onCopyRelativePath} fullPath={folder.fullPath}>
      <NodeButton
        className={classNames('group', {
          'bg-transparent text-bolt-elements-item-contentDefault hover:text-bolt-elements-item-contentActive hover:bg-bolt-elements-item-backgroundActive':
            !selected,
          'bg-bolt-elements-item-backgroundAccent text-bolt-elements-item-contentAccent': selected,
        })}
        depth={folder.depth}
        iconClasses={classNames({
          'i-ph:folder-simple': !collapsed,
          'i-ph:folder-simple-dashed': collapsed,
        })}
        onClick={onClick}
      >
        {folder.name}
      </NodeButton>
    </FileContextMenu>
  );
}

interface FileProps {
  file: FileNode;
  selected: boolean;
  unsavedChanges?: boolean;
  fileHistory?: Record<string, FileHistory>;
  onCopyPath: () => void;
  onCopyRelativePath: () => void;
  onClick: () => void;
}

function getFileIcon(fileName: string) {
  const extension = path.extname(fileName).toLowerCase();
  
  switch (extension) {
    case '.ts':
    case '.tsx':
      return 'i-ph:file-ts';
    case '.js':
    case '.jsx':
      return 'i-ph:file-js';
    case '.json':
      return 'i-ph:file';
    case '.html':
      return 'i-ph:file-html';
    case '.css':
    case '.scss':
      return 'i-ph:file-css';
    case '.md':
      return 'i-ph:file-md';
    case '.py':
      return 'i-ph:file-py';
    case '.java':
      return 'i-ph:file-java';
    case '.php':
      return 'i-ph:file-php';
    case '.txt':
      return 'i-ph:file-text';
    case '.csv':
      return 'i-ph:file-csv';
    case '.xml':
      return 'i-ph:file-xml';
    case '.yaml':
    case '.yml':
      return 'i-ph:file-yaml';
    case '.svg':
      return 'i-ph:file-svg';
    case '.png':
    case '.jpg':
    case '.jpeg':
    case '.gif':
      return 'i-ph:file-image';
    case '.mp3':
    case '.wav':
      return 'i-ph:file-audio';
    case '.mp4':
    case '.mov':
      return 'i-ph:file-video';
    
    default:
      return 'i-ph:file';
  }
}

function File({
  file,
  onClick,
  onCopyPath,
  onCopyRelativePath,
  selected,
  unsavedChanges = false,
  fileHistory = {},
}: FileProps) {
  const { depth, name, fullPath } = file;

  const fileModifications = fileHistory[fullPath];
  
  // Vérifier si le fichier est ciblé
  const [isTargeted, setIsTargeted] = useState(false);
  
  // Vérifier périodiquement si le fichier est ciblé
  useEffect(() => {
    const checkIfTargeted = () => {
      try {
        const textarea = document.querySelector('textarea[data-targeted-files]');
        if (!textarea) return;
        
        const filesAttr = textarea.getAttribute('data-targeted-files');
        if (!filesAttr) return;
        
        const targetedFiles = JSON.parse(filesAttr);
        setIsTargeted(Array.isArray(targetedFiles) && targetedFiles.includes(fullPath));
      } catch (error) {
        console.error('Error checking if file is targeted:', error);
      }
    };
    
    // Vérifier immédiatement
    checkIfTargeted();
    
    // Puis vérifier périodiquement
    const interval = setInterval(checkIfTargeted, 1000);
    return () => clearInterval(interval);
  }, [fullPath]);

  const { additions, deletions } = useMemo(() => {
    if (!fileModifications?.originalContent) {
      return { additions: 0, deletions: 0 };
    }

    const normalizedOriginal = fileModifications.originalContent.replace(/\r\n/g, '\n');
    const normalizedCurrent =
      fileModifications.versions[fileModifications.versions.length - 1]?.content.replace(/\r\n/g, '\n') || '';

    if (normalizedOriginal === normalizedCurrent) {
      return { additions: 0, deletions: 0 };
    }

    const changes = diffLines(normalizedOriginal, normalizedCurrent, {
      newlineIsToken: false,
      ignoreWhitespace: true,
      ignoreCase: false,
    });

    return changes.reduce(
      (acc: { additions: number; deletions: number }, change: Change) => {
        if (change.added) {
          acc.additions += change.value.split('\n').length;
        }

        if (change.removed) {
          acc.deletions += change.value.split('\n').length;
        }

        return acc;
      },
      { additions: 0, deletions: 0 },
    );
  }, [fileModifications]);

  const showStats = additions > 0 || deletions > 0;

  return (
    <FileContextMenu onCopyPath={onCopyPath} onCopyRelativePath={onCopyRelativePath} fullPath={fullPath}>
      <NodeButton
        className={classNames('group', {
          'bg-transparent hover:bg-bolt-elements-item-backgroundActive text-bolt-elements-item-contentDefault':
            !selected,
          'bg-bolt-elements-item-backgroundAccent text-bolt-elements-item-contentAccent': selected,
        })}
        depth={depth}
        iconClasses={classNames(getFileIcon(name), {
          'group-hover:text-bolt-elements-item-contentActive': !selected,
          'text-yellow-400': isTargeted, // Icône jaune pour les fichiers ciblés
        })}
        onClick={onClick}
      >
        <div
          className={classNames('flex items-center', {
            'group-hover:text-bolt-elements-item-contentActive': !selected,
          })}
        >
          <div className="flex-1 truncate pr-2">
            {isTargeted && (
              <span className="inline-block mr-1 text-yellow-400 i-ph:target" />
            )}
            {name}
          </div>
          <div className="flex items-center gap-1">
            {showStats && (
              <div className="flex items-center gap-1 text-xs">
                {additions > 0 && <span className="text-green-500">+{additions}</span>}
                {deletions > 0 && <span className="text-red-500">-{deletions}</span>}
              </div>
            )}
            {unsavedChanges && <span className="i-ph:circle-fill scale-68 shrink-0 text-orange-500" />}
          </div>
        </div>
      </NodeButton>
    </FileContextMenu>
  );
}

interface ButtonProps {
  depth: number;
  iconClasses: string;
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}

function NodeButton({ depth, iconClasses, onClick, className, children }: ButtonProps) {
  return (
    <button
      className={classNames(
        'flex items-center gap-1.5 w-full pr-2 border-2 border-transparent text-faded py-0.5',
        className,
      )}
      style={{ paddingLeft: `${6 + depth * NODE_PADDING_LEFT}px` }}
      onClick={() => onClick?.()}
    >
      <div className={classNames('scale-120 shrink-0', iconClasses)}></div>
      <div className="truncate w-full text-left">{children}</div>
    </button>
  );
}

type Node = FileNode | FolderNode;

interface BaseNode {
  id: number;
  depth: number;
  name: string;
  fullPath: string;
}

interface FileNode extends BaseNode {
  kind: 'file';
}

interface FolderNode extends BaseNode {
  kind: 'folder';
}

function buildFileList(
  files: FileMap,
  rootFolder = '/',
  hideRoot: boolean,
  hiddenFiles: Array<string | RegExp>,
): Node[] {
  const folderPaths = new Set<string>();
  const fileList: Node[] = [];

  let defaultDepth = 0;

  if (rootFolder === '/' && !hideRoot) {
    defaultDepth = 1;
    fileList.push({ kind: 'folder', name: '/', depth: 0, id: 0, fullPath: '/' });
  }

  for (const [filePath, dirent] of Object.entries(files)) {
    const segments = filePath.split('/').filter((segment) => segment);
    const fileName = segments.at(-1);

    if (!fileName || isHiddenFile(filePath, fileName, hiddenFiles)) {
      continue;
    }

    let currentPath = '';

    let i = 0;
    let depth = 0;

    while (i < segments.length) {
      const name = segments[i];
      const fullPath = (currentPath += `/${name}`);

      if (!fullPath.startsWith(rootFolder) || (hideRoot && fullPath === rootFolder)) {
        i++;
        continue;
      }

      if (i === segments.length - 1 && dirent?.type === 'file') {
        fileList.push({
          kind: 'file',
          id: fileList.length,
          name,
          fullPath,
          depth: depth + defaultDepth,
        });
      } else if (!folderPaths.has(fullPath)) {
        folderPaths.add(fullPath);

        fileList.push({
          kind: 'folder',
          id: fileList.length,
          name,
          fullPath,
          depth: depth + defaultDepth,
        });
      }

      i++;
      depth++;
    }
  }

  return sortFileList(rootFolder, fileList, hideRoot);
}

function isHiddenFile(filePath: string, fileName: string, hiddenFiles: Array<string | RegExp>) {
  return hiddenFiles.some((pathOrRegex) => {
    if (typeof pathOrRegex === 'string') {
      return fileName === pathOrRegex;
    }

    return pathOrRegex.test(filePath);
  });
}

/**
 * Sorts the given list of nodes into a tree structure (still a flat list).
 *
 * This function organizes the nodes into a hierarchical structure based on their paths,
 * with folders appearing before files and all items sorted alphabetically within their level.
 *
 * @note This function mutates the given `nodeList` array for performance reasons.
 *
 * @param rootFolder - The path of the root folder to start the sorting from.
 * @param nodeList - The list of nodes to be sorted.
 *
 * @returns A new array of nodes sorted in depth-first order.
 */
function sortFileList(rootFolder: string, nodeList: Node[], hideRoot: boolean): Node[] {
  logger.trace('sortFileList');

  const nodeMap = new Map<string, Node>();
  const childrenMap = new Map<string, Node[]>();

  // pre-sort nodes by name and type
  nodeList.sort((a, b) => compareNodes(a, b));

  for (const node of nodeList) {
    nodeMap.set(node.fullPath, node);

    const parentPath = node.fullPath.slice(0, node.fullPath.lastIndexOf('/'));

    if (parentPath !== rootFolder.slice(0, rootFolder.lastIndexOf('/'))) {
      if (!childrenMap.has(parentPath)) {
        childrenMap.set(parentPath, []);
      }

      childrenMap.get(parentPath)?.push(node);
    }
  }

  const sortedList: Node[] = [];

  const depthFirstTraversal = (path: string): void => {
    const node = nodeMap.get(path);

    if (node) {
      sortedList.push(node);
    }

    const children = childrenMap.get(path);

    if (children) {
      for (const child of children) {
        if (child.kind === 'folder') {
          depthFirstTraversal(child.fullPath);
        } else {
          sortedList.push(child);
        }
      }
    }
  };

  if (hideRoot) {
    // if root is hidden, start traversal from its immediate children
    const rootChildren = childrenMap.get(rootFolder) || [];

    for (const child of rootChildren) {
      depthFirstTraversal(child.fullPath);
    }
  } else {
    depthFirstTraversal(rootFolder);
  }

  return sortedList;
}

function compareNodes(a: Node, b: Node): number {
  if (a.kind !== b.kind) {
    return a.kind === 'folder' ? -1 : 1;
  }

  return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
}
