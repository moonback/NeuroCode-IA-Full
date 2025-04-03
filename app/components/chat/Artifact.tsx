import { useStore } from '@nanostores/react';
import { AnimatePresence, motion } from 'framer-motion';
import { computed } from 'nanostores';
import { memo, useEffect, useRef, useState } from 'react';
import { createHighlighter, type BundledLanguage, type BundledTheme, type HighlighterGeneric } from 'shiki';
import type { ActionState } from '~/lib/runtime/action-runner';
import { workbenchStore } from '~/lib/stores/workbench';
import { classNames } from '~/utils/classNames';
import { cubicEasingFn } from '~/utils/easings';
import { WORK_DIR } from '~/utils/constants';
import { generateId } from '~/utils/fileUtils';
import type { ButtonAction } from '~/types/actions';
import type { Message } from 'ai';
import { createScopedLogger } from '~/utils/logger';

const highlighterOptions = {
  langs: ['shell'],
  themes: ['light-plus', 'dark-plus'],
};

const shellHighlighter: HighlighterGeneric<BundledLanguage, BundledTheme> =
  import.meta.hot?.data.shellHighlighter ?? (await createHighlighter(highlighterOptions));

if (import.meta.hot) {
  import.meta.hot.data.shellHighlighter = shellHighlighter;
}

interface ArtifactProps {
  messageId: string;
}

export const Artifact = memo(({ messageId }: ArtifactProps) => {
  const userToggledActions = useRef(false);
  const [showActions, setShowActions] = useState(false);
  const [allActionFinished, setAllActionFinished] = useState(false);

  const artifacts = useStore(workbenchStore.artifacts);
  const artifact = artifacts[messageId];

  const actions = useStore(
    computed(artifact.runner.actions, (actions) => {
      // Filter out Supabase actions except for migrations
      return Object.values(actions).filter((action) => {
        // Exclude actions with type 'supabase' or actions that contain 'supabase' in their content
        return action.type !== 'supabase' && !(action.type === 'shell' && action.content?.includes('supabase'));
      });
    }),
  );

  const toggleActions = () => {
    userToggledActions.current = true;
    setShowActions(!showActions);
  };

  useEffect(() => {
    if (actions.length && !showActions && !userToggledActions.current) {
      setShowActions(true);
    }

    if (actions.length !== 0 && artifact.type === 'bundled') {
      const finished = !actions.find((action) => action.status !== 'complete');

      if (allActionFinished !== finished) {
        setAllActionFinished(finished);
      }
    }
  }, [actions]);

  return (
    <div className="artifact border border-bolt-elements-borderColor flex flex-col overflow-hidden rounded-lg w-full transition-border duration-150">
      <div className="flex">
        <button
          className="flex items-stretch bg-bolt-elements-artifacts-background hover:bg-bolt-elements-artifacts-backgroundHover w-full overflow-hidden"
          // onClick={() => {
          //   const showWorkbench = workbenchStore.showWorkbench.get();
          //   workbenchStore.showWorkbench.set(!showWorkbench);
          // }}
        >
          {artifact.type == 'bundled' && (
            <>
              <div className="p-4">
                {allActionFinished ? (
                  <div className={'i-ph:files-light'} style={{ fontSize: '2rem' }}></div>
                ) : (
                  <div className={'i-svg-spinners:90-ring-with-bg'} style={{ fontSize: '2rem' }}></div>
                )}
              </div>
              <div className="bg-bolt-elements-artifacts-borderColor w-[1px]" />
            </>
          )}
          <div className="px-5 p-3.5 w-full text-left">
            <div className="w-full text-bolt-elements-textPrimary font-medium leading-5 text-sm">{artifact?.title}</div>
            {/* <div className="w-full w-full t:ext-bolt-elements-textSecondary text-xs mt-0.5">Click to open Workbench</div> */}
          </div>
        </button>
        <div className="bg-bolt-elements-artifacts-borderColor w-[1px]" />
        <AnimatePresence>
          {actions.length && artifact.type !== 'bundled' && (
            <motion.button
              initial={{ width: 0 }}
              animate={{ width: 'auto' }}
              exit={{ width: 0 }}
              transition={{ duration: 0.15, ease: cubicEasingFn }}
              className="bg-bolt-elements-artifacts-background hover:bg-bolt-elements-artifacts-backgroundHover"
              onClick={toggleActions}
            >
              <div className="p-4">
                <div className={showActions ? 'i-ph:caret-up-bold' : 'i-ph:caret-down-bold'}></div>
              </div>
            </motion.button>
          )}
        </AnimatePresence>
      </div>
      <AnimatePresence>
        {artifact.type !== 'bundled' && showActions && actions.length > 0 && (
          <motion.div
            className="actions"
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: '0px' }}
            transition={{ duration: 0.15 }}
          >
            <div className="bg-bolt-elements-artifacts-borderColor h-[1px]" />

            <div className="p-5 text-left bg-bolt-elements-actions-background">
              <ActionList actions={actions} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

interface ShellCodeBlockProps {
  classsName?: string;
  code: string;
}

function ShellCodeBlock({ classsName, code }: ShellCodeBlockProps) {
  const theme = document.documentElement.classList.contains('dark') ? 'dark-plus' : 'light-plus';

  return (
    <div
      className={classNames('text-xs', classsName)}
      dangerouslySetInnerHTML={{
        __html: shellHighlighter.codeToHtml(code, {
          lang: 'shell',
          theme: 'dark-plus',
        }),
        __html: safeShellHighlight(code, theme),

      }}
    ></div>
  );
}

// Add these safety constants and utilities for Shiki
const artifactLogger = createScopedLogger('Artifact');
const MAX_SHELL_LENGTH = 50000; // Maximum shell output length to highlight
const MAX_LINE_LENGTH = 5000; // Maximum line length before truncating

/**
 * Safely highlight shell code with error handling
 * @param content Shell content to highlight
 * @param theme Theme to use for highlighting
 * @returns HTML string with highlighted shell content or safe fallback
 */
function safeShellHighlight(content: string, theme: string): string {
  try {
    if (!content || content.length > MAX_SHELL_LENGTH) {
      artifactLogger.warn(`Shell content too large (${content?.length || 0} chars). Using plain text.`);
      return escapeHtml(content);
    }

    // Check for overly long lines that could cause memory issues
    if (content.includes('\n')) {
      const lines = content.split('\n');
      const hasLongLines = lines.some((line) => line.length > MAX_LINE_LENGTH);

      if (hasLongLines) {
        artifactLogger.warn('Shell content has very long lines. Truncating for safety.');
        content = lines
          .map((line) =>
            line.length > MAX_LINE_LENGTH ? `${line.substring(0, MAX_LINE_LENGTH)}... [truncated]` : line,
          )
          .join('\n');
      }
    }

    // Apply shell highlighting with error handling
    return shellHighlighter.codeToHtml(content, { lang: 'shell', theme });
  } catch (error) {
    artifactLogger.error('Shell highlighting error:', error);
    return `<pre><code>${escapeHtml(content)}</code></pre>`;
  }
}

/**
 * Escape HTML special characters for safe rendering
 */
function escapeHtml(text: string): string {
  return (text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
interface ActionListProps {
  actions: ActionState[];
}

const actionVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

function openArtifactInWorkbench(filePath: any) {
  if (workbenchStore.currentView.get() !== 'code') {
    workbenchStore.currentView.set('code');
  }

  workbenchStore.setSelectedFile(`${WORK_DIR}/${filePath}`);
}

// Helper function to create the actual run commands message
function createRunCommandsMessage(setupCmd?: string, startCmd?: string): Message | null {
  if (!setupCmd && !startCmd) {
    return null;
  }

  let commandString = '';

  if (setupCmd) {
    commandString += `\n<boltAction type="shell">${setupCmd}</boltAction>`;
  }

  if (startCmd) {
    commandString += `\n<boltAction type="start">${startCmd}</boltAction>\n`;
  }

  return {
    role: 'assistant',
    content: `\n<boltArtifact id="project-run-${generateId()}" title="Running Project Setup">\n${commandString}\n</boltArtifact>\nSetting up and starting the application...`,
    id: generateId(),
    createdAt: new Date(),
  };
}

async function handleButtonAction(action: ButtonAction) {
  const { value, artifactId } = action;
  console.log('Button clicked:', value, 'for artifact:', artifactId);

  const userMessage: Message = {
    role: 'user',
    id: generateId(),
    content: value.startsWith('proceed') ? 'Oui, installez et démarrez.' : "Non, je vais sauter pour l'instant.",
    createdAt: new Date(),
  };

  if (value.startsWith('proceed')) {
    // Parse commands from the value: "proceed|setupCmd|startCmd"
    const parts = value.split('|');
    const setupCmd = parts[1] || undefined; // Get setup command or undefined
    const startCmd = parts[2] || undefined; // Get start command or undefined

    console.log('Parsed commands:', { setupCmd, startCmd });

    if (setupCmd || startCmd) {
      const runCommandsMsg = createRunCommandsMessage(setupCmd, startCmd);

      if (runCommandsMsg) {
        console.log('Proceeding: Adding user message and run commands message.');
        workbenchStore.addCommandsMessage(userMessage, runCommandsMsg);
      } else {
        console.error('Failed to create run commands message even though commands were parsed.');
        workbenchStore.addCommandsMessage(userMessage, null); // Add only user message
      }
    } else {
      console.warn('Proceed clicked, but no commands embedded in value. Adding only user message.');
      workbenchStore.addCommandsMessage(userMessage, null);
    }
  } else if (value === 'skip') {
    console.log('Skipping setup. Adding user message.');
    workbenchStore.addCommandsMessage(userMessage, null);
  }
}

const ActionList = memo(({ actions }: ActionListProps) => {
  const [clickedButtons, setClickedButtons] = useState<Set<string>>(new Set());
  const [skipClicked, setSkipClicked] = useState(false); // Nouvel état pour suivre si "Ignorer" a été cliqué

  const handleButtonClick = (action: ButtonAction) => {
    const buttonId = `${action.artifactId}-${action.value}`;
    console.log('handleButtonClick triggered for:', buttonId, 'Action:', action);

    if (!clickedButtons.has(buttonId)) {
      setClickedButtons((prev) => {
        const newSet = new Set(prev);
        newSet.add(buttonId);
        return newSet;
      });
      
      if (action.value === 'skip') {
        setSkipClicked(true); // Mettre à jour l'état si c'est "Ignorer" qui a été cliqué
      }
      
      handleButtonAction(action);
    } else {
      console.log('Button already clicked:', buttonId);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
      <ul className="list-none space-y-2.5">
        {actions.map((action, index) => {
          if (action.type === 'button') {
            const buttonAction = action as ButtonAction;

            // Use the full value for the ID to differentiate between proceed buttons with different commands
            const buttonId = `${buttonAction.artifactId}-${buttonAction.value}`;
            const isButtonClicked = clickedButtons.has(buttonId);
            const displayValue = buttonAction.value.startsWith('proceed') ? 'proceed' : buttonAction.value; // Use 'proceed' for display

            return (
              <motion.li
                key={buttonId}
                variants={actionVariants}
                initial="hidden"
                animate="visible"
                transition={{ duration: 0.2, ease: cubicEasingFn }}
                className="relative"
              >
                {!isButtonClicked ? (
                  <div className="mt-4 flex gap-3 justify-center">
                    {/* Only show buttons if no installation is in progress AND skip hasn't been clicked */}
                    {!Array.from(clickedButtons).some(id => id.includes('proceed')) && !skipClicked && (
                      <button
                        onClick={() => handleButtonClick(buttonAction)}
                        className={classNames(
                          'px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200',
                          displayValue === 'proceed'
                            ? 'bg-bolt-elements-item-backgroundAccent text-bolt-elements-item-contentAccent hover:brightness-110 hover:scale-105'
                            : 'bg-bolt-elements-artifacts-background text-bolt-elements-textPrimary hover:bg-bolt-elements-artifacts-backgroundHover hover:scale-105',
                          'flex items-center gap-2 shadow-sm hover:shadow-md'
                        )}
                      >
                        {displayValue === 'proceed' ? (
                          <>
                            <div className="i-ph:check-circle-bold animate-pulse"></div>
                            <span className="relative">
                              Installez et démarrez
                              <span className="absolute -bottom-1 left-0 w-full h-0.5 bg-current transform scale-x-0 transition-transform origin-left group-hover:scale-x-100"></span>
                            </span>
                          </>
                        ) : (
                          <>
                            <div className="i-ph:x-circle-bold"></div>
                            <span className="relative">
                              Ignorer pour l'instant
                              <span className="absolute -bottom-1 left-0 w-full h-0.5 bg-current transform scale-x-0 transition-transform origin-left group-hover:scale-x-100"></span>
                            </span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="mt-3 text-sm font-medium flex items-center gap-2 justify-center">
                    {displayValue === 'proceed' ? (
                      <>
                        <div className="i-svg-spinners:90-ring-with-bg text-bolt-elements-item-contentAccent animate-spin"></div>
                        <span className="text-bolt-elements-item-contentAccent font-medium">
                          Installation en cours...
                        </span>
                      </>
                    ) : null}
                  </div>
                )}
              </motion.li>
            );
          }

          // Existing rendering for other action types
          const { status, type, content } = action as any; // Cast to any for existing logic
          const isLast = index === actions.length - 1;

          return (
            <motion.li
              key={index}
              variants={actionVariants}
              initial="hidden"
              animate="visible"
              transition={{
                duration: 0.2,
                ease: cubicEasingFn,
              }}
            >
              <div className="flex items-center gap-1.5 text-sm">
                <div className={classNames('text-lg', getIconColor(status))}>
                  {/* Icon rendering based on status */}
                  {status === 'running' ? (
                    <>
                      {type !== 'start' ? (
                        <div className="i-svg-spinners:90-ring-with-bg"></div>
                      ) : (
                        <div className="i-ph:terminal-window-duotone"></div>
                      )}
                    </>
                  ) : status === 'pending' ? (
                    <div className="i-ph:circle-duotone"></div>
                  ) : status === 'complete' ? (
                    <div className="i-ph:check"></div>
                  ) : status === 'failed' || status === 'aborted' ? (
                    <div className="i-ph:x"></div>
                  ) : null}
                </div>

                {/* Content rendering based on type */}
                {
                  type === 'file' ? (
                    <div>
                      Create{' '}
                      <code
                        className="bg-bolt-elements-artifacts-inlineCode-background text-bolt-elements-artifacts-inlineCode-text px-1.5 py-1 rounded-md text-bolt-elements-item-contentAccent hover:underline cursor-pointer"
                        onClick={() => openArtifactInWorkbench((action as any).filePath)}
                      >
                        {(action as any).filePath}
                      </code>
                    </div>
                  ) : type === 'shell' ? (
                    <div className="flex items-center w-full min-h-[28px]">
                      <span className="flex-1">Run command</span>
                    </div>
                  ) : type === 'start' ? (
                    <a
                      onClick={(e) => {
                        e.preventDefault();
                        workbenchStore.currentView.set('preview');
                      }}
                      className="flex items-center w-full min-h-[28px]"
                    >
                      <span className="flex-1">Start Application</span>
                    </a>
                  ) : null /* Handle other types if necessary */
                }
              </div>

              {/* ShellCodeBlock rendering */}
              {(type === 'shell' || type === 'start') && (
                <ShellCodeBlock classsName={classNames('mt-1', { 'mb-3.5': !isLast })} code={content} />
              )}
            </motion.li>
          );
        })}
      </ul>
    </motion.div>
  );
});

function getIconColor(status: ActionState['status']) {
  switch (status) {
    case 'pending': {
      return 'text-bolt-elements-textTertiary';
    }
    case 'running': {
      return 'text-bolt-elements-loader-progress';
    }
    case 'complete': {
      return 'text-bolt-elements-icon-success';
    }
    case 'aborted': {
      return 'text-bolt-elements-textSecondary';
    }
    case 'failed': {
      return 'text-bolt-elements-icon-error';
    }
    default: {
      return undefined;
    }
  }
}
