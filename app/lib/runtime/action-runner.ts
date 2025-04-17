import type { WebContainer } from '@webcontainer/api';
import { path as nodePath } from '~/utils/path';
import { atom, map, type MapStore } from 'nanostores';
import type { ActionAlert, BoltAction, DeployAlert, FileHistory, SupabaseAction, SupabaseAlert } from '~/types/actions';
import { createScopedLogger } from '~/utils/logger';
import { unreachable } from '~/utils/unreachable';
import type { ActionCallbackData } from './message-parser';
import type { BoltShell } from '~/utils/shell';
import { createTwoFilesPatch } from 'diff';

const logger = createScopedLogger('ActionRunner');

export type ActionStatus = 'pending' | 'running' | 'complete' | 'aborted' | 'failed';

export type BaseActionState = BoltAction & {
  status: Exclude<ActionStatus, 'failed'>;
  abort: () => void;
  executed: boolean;
  abortSignal: AbortSignal;
};

export type FailedActionState = BoltAction &
  Omit<BaseActionState, 'status'> & {
    status: Extract<ActionStatus, 'failed'>;
    error: string;
  };

export type ActionState = BaseActionState | FailedActionState;

type BaseActionUpdate = Partial<Pick<BaseActionState, 'status' | 'abort' | 'executed'>>;

export type ActionStateUpdate =
  | BaseActionUpdate
  | (Omit<BaseActionUpdate, 'status'> & { status: 'failed'; error: string });

type ActionsMap = MapStore<Record<string, ActionState>>;

class ActionCommandError extends Error {
  readonly _output: string;
  readonly _header: string;

  constructor(message: string, output: string) {
    // Create a formatted message that includes both the error message and output
    const formattedMessage = `Failed To Execute Shell Command: ${message}\n\nOutput:\n${output}`;
    super(formattedMessage);

    // Set the output separately so it can be accessed programmatically
    this._header = message;
    this._output = output;

    // Maintain proper prototype chain
    Object.setPrototypeOf(this, ActionCommandError.prototype);

    // Set the name of the error for better debugging
    this.name = 'ActionCommandError';
  }

  // Optional: Add a method to get just the terminal output
  get output() {
    return this._output;
  }
  get header() {
    return this._header;
  }
}

export class ActionRunner {
  #webcontainer: Promise<WebContainer>;
  #currentExecutionPromise: Promise<void> = Promise.resolve();
  #shellTerminal: () => BoltShell;
  runnerId = atom<string>(`${Date.now()}`);
  actions: ActionsMap = map({});
  onAlert?: (alert: ActionAlert) => void;
  onSupabaseAlert?: (alert: SupabaseAlert) => void;
  onDeployAlert?: (alert: DeployAlert) => void;
  buildOutput?: { path: string; exitCode: number; output: string };

  constructor(
    webcontainerPromise: Promise<WebContainer>,
    getShellTerminal: () => BoltShell,
    onAlert?: (alert: ActionAlert) => void,
    onSupabaseAlert?: (alert: SupabaseAlert) => void,
    onDeployAlert?: (alert: DeployAlert) => void,

  ) {
    this.#webcontainer = webcontainerPromise;
    this.#shellTerminal = getShellTerminal;
    this.onAlert = onAlert;
    this.onSupabaseAlert = onSupabaseAlert;
    this.onDeployAlert = onDeployAlert;

  }

  addAction(data: ActionCallbackData) {
    const { actionId } = data;

    const actions = this.actions.get();
    const action = actions[actionId];

    if (action) {
      // action already added
      return;
    }

    const abortController = new AbortController();

    this.actions.setKey(actionId, {
      ...data.action,
      status: 'pending',
      executed: false,
      abort: () => {
        abortController.abort();
        this.#updateAction(actionId, { status: 'aborted' });
      },
      abortSignal: abortController.signal,
    });

    this.#currentExecutionPromise.then(() => {
      this.#updateAction(actionId, { status: 'running' });
    });
  }

  async runAction(data: ActionCallbackData, isStreaming: boolean = false) {
    const { actionId } = data;
    const action = this.actions.get()[actionId];

    if (!action) {
      unreachable(`Action ${actionId} not found`);
    }

    if (action.executed) {
      return; // No return value here
    }

    if (isStreaming && action.type !== 'file') {
      return; // No return value here
    }

    this.#updateAction(actionId, { ...action, ...data.action, executed: !isStreaming });

    this.#currentExecutionPromise = this.#currentExecutionPromise
      .then(() => {
        return this.#executeAction(actionId, isStreaming);
      })
      .catch((error) => {
        console.error('Action failed:', error);
      });

    await this.#currentExecutionPromise;

    return;
  }

  async #executeAction(actionId: string, isStreaming: boolean = false) {
    const action = this.actions.get()[actionId];

    this.#updateAction(actionId, { status: 'running' });

    try {
      switch (action.type) {
        case 'shell': {
          await this.#runShellAction(action);
          break;
        }
        case 'file': {
          await this.#runFileAction(action);
          
          // Track file change after successful action
          if (action.type === 'file' && !isStreaming) {
            await this.trackFileChange(action.filePath, action.content, 'external');
          }
          break;
        }
        case 'supabase': {
          try {
            await this.handleSupabaseAction(action as SupabaseAction);
          } catch (error: any) {
            // Update action status
            this.#updateAction(actionId, {
              status: 'failed',
              error: error instanceof Error ? error.message : 'Supabase action failed',
            });

            // Return early without re-throwing
            return;
          }
          break;
        }
        case 'build': {
          const buildOutput = await this.#runBuildAction(action);

          // Store build output for deployment
          this.buildOutput = buildOutput;
          break;
        }
        case 'start': {
          // making the start app non blocking

          this.#runStartAction(action)
            .then(() => this.#updateAction(actionId, { status: 'complete' }))
            .catch((err: Error) => {
              if (action.abortSignal.aborted) {
                return;
              }

              this.#updateAction(actionId, { status: 'failed', error: 'Action failed' });
              logger.error(`[${action.type}]:Action failed\n\n`, err);

              if (!(err instanceof ActionCommandError)) {
                return;
              }

              this.onAlert?.({
                type: 'error',
                title: 'Dev Server Failed',
                description: err.header,
                content: err.output,
              });
            });

          /*
           * adding a delay to avoid any race condition between 2 start actions
           * i am up for a better approach
           */
          await new Promise((resolve) => setTimeout(resolve, 2000));

          return;
        }
      }

      this.#updateAction(actionId, {
        status: isStreaming ? 'running' : action.abortSignal.aborted ? 'aborted' : 'complete',
      });
    } catch (error) {
      if (action.abortSignal.aborted) {
        return;
      }

      this.#updateAction(actionId, { status: 'failed', error: 'Action failed' });
      logger.error(`[${action.type}]:Action failed\n\n`, error);

      if (!(error instanceof ActionCommandError)) {
        return;
      }

      this.onAlert?.({
        type: 'error',
        title: 'Dev Server Failed',
        description: error.header,
        content: error.output,
      });

      // re-throw the error to be caught in the promise chain
      throw error;
    }
  }
  /**
   * Suit les changements de fichiers et gère l'historique des versions
   * Cette méthode peut soit créer un nouveau fichier, soit modifier un fichier existant
   * 
   * @param filePath - Le chemin du fichier à suivre
   * @param newContent - Le nouveau contenu du fichier
   * @param changeSource - La source du changement (user, auto-save, external)
   */
  async trackFileChange(filePath: string, newContent: string, changeSource: 'user' | 'auto-save' | 'external' = 'external') {
    try {
      const webcontainer = await this.#webcontainer;
      const relativePath = nodePath.relative(webcontainer.workdir, filePath);
      
      // Vérifier si le fichier existe déjà
      let fileExists = false;
      try {
        const fileInfo = await webcontainer.fs.readdir(relativePath);
        if (!fileInfo || fileInfo.length === 0) {
          throw new Error('File not found');
        }
        fileExists = true;
        logger.debug(`Le fichier existe déjà: ${relativePath}`);
      } catch (error) {
        // Le fichier n'existe pas encore
        logger.debug(`Nouveau fichier à créer: ${relativePath}`);
        
        // Créer le dossier parent si nécessaire
        const folder = nodePath.dirname(relativePath);
        if (folder !== '.') {
          try {
            await webcontainer.fs.mkdir(folder, { recursive: true });
            logger.debug(`Dossier créé: ${folder}`);
          } catch (folderError) {
            // Ignorer l'erreur si le dossier existe déjà
            if (!(folderError instanceof Error && folderError.message.includes('EEXIST'))) {
              logger.error('Échec de la création du dossier:', folderError);
            }
          }
        }
      }
      
      // Obtenir l'historique existant ou en créer un nouveau
      let history = await this.getFileHistory(filePath);
      const timestamp = Date.now();
      
      if (!history) {
        // Créer un nouvel enregistrement d'historique
        history = {
          originalContent: newContent,
          lastModified: timestamp,
          changes: [],
          versions: [{
            timestamp,
            content: newContent
          }],
          changeSource
        };
        logger.debug(`Nouvel historique créé pour: ${filePath}`);
      } else {
        // Mettre à jour l'historique existant
        history.lastModified = timestamp;
        history.changeSource = changeSource;
        
        // Ajouter une nouvelle version
        history.versions.push({
          timestamp,
          content: newContent
        });
        
        // Limiter l'historique des versions aux 10 dernières pour éviter un stockage excessif
        if (history.versions.length > 10) {
          history.versions = history.versions.slice(-10);
        }
        
        // Calculer les changements par rapport à l'original
        const { diffLines } = await import('diff');
        history.changes = diffLines(history.originalContent, newContent);
        logger.debug(`Historique mis à jour pour: ${filePath}`);
      }
      
      // Écrire le fichier si c'est un nouveau fichier ou si le contenu a changé
      if (!fileExists) {
        await webcontainer.fs.writeFile(relativePath, newContent);
        logger.debug(`Nouveau fichier écrit: ${relativePath}`);
      } else {
        try {
          const currentContent = await webcontainer.fs.readFile(relativePath, 'utf-8');
          if (currentContent !== newContent) {
            await webcontainer.fs.writeFile(relativePath, newContent);
            logger.debug(`Fichier modifié: ${relativePath}`);
          } else {
            logger.debug(`Aucun changement nécessaire pour: ${relativePath}`);
          }
        } catch (readError) {
          // En cas d'erreur de lecture, écrire directement le fichier
          await webcontainer.fs.writeFile(relativePath, newContent);
          logger.debug(`Fichier écrit après erreur de lecture: ${relativePath}`);
        }
      }
      
      // Sauvegarder l'historique mis à jour
      await this.saveFileHistory(filePath, history);
      
    } catch (error) {
      logger.error('Échec du suivi des modifications du fichier:', error);
    }
  }

  async #runShellAction(action: ActionState) {
    if (action.type !== 'shell') {
      unreachable('Expected shell action');
    }

    const shell = this.#shellTerminal();
    await shell.ready();

    if (!shell || !shell.terminal || !shell.process) {
      unreachable('Shell terminal not found');
    }

    const resp = await shell.executeCommand(this.runnerId.get(), action.content, () => {
      logger.debug(`[${action.type}]:Aborting Action\n\n`, action);
      action.abort();
    });
    logger.debug(`${action.type} Shell Response: [exit code:${resp?.exitCode}]`);

    if (resp?.exitCode != 0) {
      throw new ActionCommandError(`Failed To Execute Shell Command`, resp?.output || 'No Output Available');
    }
  }

  async #runStartAction(action: ActionState) {
    if (action.type !== 'start') {
      unreachable('Expected shell action');
    }

    if (!this.#shellTerminal) {
      unreachable('Shell terminal not found');
    }

    const shell = this.#shellTerminal();
    await shell.ready();

    if (!shell || !shell.terminal || !shell.process) {
      unreachable('Shell terminal not found');
    }

    const resp = await shell.executeCommand(this.runnerId.get(), action.content, () => {
      logger.debug(`[${action.type}]:Aborting Action\n\n`, action);
      action.abort();
    });
    logger.debug(`${action.type} Shell Response: [exit code:${resp?.exitCode}]`);

    if (resp?.exitCode != 0) {
      throw new ActionCommandError('Failed To Start Application', resp?.output || 'No Output Available');
    }

    return resp;
  }

  async #runFileAction(action: ActionState) {
    if (action.type !== 'file') {
      unreachable('Expected file action');
    }

    const webcontainer = await this.#webcontainer;
    const relativePath = nodePath.relative(webcontainer.workdir, action.filePath);

    let folder = nodePath.dirname(relativePath);

    // remove trailing slashes
    folder = folder.replace(/\/+$/g, '');

    if (folder !== '.') {
      try {
        await webcontainer.fs.mkdir(folder, { recursive: true });
        logger.debug('Created folder', folder);
      } catch (error) {
        logger.error('Failed to create folder\n\n', error);
      }
    }

    try {
      // Check if file exists first
      let originalContent = '';
      try {
        // Try to read the existing file content
        originalContent = await webcontainer.fs.readFile(relativePath, 'utf-8');
      } catch (error) {
        // File doesn't exist yet, which is fine for new files
        logger.debug(`File doesn't exist yet: ${relativePath}`);
      }

      // If this is a new file or the file has no content, just write directly
      if (!originalContent && action.content) {
        await webcontainer.fs.writeFile(relativePath, action.content);
        logger.debug(`New file written: ${relativePath}`);
        return;
      }

      // Calculate diff and apply as patch
      if (originalContent !== action.content) {
        try {
          // Import the diff library functions
          const { applyPatch } = await import('diff');
          
          // Create a patch
          const patch = createTwoFilesPatch(
            relativePath, 
            relativePath,
            originalContent,
            action.content
          );
          
          // Apply the patch
          const patchResult = applyPatch(originalContent, patch);
          
          if (typeof patchResult === 'boolean' && !patchResult) {
            // Patch failed to apply
            logger.error(`Failed to apply patch to ${relativePath}`);
            
            // Fallback to direct write
            await webcontainer.fs.writeFile(relativePath, action.content);
            logger.debug(`Fallback: File overwritten: ${relativePath}`);
          } else {
            // Patch applied successfully
            await webcontainer.fs.writeFile(relativePath, patchResult);
            logger.debug(`Patched file written: ${relativePath}`);
          }
        } catch (error) {
          logger.error('Error applying patch, falling back to direct write', error);
          // Fallback to direct write if patching fails
          await webcontainer.fs.writeFile(relativePath, action.content);
        }
      } else {
        // No changes needed
        logger.debug(`No changes needed for ${relativePath}`);
      }
    } catch (error) {
      logger.error('Failed to write file\n\n', error);
      throw error;
    }
  }

  #updateAction(id: string, newState: ActionStateUpdate) {
    const actions = this.actions.get();

    this.actions.setKey(id, { ...actions[id], ...newState });
  }

  async getFileHistory(filePath: string): Promise<FileHistory | null> {
    try {
      const webcontainer = await this.#webcontainer;
      const historyPath = this.#getHistoryPath(filePath);
      
      // Ensure the .history directory exists
      const historyDir = nodePath.dirname(historyPath);
      
      try {
        // Create the .history directory if it doesn't exist
        await webcontainer.fs.mkdir(historyDir, { recursive: true });
        logger.debug(`Created history directory: ${historyDir}`);
      } catch (error) {
        // If the error is not because the directory already exists, log it
        if (!(error instanceof Error && error.message.includes('EEXIST'))) {
          logger.error('Failed to create history directory', error);
        }
      }
      
      try {
        // Try to read the existing history file
        const content = await webcontainer.fs.readFile(historyPath, 'utf-8');
        return JSON.parse(content);
      } catch (error) {
        // If the file doesn't exist, that's expected for new files
        if (error instanceof Error && error.message.includes('ENOENT')) {
          logger.debug(`History file doesn't exist yet: ${historyPath}`);
        } else {
          logger.error('Failed to read history file:', error);
        }
        return null;
      }
    } catch (error) {
      logger.error('Failed to get file history:', error);
      return null;
    }
  }

  async saveFileHistory(filePath: string, history: FileHistory) {
    try {
      const webcontainer = await this.#webcontainer;
      const historyPath = this.#getHistoryPath(filePath);
      
      // Ensure the .history directory exists
      const historyDir = nodePath.dirname(historyPath);
      
      try {
        // Create the .history directory if it doesn't exist
        await webcontainer.fs.mkdir(historyDir, { recursive: true });
        logger.debug(`Created history directory: ${historyDir}`);
      } catch (error) {
        // If the error is not because the directory already exists, log it
        if (!(error instanceof Error && error.message.includes('EEXIST'))) {
          logger.error('Failed to create history directory', error);
        }
      }
      
      // Update the history with change source information
      history.changeSource = history.changeSource || 'auto-save';
      
      // Write the history file
      await this.#runFileAction({
        type: 'file',
        filePath: historyPath,
        content: JSON.stringify(history),
        status: 'pending',
        executed: false,
        abort: () => {},
        abortSignal: new AbortController().signal
      });
      
      logger.debug(`File history saved: ${historyPath}`);
    } catch (error) {
      logger.error('Failed to save file history:', error);
    }
  }

  #getHistoryPath(filePath: string) {
    // Normaliser le chemin du fichier pour éviter les problèmes avec les chemins absolus
    // Enlever le préfixe du répertoire de travail si présent
    const normalizedPath = filePath.startsWith('/home/project/') 
      ? filePath.substring('/home/project/'.length) 
      : filePath;
    
    // Créer le chemin dans le dossier .history
    return nodePath.join('.history', normalizedPath);
  }

  async #runBuildAction(action: ActionState) {
    if (action.type !== 'build') {
      unreachable('Expected build action');
    }
 // Trigger build started alert
 this.onDeployAlert?.({
  type: 'info',
  title: 'Building Application',
  description: 'Building your application...',
  stage: 'building',
  buildStatus: 'running',
  deployStatus: 'pending',
  source: 'netlify',
});

    const webcontainer = await this.#webcontainer;

    // Create a new terminal specifically for the build
    const buildProcess = await webcontainer.spawn('npm', ['run', 'build']);

    let output = '';
    buildProcess.output.pipeTo(
      new WritableStream({
        write(data) {
          output += data;
        },
      }),
    );

    const exitCode = await buildProcess.exit;

    if (exitCode !== 0) {
       // Trigger build failed alert
       this.onDeployAlert?.({
        type: 'error',
        title: 'Build Failed',
        description: 'Your application build failed',
        content: output || 'No build output available',
        stage: 'building',
        buildStatus: 'failed',
        deployStatus: 'pending',
        source: 'netlify',
      });
      throw new ActionCommandError('Build Failed', output || 'No Output Available');
    }

  // Trigger build success alert
  this.onDeployAlert?.({
    type: 'success',
    title: 'Build Completed',
    description: 'Your application was built successfully',
    stage: 'deploying',
    buildStatus: 'complete',
    deployStatus: 'running',
    source: 'netlify',
  });

  // Check for common build directories
  const commonBuildDirs = ['dist', 'build', 'out', 'output', '.next', 'public'];

  let buildDir = '';

  // Try to find the first existing build directory
  for (const dir of commonBuildDirs) {
    const dirPath = nodePath.join(webcontainer.workdir, dir);

    try {
      await webcontainer.fs.readdir(dirPath);
      buildDir = dirPath;
      logger.debug(`Found build directory: ${buildDir}`);
      break;
    } catch (error) {
      // Directory doesn't exist, try the next one
      logger.debug(`Build directory ${dir} not found, trying next option. ${error}`);
    }
  }

  // If no build directory was found, use the default (dist)
  if (!buildDir) {
    buildDir = nodePath.join(webcontainer.workdir, 'dist');
    logger.debug(`No build directory found, defaulting to: ${buildDir}`);
  }

    return {
      path: buildDir,
      exitCode,
      output,
    };
  }
  async handleSupabaseAction(action: SupabaseAction) {
    const { operation, content, filePath } = action;
    logger.debug('[Supabase Action]:', { operation, filePath, content });

    switch (operation) {
      case 'migration':
        if (!filePath) {
          throw new Error('Migration requires a filePath');
        }

        // Show alert for migration action
        this.onSupabaseAlert?.({
          type: 'info',
          title: 'Supabase Migration',
          description: `Create migration file: ${filePath}`,
          content,
          source: 'supabase',
        });

        // Only create the migration file
        await this.#runFileAction({
          type: 'file',
          filePath,
          content,
          changeSource: 'supabase',
        } as any);
        return { success: true };

      case 'query': {
        // Always show the alert and let the SupabaseAlert component handle connection state
        this.onSupabaseAlert?.({
          type: 'info',
          title: 'Supabase Query',
          description: 'Execute database query',
          content,
          source: 'supabase',
        });

        // The actual execution will be triggered from SupabaseChatAlert
        return { pending: true };
      }

      default:
        throw new Error(`Unknown operation: ${operation}`);
    }
  }
  
  // Add this method declaration to the class
  handleDeployAction(
    stage: 'building' | 'deploying' | 'complete',
    status: ActionStatus,
    details?: {
      url?: string;
      error?: string;
      source?: 'netlify' | 'vercel' | 'github';
    },
  ): void {
    if (!this.onDeployAlert) {
      logger.debug('No deploy alert handler registered');
      return;
    }

    const alertType = status === 'failed' ? 'error' : status === 'complete' ? 'success' : 'info';

    const title =
      stage === 'building'
        ? 'Building Application'
        : stage === 'deploying'
          ? 'Deploying Application'
          : 'Deployment Complete';

    const description =
      status === 'failed'
        ? `${stage === 'building' ? 'Build' : 'Deployment'} failed`
        : status === 'running'
          ? `${stage === 'building' ? 'Building' : 'Deploying'} your application...`
          : status === 'complete'
            ? `${stage === 'building' ? 'Build' : 'Deployment'} completed successfully`
            : `Preparing to ${stage === 'building' ? 'build' : 'deploy'} your application`;

    const buildStatus =
      stage === 'building' ? status : stage === 'deploying' || stage === 'complete' ? 'complete' : 'pending';

    const deployStatus = stage === 'building' ? 'pending' : status;

    this.onDeployAlert({
      type: alertType,
      title,
      description,
      content: details?.error || '',
      url: details?.url,
      stage,
      buildStatus: buildStatus as any,
      deployStatus: deployStatus as any,
      source: details?.source || 'netlify',
    });
  }
}
