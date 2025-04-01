import { motion, type Variants } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { Dialog, DialogButton, DialogDescription, DialogRoot, DialogTitle } from '~/components/ui/Dialog';
import { ThemeSwitch } from '~/components/ui/ThemeSwitch';
import { ControlPanel } from '~/components/@settings/core/ControlPanel';
import { SettingsButton } from '~/components/ui/SettingsButton';
import { db, deleteById, getAll, chatId, type ChatHistoryItem, useChatHistory } from '~/lib/persistence';
import { cubicEasingFn } from '~/utils/easings';
import { logger } from '~/utils/logger';
import { HistoryItem } from './HistoryItem';
import { binDates } from './date-binning';
import { useSearchFilter } from '~/lib/hooks/useSearchFilter';
import { classNames } from '~/utils/classNames';
import { useStore } from '@nanostores/react';
import { profileStore } from '~/lib/stores/profile';
import { useSettings } from '~/lib/hooks/useSettings';
import { PromptLibrary } from '~/lib/common/prompt-library';
import { ProjectList } from './ProjectList';

const menuVariants = {
  closed: {
    opacity: 0,
    visibility: 'hidden',
    left: '-340px',
    transition: {
      duration: 0.2,
      ease: cubicEasingFn,
    },
  },
  open: {
    opacity: 1,
    visibility: 'initial',
    left: 0,
    transition: {
      duration: 0.2,
      ease: cubicEasingFn,
    },
  },
} satisfies Variants;

type DialogContent = { type: 'delete'; item: ChatHistoryItem } | { type: 'delete-multiple'; items: ChatHistoryItem[] } | null;

function CurrentDateTime() {
  const [dateTime, setDateTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setDateTime(new Date());
    }, 60000);

    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 dark:text-gray-400 border-b border-gray-100 dark:border-gray-800/50">
      <div className="h-4 w-4 i-lucide:clock opacity-80" />
      <div className="flex gap-2">
        <span>{dateTime.toLocaleDateString()}</span>
        <span>{dateTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
      </div>
    </div>
  );
}

export const Menu = () => {
  const { contextOptimizationEnabled, enableContextOptimization, autoSelectTemplate, setAutoSelectTemplate, promptId, setPromptId } = useSettings();
  const { duplicateCurrentChat, exportChat } = useChatHistory();
  const menuRef = useRef<HTMLDivElement>(null);
  const [list, setList] = useState<ChatHistoryItem[]>([]);
  const [open, setOpen] = useState(false);
  const [dialogContent, setDialogContent] = useState<DialogContent>(null);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isProjectListOpen, setIsProjectListOpen] = useState(false);
  const profile = useStore(profileStore);

  const { filteredItems: filteredList, handleSearchChange } = useSearchFilter({
    items: list,
    searchFields: ['description'],
  });

  const loadEntries = useCallback(() => {
    if (db) {
      getAll(db)
        .then((list) => list.filter((item) => item.urlId && item.description))
        .then(setList)
        .catch((error) => toast.error(error.message));
    }
  }, []);

  const deleteItems = useCallback(async (items: ChatHistoryItem[]) => {
    if (db) {
      try {
        await Promise.all(items.map((item) => deleteById(db!, item.id)));
        loadEntries();

        const currentChatId = chatId.get();
        if (items.some((item) => item.id === currentChatId)) {
          window.location.pathname = '/';
        }
      } catch (error) {
        toast.error('Failed to delete conversations');
        logger.error(error);
      }
    }
  }, []);

  const deleteItem = useCallback((event: React.UIEvent, item: ChatHistoryItem) => {
    event.preventDefault();

    if (db) {
      deleteById(db, item.id)
        .then(() => {
          loadEntries();

          if (chatId.get() === item.id) {
            // hard page navigation to clear the stores
            window.location.pathname = '/';
          }
        })
        .catch((error) => {
          toast.error('Failed to delete conversation');
          logger.error(error);
        });
    }
  }, []);

  const closeDialog = () => {
    setDialogContent(null);
  };

  useEffect(() => {
    if (open) {
      loadEntries();
    }
  }, [open]);

  useEffect(() => {
    const enterThreshold = 40;
    const exitThreshold = 40;

    function onMouseMove(event: MouseEvent) {
      if (isSettingsOpen) {
        return;
      }

      if (event.pageX < enterThreshold) {
        setOpen(true);
      }

      if (menuRef.current && event.clientX > menuRef.current.getBoundingClientRect().right + exitThreshold) {
        setOpen(false);
      }
    }

    window.addEventListener('mousemove', onMouseMove);

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
    };
  }, [isSettingsOpen]);

  const handleDeleteClick = (event: React.UIEvent, item: ChatHistoryItem) => {
    if (isSelectionMode) {
      event.preventDefault();
      event.stopPropagation();
      const isSelected = selectedItems.includes(item.id);
      setSelectedItems(isSelected ? selectedItems.filter(id => id !== item.id) : [...selectedItems, item.id]);
      return;
    }

    event.preventDefault();
    setDialogContent({ type: 'delete', item });
  };

  const handleDuplicate = async (id: string) => {
    await duplicateCurrentChat(id);
    loadEntries(); // Reload the list after duplication
  };

  const handleSettingsClick = () => {
    setIsSettingsOpen(true);
    setOpen(false);
  };

  const handleSettingsClose = () => {
    setIsSettingsOpen(false);
  };

  return (
    <>
      <motion.div
        ref={menuRef}
        initial="closed"
        animate={open ? 'open' : 'closed'}
        variants={menuVariants}
        style={{ width: '340px' }}
        className={classNames(
          'flex selection-accent flex-col side-menu fixed top-0 h-full',
          'bg-white dark:bg-gray-950 border-r border-gray-100 dark:border-gray-800/50',
          'shadow-sm text-sm',
          isSettingsOpen ? 'z-40' : 'z-sidebar',
        )}
      >
        <div className="h-12 flex items-center justify-between px-4 border-b border-gray-100 dark:border-gray-800/50 bg-gray-50/50 dark:bg-gray-900/50">
          <div className="text-gray-900 dark:text-white font-medium"></div>
          <div className="flex items-center gap-3">
            <span className="font-medium text-sm text-gray-900 dark:text-white truncate">
              {profile?.username || 'Invité'}
            </span>
            <div className="flex items-center justify-center w-[32px] h-[32px] overflow-hidden bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-500 rounded-full shrink-0">
              {profile?.avatar ? (
                <img
                  src={profile.avatar}
                  alt={profile?.username || 'User'}
                  className="w-full h-full object-cover"
                  loading="eager"
                  decoding="sync"
                />
              ) : (
                <div className="i-ph:user-fill text-lg" />
              )}
            </div>
          </div>
        </div>
        <CurrentDateTime />
        <div className="flex-1 flex flex-col h-full w-full overflow-hidden">
          <div className="p-4 space-y-3">
            <div className="flex justify-between items-center">
              <a
                href="/"
                className="flex gap-2 items-center bg-purple-50 dark:bg-purple-500/10 text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-500/20 rounded-lg px-4 py-2 transition-colors"
              >
                {/* <span className="inline-block i-lucide:message-square h-4 w-4" /> */}
                <span className="text-sm font-medium">Nouvelle discussion</span>
              </a>
              <button
                onClick={() => setIsProjectListOpen(true)}
                className="flex gap-2 items-center bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg px-4 py-2 transition-colors"
              >
                <span className="inline-block i-ph:folder h-4 w-4" />
                <span className="text-sm font-medium">Projets</span>
              </button>
              <div className="flex gap-2">
                {isSelectionMode && (
                  <>
                    <button
                      onClick={() => setSelectedItems(list.map(item => item.id))}
                      className="flex items-center justify-center w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                      title="Sélectionner tout"
                    >
                      <span className="i-ph:check-square-offset-fill text-lg" />
                    </button>
                    <button
                      onClick={() => setSelectedItems([])}
                      className="flex items-center justify-center w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                      title="Effacer la sélection"
                    >
                      <span className="i-ph:selection-slash text-lg" />
                    </button>
                  </>
                )}
                <button
                  onClick={() => {
                    setIsSelectionMode(!isSelectionMode);
                    if (!isSelectionMode) {
                      setSelectedItems([]);
                    }
                  }}
                  className={classNames(
                    'flex items-center justify-center w-8 h-8 rounded-lg transition-colors',
                    isSelectionMode
                      ? 'bg-purple-100 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                  )}
                  title="Mode sélection multiple"
                >
                  <span className="i-ph:check-square-duotone text-lg" />
                </button>
              </div>
            </div>
            {isSelectionMode && selectedItems.length > 0 && (
              <button
                onClick={() => {
                  setDialogContent({
                    type: 'delete-multiple',
                    items: list.filter(item => selectedItems.includes(item.id))
                  });
                }}
                className="w-full flex gap-2 items-center justify-center bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-500/20 rounded-lg px-4 py-2 transition-colors"
              >
                <span className="inline-block i-ph:trash h-4 w-4" />
                <span className="text-sm font-medium">Supprimer la sélection ({selectedItems.length})</span>
              </button>
            )}
            
            <div className="relative w-full">
              <div className="absolute left-3 top-1/2 -translate-y-1/2">
                <span className="i-lucide:search h-4 w-4 text-gray-400 dark:text-gray-500" />
              </div>
              <input
                className="w-full bg-gray-50 dark:bg-gray-900 relative pl-9 pr-3 py-2 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-500/50 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-500 border border-gray-200 dark:border-gray-800"
                type="search"
                placeholder="Rechercher des discussions..."
                onChange={handleSearchChange}
                aria-label="Rechercher des chats"
              />
            </div>
          </div>
          <div className="text-gray-600 dark:text-gray-400 text-sm font-medium px-4 py-2">Vos discussions</div>
          <div className="flex-1 overflow-auto px-3 pb-3">
            {filteredList.length === 0 && (
              <div className="px-4 text-gray-500 dark:text-gray-400 text-sm">
                {list.length === 0 ? 'Aucune conversation antérieure' : 'Aucune correspondance trouvée'}
              </div>
            )}
            <DialogRoot open={dialogContent !== null}>
              {binDates(filteredList).map(({ category, items }) => (
                <div key={category} className="mt-2 first:mt-0 space-y-1">
                  <div className="text-xs font-medium text-gray-500 dark:text-gray-400 sticky top-0 z-1 bg-white dark:bg-gray-950 px-4 py-1">
                    {category}
                  </div>
                  <div className="space-y-0.5 pr-1">
                    {items.map((item) => (
                      <HistoryItem
                        key={item.id}
                        item={item}
                        exportChat={exportChat}
                        onDelete={(event) => handleDeleteClick(event, item)}
                        onDuplicate={() => handleDuplicate(item.id)}
                        isSelectionMode={isSelectionMode}
                        isSelected={selectedItems.includes(item.id)}
                        onSelect={(id) => {
                          const isSelected = selectedItems.includes(id);
                          setSelectedItems(isSelected ? selectedItems.filter(itemId => itemId !== id) : [...selectedItems, id]);
                        }}
                      />
                    ))}
                  </div>
                </div>
              ))}
              <Dialog onBackdrop={closeDialog} onClose={closeDialog}>
                {(dialogContent?.type === 'delete' || dialogContent?.type === 'delete-multiple') && (
                  <>
                    <div className="p-6 bg-white dark:bg-gray-950">
                      <DialogTitle className="text-gray-900 dark:text-white">
                        {dialogContent.type === 'delete' ? 'Supprimer la conversation ?' : 'Supprimer les conversations ?'}
                      </DialogTitle>
                      <DialogDescription className="mt-2 text-gray-600 dark:text-gray-400">
                        {dialogContent.type === 'delete' ? (
                          <p>
                            Vous êtes sur le point de supprimer {' '}
                            <span className="font-medium text-gray-900 dark:text-white">
                              {dialogContent.item.description}
                            </span>
                          </p>
                        ) : (
                          <p>
                            Vous êtes sur le point de supprimer {' '}
                            <span className="font-medium text-gray-900 dark:text-white">
                              {dialogContent.items.length} conversations
                            </span>
                          </p>
                        )}
                        <p className="mt-2">
                          {dialogContent.type === 'delete' 
                            ? 'Êtes-vous sûr de vouloir supprimer cette discussion ?'
                            : 'Êtes-vous sûr de vouloir supprimer ces discussions ?'}
                        </p>
                      </DialogDescription>
                      <div className="mt-4 p-4 bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-300 rounded-lg border border-red-200 dark:border-red-500/30">
                        ⚠️ Cette action est irréversible - toutes les données {dialogContent.type === 'delete' ? 'de la discussion' : 'des discussions'} seront définitivement perdues !
                      </div>
                    </div>
                    <div className="flex justify-end gap-3 px-6 py-4 bg-gray-50 dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800">
                      <DialogButton type="secondary" onClick={closeDialog}>
                        Annuler
                      </DialogButton>
                      <DialogButton
                        type="danger"
                        onClick={(event) => {
                          if (dialogContent.type === 'delete') {
                            deleteItem(event, dialogContent.item);
                          } else {
                            deleteItems(dialogContent.items);
                            setIsSelectionMode(false);
                            setSelectedItems([]);
                          }
                          closeDialog();
                        }}
                      >
                        Supprimer
                      </DialogButton>
                    </div>
                  </>
                )}
              </Dialog>
            </DialogRoot>
          </div>
          <div className="flex items-center justify-between border-t border-gray-200 dark:border-gray-800 px-4 py-3">
            <SettingsButton onClick={handleSettingsClick} />
            <div className="flex items-center gap-3">
              <button
                onClick={() => setAutoSelectTemplate(!autoSelectTemplate)}
                className={classNames(
                  'flex items-center justify-center w-8 h-8 rounded-lg transition-colors',
                  autoSelectTemplate
                    ? 'bg-purple-100 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                )}
                title={`Sélection automatique des modèles ${autoSelectTemplate ? 'activée' : 'désactivée'}`}
              >
                <span className="i-ph:robot-duotone text-lg" />
              </button>
              <button
                onClick={() => enableContextOptimization(!contextOptimizationEnabled)}
                className={classNames(
                  'flex items-center justify-center w-8 h-8 rounded-lg transition-colors',
                  contextOptimizationEnabled
                    ? 'bg-purple-100 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                )}
                title={`Optimisation du contexte ${contextOptimizationEnabled ? 'activée' : 'désactivée'}`}
              >
                <span className="i-ph:sparkle-duotone text-lg" />
              </button>
              <select
                value={promptId}
                onChange={(e) => setPromptId(e.target.value)}
                className="bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-purple-500/50"
              >
                {PromptLibrary.getList().map((prompt) => (
                  <option key={prompt.id} value={prompt.id}>
                    {prompt.label}
                  </option>
                ))}
              </select>
              <ThemeSwitch />
            </div>
          </div>
        </div>
      </motion.div>

      <ControlPanel open={isSettingsOpen} onClose={handleSettingsClose} />

      {isProjectListOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 dark:bg-black/80 backdrop-blur-sm">
          <ProjectList onClose={() => setIsProjectListOpen(false)} />
        </div>
      )}
    </>
  );
};
