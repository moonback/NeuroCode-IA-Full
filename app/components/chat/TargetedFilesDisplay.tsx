import { useState, useEffect } from 'react';
import { classNames } from '~/utils/classNames';
import { toast } from 'react-toastify';

interface TargetedFilesDisplayProps {
  textareaRef?: React.RefObject<HTMLTextAreaElement>;
  className?: string;
}

/**
 * Component that displays files targeted in the chat input
 * and allows managing them (removing, etc.)
 */
export function TargetedFilesDisplay({ textareaRef, className }: TargetedFilesDisplayProps) {
  const [targetedFiles, setTargetedFiles] = useState<string[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);

  // Get targeted files from the textarea's custom attribute
  const getTargetedFiles = (): string[] => {
    if (!textareaRef?.current) return [];
    
    const filesAttr = textareaRef.current.getAttribute('data-targeted-files');
    if (!filesAttr) return [];
    
    try {
      return JSON.parse(filesAttr);
    } catch (e) {
      console.error('Error parsing targeted files:', e);
      return [];
    }
  };

  // Update targeted files in the textarea's custom attribute
  const updateTargetedFiles = (files: string[]) => {
    if (!textareaRef?.current) return;
    
    textareaRef.current.setAttribute('data-targeted-files', JSON.stringify(files));
    setTargetedFiles(files);
  };

  // Initialize textarea data attribute
  useEffect(() => {
    const textarea = textareaRef?.current;
    if (textarea && !textarea.hasAttribute('data-targeted-files')) {
      textarea.setAttribute('data-targeted-files', JSON.stringify([]));
    }
  }, [textareaRef]);

  // Initialize targeted files from existing comments in textarea (for backward compatibility)
  useEffect(() => {
      if (!textareaRef?.current) return;
      
      const content = textareaRef.current.value;
      const fileCommentRegex = /\/\/\s*([^\n]+)/g;
      const matches = [...content.matchAll(fileCommentRegex)];
      const existingFiles = matches.map(match => match[1].trim()).filter(Boolean);
      
    if (existingFiles.length === 0) return;
    
        // Remove existing file comments from textarea
        let newContent = content;
        existingFiles.forEach(file => {
          const fileComment = `// ${file}`;
          newContent = newContent
            .replace(`${fileComment}\n\n`, '\n')
            .replace(`${fileComment}\n`, '')
            .replace(`\n${fileComment}`, '')
            .replace(fileComment, '');
        });
        
        textareaRef.current.value = newContent;
        
        // Store files in the custom attribute
        updateTargetedFiles(existingFiles);
        
        // Trigger input event to update state
        textareaRef.current.dispatchEvent(new Event('input', { bubbles: true }));
        textareaRef.current.dispatchEvent(new Event('autoresize', { bubbles: true }));
  }, [textareaRef]);

  // Update UI when targeted files change
  useEffect(() => {
    const checkForChanges = () => {
      const currentFiles = getTargetedFiles();
      if (JSON.stringify(currentFiles) !== JSON.stringify(targetedFiles)) {
        setTargetedFiles(currentFiles);
      }
    };
    
    const interval = setInterval(checkForChanges, 500);
    return () => clearInterval(interval);
  }, [targetedFiles]);

  // Add error handling for file operations
  const handleFileOperation = (operation: () => void) => {
    try {
      operation();
    } catch (error) {
      console.error('File operation failed:', error);
      toast.error('Une erreur est survenue lors de la gestion des fichiers');
    }
  };

  // Improved remove file with confirmation
  const removeTargetedFile = (filePath: string) => {
    handleFileOperation(() => {
      const currentFiles = getTargetedFiles();
      const newFiles = currentFiles.filter(file => file !== filePath);
      updateTargetedFiles(newFiles);
      // toast.success(`Fichier retiré: ${filePath.split('/').pop()}`);
    });
  };

  // Add file validation
  const isValidFile = (filePath: string) => {
    return filePath.trim().length > 0 && 
           !filePath.includes('..') && // Prevent directory traversal
           filePath.split('/').pop()?.includes('.'); // Ensure it has an extension
  };

  // Ne rien afficher s'il n'y a pas de fichiers ciblés
  if (targetedFiles.length === 0) {
    return null;
  }

  return (
    <div className={classNames(
      'mt-1.5 mx-2 mb-2 rounded-md bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor/30 shadow-lg hover:shadow-xl backdrop-blur-sm transition-all duration-300',
      className
    )}>
      <div className="absolute inset-0 bg-gradient-to-br from-bolt-elements-accent/5 to-transparent rounded-md opacity-50" />
      <FileListHeader 
        isExpanded={isExpanded} 
        setIsExpanded={setIsExpanded} 
        targetedFiles={targetedFiles} 
      />
      
      {isExpanded && (
        <div className="relative">
          <FileList 
            targetedFiles={targetedFiles} 
            removeTargetedFile={removeTargetedFile} 
          />
          {targetedFiles.length > 3 && (
            <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-bolt-elements-background-depth-2 to-transparent pointer-events-none" />
          )}
        </div>
      )}
    </div>
  );
}

// File list header component
function FileListHeader({ 
  isExpanded, 
  setIsExpanded, 
  targetedFiles 
}: { 
  isExpanded: boolean; 
  setIsExpanded: (value: boolean) => void; 
  targetedFiles: string[] 
}) {
  return (
    <div 
      className="relative flex items-center justify-between px-3 py-2.5 cursor-pointer hover:bg-bolt-elements-item-backgroundHover/40 rounded-t-md transition-all duration-200 group"
      onClick={() => setIsExpanded(!isExpanded)}
    >
      <div className="flex items-center gap-1.5">
        <span className={classNames(
          'transition-transform duration-200 ease-in-out',
          isExpanded ? 'rotate-90' : 'rotate-0'
        )}>
          <span className="i-ph:caret-right text-[13px] text-bolt-elements-textSecondary/80 group-hover:text-bolt-elements-accent transition-all duration-200" />
        </span>
        <h3 className="text-[13px] font-medium text-bolt-elements-textSecondary flex items-center gap-2">
          <span className="i-ph:files-duotone text-[13px] text-bolt-elements-textSecondary/80 hover:text-bolt-elements-textSecondary transition-colors" />
          <span className="relative">
            Fichiers ciblés
            <span className="absolute -top-1 -right-2 w-2 h-2 bg-bolt-elements-accent rounded-full animate-ping" />
            <span className="absolute -top-1 -right-2 w-2 h-2 bg-bolt-elements-accent rounded-full animate-pulse" />
          </span>
          <span className="px-2 py-0.5 bg-green-500/20 text-white rounded-full text-[11px] font-semibold group-hover:bg-bolt-elements-background-depth-4 group-hover:text-bolt-elements-accent transition-all duration-200 border border-bolt-elements-borderColor/20">
            {targetedFiles.length}
          </span>
        </h3>
      </div>
      
      {!isExpanded && targetedFiles.length > 0 && (
        <CollapsedFilePreview file={targetedFiles[0]} count={targetedFiles.length} />
      )}
    </div>
  );
}

// Collapsed file preview component
function CollapsedFilePreview({ file, count }: { file: string; count: number }) {
  return (
    <div className="flex items-center gap-2 text-[11px] text-bolt-elements-textSecondary bg-bolt-elements-background-depth-3/80 backdrop-blur-sm px-3 py-1.5 rounded-full border border-bolt-elements-borderColor/20 shadow-sm hover:shadow-md transition-all duration-200">
      <span className={classNames(getFileIcon(file), "flex-shrink-0 text-[12px]")} />
      <span className="font-mono truncate max-w-[120px]">
        {file.split('/').pop()}
      </span>
      {count > 1 && (
        <span className="text-bolt-elements-textSecondary/70 bg-bolt-elements-background-depth-4 px-1.5 py-0.5 rounded-full text-[10px] font-medium">
          +{count - 1}
        </span>
      )}
    </div>
  );
}

// File list component
function FileList({ 
  targetedFiles, 
  removeTargetedFile 
}: { 
  targetedFiles: string[]; 
  removeTargetedFile: (filePath: string) => void 
}) {
  return (
    <div className="space-y-1.5 max-h-[180px] overflow-y-auto pr-0.5 custom-scrollbar p-2.5 pt-2 border-t border-bolt-elements-borderColor/20 bg-bolt-elements-background-depth-2/50 backdrop-blur-sm">
      {targetedFiles.map((filePath, index) => (
        <FileListItem 
          key={`${filePath}-${index}`}
          filePath={filePath}
          onRemove={removeTargetedFile}
        />
      ))}
    </div>
  );
}

// Enhanced FileListItem with tooltip and better accessibility
function FileListItem({ 
  filePath, 
  onRemove 
}: { 
  filePath: string; 
  onRemove: (filePath: string) => void 
}) {
  const fileName = filePath.split('/').pop() || filePath;
  const folderPath = filePath.replace(`/${fileName}`, '');
  
  return (
    <div 
      className="flex items-center justify-between group py-2 px-3 rounded-md hover:bg-bolt-elements-item-backgroundHover/80 hover:shadow-sm transition-all duration-200 backdrop-blur-sm border border-transparent hover:border-bolt-elements-borderColor/20"
      role="listitem"
      aria-label={`Fichier: ${fileName}`}
    >
      <div className="flex items-center gap-2 text-[11px] text-bolt-elements-textPrimary overflow-hidden">
        <span 
          className={classNames(getFileIcon(filePath), "flex-shrink-0 text-[13px]")}
          aria-hidden="true"
        />
        <div className="flex flex-col min-w-0">
          <span 
            className="font-mono font-medium truncate"
            title={fileName}
            aria-label={`Nom du fichier: ${fileName}`}
          >
            {fileName}
          </span>
          {folderPath && (
            <span 
              className="text-[10px] text-bolt-elements-textSecondary/70 truncate"
              title={folderPath}
              aria-label={`Dossier: ${folderPath}`}
            >
              {folderPath}
            </span>
          )}
        </div>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemove(filePath);
        }}
        className="opacity-0 group-hover:opacity-100 text-bolt-elements-textSecondary hover:text-white px-2.5 py-1 rounded-md bg-red-500/10 hover:bg-red-500 transition-all duration-200 text-[11px] font-medium flex items-center gap-1.5 backdrop-blur-sm hover:shadow-md"
        title="Retirer ce fichier"
        aria-label={`Retirer ${filePath} des fichiers ciblés`}
      >
        <span className="i-ph:x text-[12px]" aria-hidden="true" />
        <span>Retirer</span>
      </button>
    </div>
  );
}

// Carte d'icônes pour différents types de fichiers
const iconMap: Record<string, string> = {
  // JavaScript et TypeScript
  js: 'i-ph:file-js-duotone text-yellow-400',
  jsx: 'i-ph:file-jsx-duotone text-blue-400',
  ts: 'i-ph:file-ts-duotone text-blue-500',
  tsx: 'i-ph:file-tsx-duotone text-blue-500',
  mjs: 'i-ph:file-js-duotone text-yellow-400',
  cjs: 'i-ph:file-js-duotone text-yellow-400',
  
  // Styles
  css: 'i-ph:file-css-duotone text-blue-400',
  scss: 'i-ph:file-css-duotone text-pink-400',
  sass: 'i-ph:file-css-duotone text-pink-500',
  less: 'i-ph:file-css-duotone text-indigo-400',
  
  // Markup et templates
  html: 'i-ph:file-html-duotone text-orange-500',
  xml: 'i-ph:file-code-duotone text-orange-400',
  svg: 'i-ph:file-svg-duotone text-green-400',
  vue: 'i-ph:file-vue-duotone text-green-500',
  astro: 'i-ph:file-code-duotone text-purple-500',
  
  // Data
  json: 'i-ph:file-json-duotone text-yellow-300',
  yaml: 'i-ph:file-code-duotone text-red-300',
  yml: 'i-ph:file-code-duotone text-red-300',
  toml: 'i-ph:file-code-duotone text-red-400',
  
  // Documentation
  md: 'i-ph:file-text-duotone text-gray-400',
  mdx: 'i-ph:file-text-duotone text-blue-300',
  txt: 'i-ph:file-text-duotone text-gray-300',
  
  // Images
  png: 'i-ph:file-image-duotone text-purple-400',
  jpg: 'i-ph:file-image-duotone text-purple-400',
  jpeg: 'i-ph:file-image-duotone text-purple-400',
  gif: 'i-ph:file-image-duotone text-purple-400',
  webp: 'i-ph:file-image-duotone text-purple-400',
  ico: 'i-ph:file-image-duotone text-purple-300',
  
  // Documents
  pdf: 'i-ph:file-pdf-duotone text-red-500',
  doc: 'i-ph:file-doc-duotone text-blue-600',
  docx: 'i-ph:file-doc-duotone text-blue-600',
  xls: 'i-ph:file-xls-duotone text-green-600',
  xlsx: 'i-ph:file-xls-duotone text-green-600',
  ppt: 'i-ph:file-ppt-duotone text-orange-600',
  pptx: 'i-ph:file-ppt-duotone text-orange-600',
  
  // Configuration
  env: 'i-ph:file-lock-duotone text-green-300',
  gitignore: 'i-ph:git-branch-duotone text-gray-400',
  eslintrc: 'i-ph:file-code-duotone text-purple-300',
  prettierrc: 'i-ph:file-code-duotone text-pink-300',
  babelrc: 'i-ph:file-code-duotone text-yellow-300',
  
  // Packages
  lock: 'i-ph:lock-key-duotone text-yellow-500',
  
  // Autres formats de code
  py: 'i-ph:file-py-duotone text-blue-500',
  rb: 'i-ph:file-code-duotone text-red-500',
  php: 'i-ph:file-php-duotone text-indigo-400',
  java: 'i-ph:file-code-duotone text-orange-600',
  c: 'i-ph:file-code-duotone text-blue-300',
  cpp: 'i-ph:file-code-duotone text-blue-400',
  cs: 'i-ph:file-code-duotone text-purple-400',
  go: 'i-ph:file-code-duotone text-blue-300',
  rs: 'i-ph:file-code-duotone text-orange-400',
  swift: 'i-ph:file-code-duotone text-orange-500',
  kt: 'i-ph:file-code-duotone text-purple-500',
  
  // Fichiers spéciaux
  license: 'i-ph:file-doc-duotone text-gray-400',
  readme: 'i-ph:file-text-duotone text-blue-300',
  dockerfile: 'i-ph:cube-duotone text-blue-400',
  
  // Binaires et exécutables
  exe: 'i-ph:file-code-duotone text-gray-500',
  dll: 'i-ph:file-code-duotone text-gray-500',
  so: 'i-ph:file-code-duotone text-gray-500',
  
  // Archives
  zip: 'i-ph:file-zip-duotone text-yellow-600',
  rar: 'i-ph:file-zip-duotone text-purple-600',
  tar: 'i-ph:file-zip-duotone text-brown-600',
  gz: 'i-ph:file-zip-duotone text-red-600',
};

// Fonction pour obtenir l'icône du fichier
function getFileIcon(filePath: string) {
  if (!filePath || typeof filePath !== 'string') {
    return 'i-ph:file-duotone text-gray-400';
  }
  
  // Extraire le nom du fichier et l'extension
  const fileName = filePath.split('/').pop() || '';
  const extension = fileName.split('.').pop()?.toLowerCase() || '';
  
  // Vérifier d'abord les fichiers spéciaux par nom (sans extension)
  if (fileName.toLowerCase() === 'dockerfile') {
    return 'i-ph:cube-duotone text-blue-400';
  }
  
  if (fileName.toLowerCase() === 'package.json') {
    return 'i-ph:file-js-duotone text-green-400';
  }
  
  if (fileName.toLowerCase() === 'package-lock.json' || fileName.toLowerCase() === 'yarn.lock' || fileName.toLowerCase() === 'pnpm-lock.yaml') {
    return 'i-ph:lock-key-duotone text-yellow-500';
  }
  
  if (fileName.toLowerCase().includes('license')) {
    return 'i-ph:file-doc-duotone text-gray-400';
  }
  
  if (fileName.toLowerCase().includes('readme')) {
    return 'i-ph:file-text-duotone text-blue-300';
  }
  
  // Vérifier les fichiers de configuration
  if (fileName.startsWith('.') && !extension) {
    // Fichiers de configuration cachés sans extension (.gitignore, .env, etc.)
    if (fileName.includes('git')) {
      return 'i-ph:git-branch-duotone text-gray-400';
    }
    if (fileName.includes('env')) {
      return 'i-ph:file-lock-duotone text-green-300';
    }
    return 'i-ph:gear-duotone text-gray-400';
  }
  
  // Vérifier les fichiers de configuration avec extension
  if (fileName.startsWith('.') && extension) {
    // .eslintrc.js, .prettierrc.json, etc.
    if (fileName.includes('eslint')) {
      return 'i-ph:file-code-duotone text-purple-300';
    }
    if (fileName.includes('prettier')) {
      return 'i-ph:file-code-duotone text-pink-300';
    }
    if (fileName.includes('babel')) {
      return 'i-ph:file-code-duotone text-yellow-300';
    }
    if (fileName.includes('tsconfig')) {
      return 'i-ph:file-ts-duotone text-blue-500';
    }
  }
  
  // Vérifier l'extension dans la carte d'icônes
  return iconMap[extension] || 'i-ph:file-duotone text-gray-400';
}

// Add this function to the exports to make it available for other components
export function addTargetedFile(filePath: string, textareaElement: HTMLTextAreaElement | null) {
  if (!textareaElement) return false;
  
  try {
    // Get current targeted files
    const filesAttr = textareaElement.getAttribute('data-targeted-files');
    const currentFiles = filesAttr ? JSON.parse(filesAttr) : [];
    
    // Add new file if it doesn't exist
    if (!currentFiles.includes(filePath)) {
      const newFiles = [...currentFiles, filePath];
      textareaElement.setAttribute('data-targeted-files', JSON.stringify(newFiles));
      return true;
    }
    
    return false;
  } catch (e) {
    console.error('Error adding targeted file:', e);
    return false;
  }
}
