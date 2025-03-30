import { AnimatePresence, motion } from 'framer-motion';
import type { ActionAlert } from '~/types/actions';
import { classNames } from '~/utils/classNames';
import { useState } from 'react';

interface Props {
  alert: ActionAlert;
  clearAlert: () => void;
  postMessage: (message: string) => void;
}

export default function ChatAlert({ alert, clearAlert, postMessage }: Props) {
  const { description, content, source, type = 'error' } = alert;
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const isPreview = source === 'preview';
  const title = isPreview ? 'Erreur de Prévisualisation' : 'Erreur de Terminal';
  const message = isPreview
    ? 'Nous avons rencontré une erreur lors de l\'exécution de la prévisualisation. Souhaitez-vous que Neurocode analyse et aide à résoudre ce problème ?'
    : 'Nous avons rencontré une erreur lors de l\'exécution des commandes terminal. Souhaitez-vous que Neurocode analyse et aide à résoudre ce problème ?';
  
  // Déterminer l'icône en fonction du type d'erreur
  const getErrorIcon = () => {
    switch (type) {
      case 'warning':
        return 'i-ph:warning-duotone text-xl text-yellow-500';
      case 'info':
        return 'i-ph:info-duotone text-xl text-blue-500';
      case 'success':
        return 'i-ph:check-circle-duotone text-xl text-green-500';
      case 'error':
      default:
        return 'i-ph:warning-duotone text-xl text-bolt-elements-button-danger-text';
    }
  };
  
  // Fonction pour analyser et résoudre le problème
  const handleAnalyzeError = () => {
    setIsAnalyzing(true);
    postMessage(
      `*Corriger cette erreur ${isPreview ? 'de prévisualisation' : 'de terminal'}* \n\`\`\`${isPreview ? 'js' : 'sh'}\n${content}\n\`\`\`\n`,
    );
    clearAlert();
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        transition={{ duration: 0.3 }}
        className={`rounded-lg border-l-2 ${type === 'error' ? 'border-l-bolt-elements-button-danger-text' : type === 'warning' ? 'border-l-yellow-500' : type === 'info' ? 'border-l-blue-500' : 'border-l-green-500'} border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 mb-2 max-w-full`}
      >
        <div className="flex items-start w-full overflow-hidden">
          {/* Icône */}
          <motion.div
            className="flex-shrink-0"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2 }}
          >
            <div className={getErrorIcon()}></div>
          </motion.div>
          {/* Contenu */}
          <div className="ml-3 flex-1 min-w-0">
            <motion.h3
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="text-sm font-medium text-bolt-elements-textPrimary truncate"
            >
              {title}
            </motion.h3>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="mt-2 text-sm text-bolt-elements-textSecondary break-words whitespace-normal w-full"
            >
              <p>{message}</p>
              
              {/* Affichage conditionnel du contenu détaillé */}
              {description && (
                <div 
                  className="flex items-center p-2 rounded-md bg-bolt-elements-background-depth-3 mt-4 cursor-pointer"
                  onClick={() => setIsCollapsed(!isCollapsed)}
                >
                  <div className="i-ph:code text-bolt-elements-textPrimary mr-2 "></div>
                  <span className="text-xs text-bolt-elements-textPrimary flex-grow">
                    Détails de l'erreur
                  </span>
                  <div
                    className={`i-ph:caret-up text-bolt-elements-textPrimary transition-transform ${isCollapsed ? 'rotate-180' : ''}`}
                  ></div>
                </div>
              )}
              
              {/* Contenu détaillé de l'erreur */}
              {!isCollapsed && description && (
                <div className="mt-2 p-3 bg-bolt-elements-background-depth-4 rounded-md overflow-auto max-h-60 font-mono text-xs text-bolt-elements-textSecondary whitespace-pre-wrap break-words">
                  <pre>{description}</pre>
                </div>
              )}
              
              {!isCollapsed && content && (
<div className="mt-2 p-4 bg-bolt-elements-background-depth-4 rounded-lg overflow-auto max-h-60 font-mono text-xs">
  <div className="flex items-center justify-between mb-2">
    <div className="text-bolt-elements-textPrimary font-medium">Error Content</div>
    <div className="text-bolt-elements-textSecondary text-xs">
      {new Date().toLocaleString()}
    </div>
  </div>
  <div className="border-l-2 border-bolt-elements-borderColor pl-3">
    <pre className="text-bolt-elements-textSecondary whitespace-pre-wrap break-words">
      {content}
    </pre>
  </div>
</div>
              )}
            </motion.div>

            {/* Actions */}
            <motion.div
              className="mt-4"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <div className={classNames('flex gap-2')}>
                <button
                  onClick={handleAnalyzeError}
                  disabled={isAnalyzing}
                  className={classNames(
                    `px-2 py-1.5 rounded-md text-sm font-medium`,
                    'bg-bolt-elements-button-primary-background',
                    'hover:bg-bolt-elements-button-primary-backgroundHover',
                    'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-bolt-elements-button-danger-background',
                    'text-bolt-elements-button-primary-text',
                    'flex items-center gap-1.5',
                    isAnalyzing ? 'opacity-70 cursor-not-allowed' : '',
                  )}
                >
                  <div className="i-ph:chat-circle-duotone"></div>
                  {isAnalyzing ? 'Analyse en cours...' : 'Demander à Neurocode'}
                </button>
                <button
                  onClick={() => setIsCollapsed(!isCollapsed)}
                  className={classNames(
                    `px-2 py-1.5 rounded-md text-sm font-medium`,
                    'bg-bolt-elements-button-secondary-background',
                    'hover:bg-bolt-elements-button-secondary-backgroundHover',
                    'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-bolt-elements-button-secondary-background',
                    'text-bolt-elements-button-secondary-text',
                    'flex items-center gap-1.5',
                  )}
                >
                  <div className={`i-ph:${isCollapsed ? 'eye' : 'eye-closed'}-duotone mr-1`}></div>
                  {isCollapsed ? 'Voir les détails' : 'Masquer les détails'}
                </button>
                <button
                  onClick={clearAlert}
                  className={classNames(
                    `px-2 py-1.5 rounded-md text-sm font-medium`,
                    'bg-bolt-elements-button-secondary-background',
                    'hover:bg-bolt-elements-button-secondary-backgroundHover',
                    'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-bolt-elements-button-secondary-background',
                    'text-bolt-elements-button-secondary-text',
                  )}
                >
                  Fermer
                </button>
              </div>
            </motion.div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
