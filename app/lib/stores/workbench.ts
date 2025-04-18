import { atom, map, type MapStore, type ReadableAtom, type WritableAtom } from 'nanostores';
import type { EditorDocument, ScrollPosition } from '~/components/editor/codemirror/CodeMirrorEditor';
import { ActionRunner } from '~/lib/runtime/action-runner';
import type { ActionCallbackData, ArtifactCallbackData } from '~/lib/runtime/message-parser';
import { webcontainer } from '~/lib/webcontainer';
import type { ITerminal } from '~/types/terminal';
import { unreachable } from '~/utils/unreachable';
import { EditorStore } from './editor';
import { FilesStore, type FileMap } from './files';
import { PreviewsStore } from './previews';
import { TerminalStore } from './terminal';
import JSZip from 'jszip';
import fileSaver from 'file-saver';
import { Octokit, type RestEndpointMethodTypes } from '@octokit/rest';
import { path } from '~/utils/path';
import { extractRelativePath } from '~/utils/diff';
import { description } from '~/lib/persistence';
import Cookies from 'js-cookie';
import { createSampler } from '~/utils/sampler';
import type { ActionAlert, DeployAlert, SupabaseAlert } from '~/types/actions';
import type { Message } from 'ai';
import { toast } from 'react-toastify';

const { saveAs } = fileSaver;

export interface ArtifactState {
  id: string;
  title: string;
  type?: string;
  closed: boolean;
  runner: ActionRunner;
}

export type ArtifactUpdateState = Pick<ArtifactState, 'title' | 'closed'>;

type Artifacts = MapStore<Record<string, ArtifactState>>;

export type WorkbenchViewType = 'code' | 'diff' | 'preview';

export class WorkbenchStore {
  #previewsStore = new PreviewsStore(webcontainer);
  #filesStore = new FilesStore(webcontainer);
  #editorStore = new EditorStore(this.#filesStore);
  #terminalStore = new TerminalStore(webcontainer);
  pendingMessages = atom<Message[]>([]);


  #reloadedMessages = new Set<string>();

  artifacts: Artifacts = import.meta.hot?.data.artifacts ?? map({});

  showWorkbench: WritableAtom<boolean> = import.meta.hot?.data.showWorkbench ?? atom(false);
  currentView: WritableAtom<WorkbenchViewType> = import.meta.hot?.data.currentView ?? atom('code');
  unsavedFiles: WritableAtom<Set<string>> = import.meta.hot?.data.unsavedFiles ?? atom(new Set<string>());
  actionAlert: WritableAtom<ActionAlert | undefined> =
    import.meta.hot?.data.unsavedFiles ?? atom<ActionAlert | undefined>(undefined);
    
  supabaseAlert: WritableAtom<SupabaseAlert | undefined> =
    import.meta.hot?.data.unsavedFiles ?? atom<ActionAlert | undefined>(undefined);
    deployAlert: WritableAtom<DeployAlert | undefined> =
    import.meta.hot?.data.unsavedFiles ?? atom<DeployAlert | undefined>(undefined);
  modifiedFiles = new Set<string>();
  artifactIdList: string[] = [];
  #globalExecutionQueue = Promise.resolve();
  constructor() {
    if (import.meta.hot) {
      import.meta.hot.data.artifacts = this.artifacts;
      import.meta.hot.data.unsavedFiles = this.unsavedFiles;
      import.meta.hot.data.showWorkbench = this.showWorkbench;
      import.meta.hot.data.currentView = this.currentView;
      import.meta.hot.data.actionAlert = this.actionAlert;
      import.meta.hot.data.supabaseAlert = this.supabaseAlert;
      import.meta.hot.data.deployAlert = this.deployAlert;


      // Ensure binary files are properly preserved across hot reloads
      const filesMap = this.files.get();

      for (const [path, dirent] of Object.entries(filesMap)) {
        if (dirent?.type === 'file' && dirent.isBinary && dirent.content) {
          // Make sure binary content is preserved
          this.files.setKey(path, { ...dirent });
        }
      }
    }
  }

  addToExecutionQueue(callback: () => Promise<void>) {
    this.#globalExecutionQueue = this.#globalExecutionQueue.then(() => callback());
  }

  get previews() {
    return this.#previewsStore.previews;
  }

  get files() {
    return this.#filesStore.files;
  }

  get currentDocument(): ReadableAtom<EditorDocument | undefined> {
    return this.#editorStore.currentDocument;
  }

  get selectedFile(): ReadableAtom<string | undefined> {
    return this.#editorStore.selectedFile;
  }

  get firstArtifact(): ArtifactState | undefined {
    return this.#getArtifact(this.artifactIdList[0]);
  }

  get filesCount(): number {
    return this.#filesStore.filesCount;
  }

  get showTerminal() {
    return this.#terminalStore.showTerminal;
  }
  get boltTerminal() {
    return this.#terminalStore.boltTerminal;
  }
  get alert() {
    return this.actionAlert;
  }
  clearAlert() {
    this.actionAlert.set(undefined);
  }

  get SupabaseAlert() {
    return this.supabaseAlert;
  }

  clearSupabaseAlert() {
    this.supabaseAlert.set(undefined);
  }
  get DeployAlert() {
    return this.deployAlert;
  }

  clearDeployAlert() {
    this.deployAlert.set(undefined);
  }
  toggleTerminal(value?: boolean) {
    this.#terminalStore.toggleTerminal(value);
  }

  attachTerminal(terminal: ITerminal) {
    this.#terminalStore.attachTerminal(terminal);
  }
  attachBoltTerminal(terminal: ITerminal) {
    this.#terminalStore.attachBoltTerminal(terminal);
  }

  onTerminalResize(cols: number, rows: number) {
    this.#terminalStore.onTerminalResize(cols, rows);
  }

  setDocuments(files: FileMap) {
    this.#editorStore.setDocuments(files);

    if (this.#filesStore.filesCount > 0 && this.currentDocument.get() === undefined) {
      // we find the first file and select it
      for (const [filePath, dirent] of Object.entries(files)) {
        if (dirent?.type === 'file') {
          this.setSelectedFile(filePath);
          break;
        }
      }
    }
  }

  setShowWorkbench(show: boolean) {
    this.showWorkbench.set(show);
  }

  setCurrentDocumentContent(newContent: string) {
    const filePath = this.currentDocument.get()?.filePath;

    if (!filePath) {
      return;
    }

    const originalContent = this.#filesStore.getFile(filePath)?.content;
    const unsavedChanges = originalContent !== undefined && originalContent !== newContent;

    this.#editorStore.updateFile(filePath, newContent);

    const currentDocument = this.currentDocument.get();

    if (currentDocument) {
      const previousUnsavedFiles = this.unsavedFiles.get();

      if (unsavedChanges && previousUnsavedFiles.has(currentDocument.filePath)) {
        return;
      }

      const newUnsavedFiles = new Set(previousUnsavedFiles);

      if (unsavedChanges) {
        newUnsavedFiles.add(currentDocument.filePath);
      } else {
        newUnsavedFiles.delete(currentDocument.filePath);
      }

      this.unsavedFiles.set(newUnsavedFiles);
    }
  }

  setCurrentDocumentScrollPosition(position: ScrollPosition) {
    const editorDocument = this.currentDocument.get();

    if (!editorDocument) {
      return;
    }

    const { filePath } = editorDocument;

    this.#editorStore.updateScrollPosition(filePath, position);
  }

  setSelectedFile(filePath: string | undefined) {
    this.#editorStore.setSelectedFile(filePath);
  }

  async saveFile(filePath: string) {
    const documents = this.#editorStore.documents.get();
    const document = documents[filePath];

    if (document === undefined) {
      return;
    }

    await this.#filesStore.saveFile(filePath, document.value);

    const newUnsavedFiles = new Set(this.unsavedFiles.get());
    newUnsavedFiles.delete(filePath);

    this.unsavedFiles.set(newUnsavedFiles);
  }

  async saveCurrentDocument() {
    const currentDocument = this.currentDocument.get();

    if (currentDocument === undefined) {
      return;
    }

    await this.saveFile(currentDocument.filePath);
  }

  resetCurrentDocument() {
    const currentDocument = this.currentDocument.get();

    if (currentDocument === undefined) {
      return;
    }

    const { filePath } = currentDocument;
    const file = this.#filesStore.getFile(filePath);

    if (!file) {
      return;
    }

    this.setCurrentDocumentContent(file.content);
  }

  async saveAllFiles() {
    for (const filePath of this.unsavedFiles.get()) {
      await this.saveFile(filePath);
    }
  }

  getFileModifcations() {
    return this.#filesStore.getFileModifications();
  }

  getModifiedFiles() {
    return this.#filesStore.getModifiedFiles();
  }

  resetAllFileModifications() {
    this.#filesStore.resetFileModifications();
  }

  async createFile(filePath: string, content: string | Uint8Array = '') {
    try {
      const success = await this.#filesStore.createFile(filePath, content);

      if (success) {
        this.setSelectedFile(filePath);

        /*
         * For empty files, we need to ensure they're not marked as unsaved
         * Only check for empty string, not empty Uint8Array
         */
        if (typeof content === 'string' && content === '') {
          const newUnsavedFiles = new Set(this.unsavedFiles.get());
          newUnsavedFiles.delete(filePath);
          this.unsavedFiles.set(newUnsavedFiles);
        }
      }

      return success;
    } catch (error) {
      console.error('Failed to create file:', error);
      throw error;
    }
  }

  async createFolder(folderPath: string) {
    try {
      return await this.#filesStore.createFolder(folderPath);
    } catch (error) {
      console.error('Failed to create folder:', error);
      throw error;
    }
  }

  async deleteFile(filePath: string) {
    try {
      const currentDocument = this.currentDocument.get();
      const isCurrentFile = currentDocument?.filePath === filePath;

      const success = await this.#filesStore.deleteFile(filePath);

      if (success) {
        const newUnsavedFiles = new Set(this.unsavedFiles.get());

        if (newUnsavedFiles.has(filePath)) {
          newUnsavedFiles.delete(filePath);
          this.unsavedFiles.set(newUnsavedFiles);
        }

        if (isCurrentFile) {
          const files = this.files.get();
          let nextFile: string | undefined = undefined;

          for (const [path, dirent] of Object.entries(files)) {
            if (dirent?.type === 'file') {
              nextFile = path;
              break;
            }
          }

          this.setSelectedFile(nextFile);
        }
      }

      return success;
    } catch (error) {
      console.error('Failed to delete file:', error);
      throw error;
    }
  }

  async deleteFolder(folderPath: string) {
    try {
      const currentDocument = this.currentDocument.get();
      const isInCurrentFolder = currentDocument?.filePath?.startsWith(folderPath + '/');

      const success = await this.#filesStore.deleteFolder(folderPath);

      if (success) {
        const unsavedFiles = this.unsavedFiles.get();
        const newUnsavedFiles = new Set<string>();

        for (const file of unsavedFiles) {
          if (!file.startsWith(folderPath + '/')) {
            newUnsavedFiles.add(file);
          }
        }

        if (newUnsavedFiles.size !== unsavedFiles.size) {
          this.unsavedFiles.set(newUnsavedFiles);
        }

        if (isInCurrentFolder) {
          const files = this.files.get();
          let nextFile: string | undefined = undefined;

          for (const [path, dirent] of Object.entries(files)) {
            if (dirent?.type === 'file') {
              nextFile = path;
              break;
            }
          }

          this.setSelectedFile(nextFile);
        }
      }

      return success;
    } catch (error) {
      console.error('Failed to delete folder:', error);
      throw error;
    }
  }

  abortAllActions() {
    // TODO: what do we wanna do and how do we wanna recover from this?
  }

  /**
   * Ajoute un fichier à la liste des fichiers ciblés dans le textarea du chat.
   * @param filePath - Le chemin du fichier à ajouter
   * @param textareaElement - L'élément textarea du chat
   * @returns true si le fichier a été ajouté, false sinon (déjà présent ou erreur)
   */
  addTargetedFile(filePath: string, textareaElement: HTMLTextAreaElement | null): boolean {
    try {
      if (!textareaElement) {
        console.error('Textarea element not found');
        return false;
      }

      // Lire la valeur actuelle
      let currentFiles: string[] = [];
      const currentValue = textareaElement.getAttribute('data-targeted-files');

      if (currentValue) {
        try {
          currentFiles = JSON.parse(currentValue);
          if (!Array.isArray(currentFiles)) {
            currentFiles = [];
          }
        } catch (e) {
          console.error('Error parsing data-targeted-files:', e);
          currentFiles = [];
        }
      }

      // Vérifier si le fichier est déjà présent
      if (currentFiles.includes(filePath)) {
        return false;
      }

      // Ajouter le nouveau fichier
      currentFiles.push(filePath);

      // Mettre à jour l'attribut
      textareaElement.setAttribute('data-targeted-files', JSON.stringify(currentFiles));
      return true;
    } catch (error) {
      console.error('Error in addTargetedFile:', error);
      return false;
    }
  }

  /**
   * Supprime un fichier de la liste des fichiers ciblés dans le textarea du chat.
   * @param filePath - Le chemin du fichier à supprimer
   * @param textareaElement - L'élément textarea du chat
   * @returns true si le fichier a été supprimé, false sinon
   */
  removeTargetedFile(filePath: string, textareaElement: HTMLTextAreaElement | null): boolean {
    try {
      if (!textareaElement) {
        console.error('Textarea element not found');
        return false;
      }

      // Lire la valeur actuelle
      let currentFiles: string[] = [];
      const currentValue = textareaElement.getAttribute('data-targeted-files');

      if (currentValue) {
        try {
          currentFiles = JSON.parse(currentValue);
          if (!Array.isArray(currentFiles)) {
            currentFiles = [];
          }
        } catch (e) {
          console.error('Error parsing data-targeted-files:', e);
          return false;
        }
      }

      // Supprimer le fichier
      const index = currentFiles.indexOf(filePath);
      if (index === -1) {
        return false;
      }

      currentFiles.splice(index, 1);

      // Mettre à jour l'attribut
      textareaElement.setAttribute('data-targeted-files', JSON.stringify(currentFiles));
      return true;
    } catch (error) {
      console.error('Error in removeTargetedFile:', error);
      return false;
    }
  }

  /**
   * Récupère la liste des fichiers ciblés depuis le textarea du chat.
   * @returns Un tableau contenant les chemins des fichiers ciblés
   */
  getTargetedFilesFromDOM(): string[] {
    try {
      const textarea = document.querySelector('textarea[data-targeted-files]');
      if (!textarea) {
        return [];
      }

      const filesAttr = textarea.getAttribute('data-targeted-files');
      if (!filesAttr) {
        return [];
      }

      try {
        const files = JSON.parse(filesAttr);
        return Array.isArray(files) ? files : [];
      } catch (e) {
        console.error('Error parsing data-targeted-files:', e);
        return [];
      }
    } catch (error) {
      console.error('Error in getTargetedFilesFromDOM:', error);
      return [];
    }
  }

  /**
   * Vérifie si un fichier est ciblé dans le textarea du chat.
   * @param filePath - Le chemin du fichier à vérifier
   * @returns true si le fichier est ciblé, false sinon
   */
  isTargetedFile(filePath: string): boolean {
    const targetedFiles = this.getTargetedFilesFromDOM();
    return targetedFiles.includes(filePath);
  }

  /**
   * Gère l'upload d'un fichier via une boîte de dialogue de sélection de fichier
   * @param targetPath - Le chemin cible où le fichier sera créé
   * @param allowMultiple - Autoriser l'upload de plusieurs fichiers
   */
  handleFileUpload(targetPath: string, allowMultiple: boolean = false): void {
    const ALLOWED_FILE_EXTENSIONS = [
      '.ts', '.tsx',
      '.js', '.jsx',
      '.json',
      '.html',
      '.css',
      '.py',
      '.php',
      '.java',
      '.c', '.cpp', '.cs',
      '.go',
      '.rb',
      '.rs',
      '.txt'
    ];
    
    const isFileAllowed = (fileName: string): boolean => {
      const extension = path.extname(fileName).toLowerCase();
      return ALLOWED_FILE_EXTENSIONS.includes(extension);
    };
    
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = allowMultiple;
    input.accept = ALLOWED_FILE_EXTENSIONS.join(',');
    
    input.onchange = async (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (!files) return;
  
      for (const file of Array.from(files)) {
        if (!isFileAllowed(file.name)) {
          toast.error(`Type de fichier non autorisé : ${file.name}`);
          continue;
        }
  
        try {
          const filePath = path.join(targetPath, file.name);
  
          const arrayBuffer = await file.arrayBuffer();
          const binaryContent = new Uint8Array(arrayBuffer);
  
          const success = await this.createFile(filePath, binaryContent);
  
          if (success) {
            toast.success(`Fichier ${file.name} téléchargé avec succès`);
            const textarea = document.querySelector('textarea[data-targeted-files]');
            if (textarea) {
              const targetSuccess = this.addTargetedFile(filePath, textarea as HTMLTextAreaElement);
              if (targetSuccess) {
                toast.success(`Fichier ciblé : ${file.name}`);
                (textarea as HTMLTextAreaElement).focus();
              }
            }
          } else {
            toast.error(`Échec du téléchargement du fichier ${file.name}`);
          }
        } catch (error) {
          toast.error(`Erreur lors du téléchargement de ${file.name}`);
          console.error(error);
        }
      }
    };
  
    input.click();
  }

  /**
   * Gère le drop de fichiers sur un élément
   * @param e - L'événement de drop
   * @param targetPath - Le chemin cible où le fichier sera créé
   * @param allowMultiple - Autoriser l'upload de plusieurs fichiers
   * @returns Promise<void>
   */
  async handleFileDrop(e: DragEvent, targetPath: string, allowMultiple: boolean = false): Promise<void> {
    e.preventDefault();
    e.stopPropagation();

    const ALLOWED_FILE_EXTENSIONS = [
      '.ts', '.tsx',
      '.js', '.jsx',
      '.json',
      '.html',
      '.css',
      '.py',
      '.php',
      '.java',
      '.c', '.cpp', '.cs',
      '.go',
      '.rb',
      '.rs',
      '.txt'
    ];
    
    const isFileAllowed = (fileName: string): boolean => {
      const extension = path.extname(fileName).toLowerCase();
      return ALLOWED_FILE_EXTENSIONS.includes(extension);
    };

    const items = Array.from(e.dataTransfer?.items || []);
    const files = items.filter((item) => item.kind === 'file');
    
    if (!allowMultiple && files.length > 1) {
      toast.error('Veuillez déposer un seul fichier à la fois');
      return;
    }

    for (const item of files) {
      const file = item.getAsFile();

      if (file) {
        if (!isFileAllowed(file.name)) {
          toast.error(`Type de fichier non autorisé : ${file.name}`);
          continue;
        }

        try {
          const filePath = path.join(targetPath, file.name);

          const arrayBuffer = await file.arrayBuffer();
          const binaryContent = new Uint8Array(arrayBuffer);

          const success = await this.createFile(filePath, binaryContent);

          if (success) {
            toast.success(`Fichier ${file.name} téléchargé avec succès`);
            const textarea = document.querySelector('textarea[data-targeted-files]');
            if (textarea) {
              const targetSuccess = this.addTargetedFile(filePath, textarea as HTMLTextAreaElement);
              if (targetSuccess) {
                toast.success(`Fichier ciblé : ${file.name}`);
                (textarea as HTMLTextAreaElement).focus();
              }
            }
          } else {
            toast.error(`Échec du téléchargement du fichier ${file.name}`);
          }
        } catch (error) {
          toast.error(`Erreur lors du téléchargement de ${file.name}`);
          console.error(error);
        }
      }
    }
  }

  setReloadedMessages(messages: string[]) {
    this.#reloadedMessages = new Set(messages);
  }

  addArtifact({ messageId, title, id, type }: ArtifactCallbackData) {
    const artifact = this.#getArtifact(messageId);

    if (artifact) {
      return;
    }

    if (!this.artifactIdList.includes(messageId)) {
      this.artifactIdList.push(messageId);
    }

    this.artifacts.setKey(messageId, {
      id,
      title,
      closed: false,
      type,
      runner: new ActionRunner(
        webcontainer,
        () => this.boltTerminal,
        (alert) => {
          if (this.#reloadedMessages.has(messageId)) {
            return;
          }

          this.actionAlert.set(alert);
        },
        (alert) => {
          if (this.#reloadedMessages.has(messageId)) {
            return;
          }

          this.supabaseAlert.set(alert);
        },
        (alert) => {
          if (this.#reloadedMessages.has(messageId)) {
            return;
          }

          this.deployAlert.set(alert);
        },
      ),
    });
  }

  updateArtifact({ messageId }: ArtifactCallbackData, state: Partial<ArtifactUpdateState>) {
    const artifact = this.#getArtifact(messageId);

    if (!artifact) {
      return;
    }

    this.artifacts.setKey(messageId, { ...artifact, ...state });
  }
  addAction(data: ActionCallbackData) {
    // this._addAction(data);

    this.addToExecutionQueue(() => this._addAction(data));
  }
  async _addAction(data: ActionCallbackData) {
    const { messageId } = data;

    const artifact = this.#getArtifact(messageId);

    if (!artifact) {
      unreachable('Artifact not found');
    }

    return artifact.runner.addAction(data);
  }

  runAction(data: ActionCallbackData, isStreaming: boolean = false) {
    if (isStreaming) {
      this.actionStreamSampler(data, isStreaming);
    } else {
      this.addToExecutionQueue(() => this._runAction(data, isStreaming));
    }
  }
  async _runAction(data: ActionCallbackData, isStreaming: boolean = false) {
    const { messageId } = data;

    const artifact = this.#getArtifact(messageId);

    if (!artifact) {
      unreachable('Artifact not found');
    }

    const action = artifact.runner.actions.get()[data.actionId];

    if (!action || action.executed) {
      return;
    }

    if (data.action.type === 'file') {
      const wc = await webcontainer;
      const fullPath = path.join(wc.workdir, data.action.filePath);

      if (this.selectedFile.value !== fullPath) {
        this.setSelectedFile(fullPath);
      }

      if (this.currentView.value !== 'code') {
        this.currentView.set('code');
      }

      const doc = this.#editorStore.documents.get()[fullPath];

      if (!doc) {
        await artifact.runner.runAction(data, isStreaming);
      }

      this.#editorStore.updateFile(fullPath, data.action.content);
      if (!isStreaming && data.action.content) {
        await this.saveFile(fullPath);
      }
      if (!isStreaming) {
        await artifact.runner.runAction(data);
        this.resetAllFileModifications();
      }
    } else {
      await artifact.runner.runAction(data);
    }
  }

  actionStreamSampler = createSampler(async (data: ActionCallbackData, isStreaming: boolean = false) => {
    return await this._runAction(data, isStreaming);
  }, 100); // TODO: remove this magic number to have it configurable

  #getArtifact(id: string) {
    const artifacts = this.artifacts.get();
    return artifacts[id];
  }

  async downloadZip() {
    const zip = new JSZip();
    const files = this.files.get();

    // Get the project name from the description input, or use a default name
    const projectName = (description.value ?? 'project').toLocaleLowerCase().split(' ').join('_');

    // Generate a simple 6-character hash based on the current timestamp
    const timestampHash = Date.now().toString(36).slice(-6);
    const uniqueProjectName = `${projectName}_${timestampHash}`;

    for (const [filePath, dirent] of Object.entries(files)) {
      if (dirent?.type === 'file' && !dirent.isBinary) {
        const relativePath = extractRelativePath(filePath);

        // split the path into segments
        const pathSegments = relativePath.split('/');

        // if there's more than one segment, we need to create folders
        if (pathSegments.length > 1) {
          let currentFolder = zip;

          for (let i = 0; i < pathSegments.length - 1; i++) {
            currentFolder = currentFolder.folder(pathSegments[i])!;
          }
          currentFolder.file(pathSegments[pathSegments.length - 1], dirent.content);
        } else {
          // if there's only one segment, it's a file in the root
          zip.file(relativePath, dirent.content);
        }
      }
    }

    // Generate the zip file and save it
    const content = await zip.generateAsync({ type: 'blob' });
    saveAs(content, `${uniqueProjectName}.zip`);
  }

  async syncFiles(targetHandle: FileSystemDirectoryHandle) {
    const files = this.files.get();
    const syncedFiles = [];

    for (const [filePath, dirent] of Object.entries(files)) {
      if (dirent?.type === 'file' && !dirent.isBinary) {
        const relativePath = extractRelativePath(filePath);
        const pathSegments = relativePath.split('/');
        let currentHandle = targetHandle;

        for (let i = 0; i < pathSegments.length - 1; i++) {
          currentHandle = await currentHandle.getDirectoryHandle(pathSegments[i], { create: true });
        }

        // create or get the file
        const fileHandle = await currentHandle.getFileHandle(pathSegments[pathSegments.length - 1], {
          create: true,
        });

        // write the file content
        const writable = await fileHandle.createWritable();
        await writable.write(dirent.content);
        await writable.close();

        syncedFiles.push(relativePath);
      }
    }

    return syncedFiles;
  }

  async pushToGitHub(
    repoName: string,
    commitMessage?: string,
    githubUsername?: string,
    ghToken?: string,
    isPrivate: boolean = false,
  ) {
        try {
      // Use cookies if username and token are not provided
      const githubToken = ghToken || Cookies.get('githubToken');
      const owner = githubUsername || Cookies.get('githubUsername');

      if (!githubToken || !owner) {
        throw new Error('GitHub token or username is not set in cookies or provided.');
      }
       // Log the isPrivate flag to verify it's being properly passed
       console.log(`pushToGitHub called with isPrivate=${isPrivate}`);

      // Initialize Octokit with the auth token
      const octokit = new Octokit({ auth: githubToken });

      // Check if the repository already exists before creating it
      let repo: RestEndpointMethodTypes['repos']['get']['response']['data'];
      let visibilityJustChanged = false;

      try {
        const resp = await octokit.repos.get({ owner, repo: repoName });
        repo = resp.data;
        console.log('Repository already exists, using existing repo');

        // Check if we need to update visibility of existing repo
        if (repo.private !== isPrivate) {
          console.log(
            `Updating repository visibility from ${repo.private ? 'private' : 'public'} to ${isPrivate ? 'private' : 'public'}`,
          );

          try {
            // Update repository visibility using the update method
            const { data: updatedRepo } = await octokit.repos.update({
              owner,
              repo: repoName,
              private: isPrivate,
            });

            console.log('Repository visibility updated successfully');
            repo = updatedRepo;
            visibilityJustChanged = true;

            // Add a delay after changing visibility to allow GitHub to fully process the change
            console.log('Waiting for visibility change to propagate...');
            await new Promise((resolve) => setTimeout(resolve, 3000)); // 3 second delay
          } catch (visibilityError) {
            console.error('Failed to update repository visibility:', visibilityError);

            // Continue with push even if visibility update fails
          }
        }
      } catch (error) {
        if (error instanceof Error && 'status' in error && error.status === 404) {
          // Repository doesn't exist, so create a new one
          console.log(`Creating new repository with private=${isPrivate}`);

          // Create new repository with specified privacy setting
          const createRepoOptions = {            
            name: repoName,
            private: isPrivate,            
            auto_init: true,
          };

          console.log('Create repo options:', createRepoOptions);

          const { data: newRepo } = await octokit.repos.createForAuthenticatedUser(createRepoOptions);

          console.log('Repository created:', newRepo.html_url, 'Private:', newRepo.private);
          repo = newRepo;
           // Add a small delay after creating a repository to allow GitHub to fully initialize it
           console.log('Waiting for repository to initialize...');
           await new Promise((resolve) => setTimeout(resolve, 2000)); // 2 second delay
        } else {
          console.error('Cannot create repo:', error);          
          throw error; // Some other error occurred
        }
      }

      // Get all files
      const files = this.files.get();

      if (!files || Object.keys(files).length === 0) {
        throw new Error('No files found to push');
      }

      // Function to push files with retry logic
      const pushFilesToRepo = async (attempt = 1): Promise<string> => {
        const maxAttempts = 3;

        try {
          console.log(`Pushing files to repository (attempt ${attempt}/${maxAttempts})...`);

          // Create blobs for each file
          const blobs = await Promise.all(
            Object.entries(files).map(async ([filePath, dirent]) => {
              if (dirent?.type === 'file' && dirent.content) {
                const { data: blob } = await octokit.git.createBlob({
                  owner: repo.owner.login,
                  repo: repo.name,
                  content: Buffer.from(dirent.content).toString('base64'),
                  encoding: 'base64',
                });
                return { path: extractRelativePath(filePath), sha: blob.sha };
              }

              return null;
            }),
          );

          const validBlobs = blobs.filter(Boolean); // Filter out any undefined blobs

          if (validBlobs.length === 0) {
            throw new Error('No valid files to push');
          }

         // Refresh repository reference to ensure we have the latest data
         const repoRefresh = await octokit.repos.get({ owner, repo: repoName });
         repo = repoRefresh.data;

 // Get the latest commit SHA (assuming main branch, update dynamically if needed)
 const { data: ref } = await octokit.git.getRef({
  owner: repo.owner.login,
  repo: repo.name,
  ref: `heads/${repo.default_branch || 'main'}`, // Handle dynamic branch
});
const latestCommitSha = ref.object.sha;

// Create a new tree
const { data: newTree } = await octokit.git.createTree({
  owner: repo.owner.login,
  repo: repo.name,
  base_tree: latestCommitSha,
  tree: validBlobs.map((blob) => ({
    path: blob!.path,
    mode: '100644',
    type: 'blob',
    sha: blob!.sha,
  })),
});
       // Create a new commit
       const { data: newCommit } = await octokit.git.createCommit({
        owner: repo.owner.login,
        repo: repo.name,
        message: commitMessage || 'Initial commit from your app',
        tree: newTree.sha,
        parents: [latestCommitSha],
      });

      // Update the reference
      await octokit.git.updateRef({
        owner: repo.owner.login,
        repo: repo.name,
        ref: `heads/${repo.default_branch || 'main'}`, // Handle dynamic branch
        sha: newCommit.sha,
      });

      console.log('Files successfully pushed to repository');

      return repo.html_url;
    } catch (error) {
      console.error(`Error during push attempt ${attempt}:`, error);

      // If we've just changed visibility and this is not our last attempt, wait and retry
      if ((visibilityJustChanged || attempt === 1) && attempt < maxAttempts) {
        const delayMs = attempt * 2000; // Increasing delay with each attempt
        console.log(`Waiting ${delayMs}ms before retry...`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));

        return pushFilesToRepo(attempt + 1);
      }

      throw error; // Rethrow if we're out of attempts
    }
  };

  // Execute the push function with retry logic
  const repoUrl = await pushFilesToRepo();

        // Return the repository URL
        return repoUrl;
    } catch (error) {
      console.error('Error pushing to GitHub:', error);
      throw error; // Rethrow the error for further handling
    }
  }
  
  addCommandsMessage(userMessage: any, commandsMessage: any) {
    try {
      /*
       * Instead of trying to use the hook directly, we'll store these messages
       * to be processed by a React component that properly uses the hook
       */
      if (commandsMessage) {
        const messagesStore = atom<Message[]>([userMessage, commandsMessage]);
        this.pendingMessages.set(messagesStore.get());
      } else {
        const messagesStore = atom<Message[]>([userMessage]);
        this.pendingMessages.set(messagesStore.get());
      }
    } catch (error) {
      console.error('Error adding command messages:', error);
    }
  }

  getArtifact(messageId: string) {
    return this.#getArtifact(messageId);
  }

  registerArtifact(messageId: string, artifact: any) {
    const artifacts = this.artifacts.get();
    artifacts[messageId] = artifact;
    this.artifacts.set(artifacts);
  }
}

export const workbenchStore = new WorkbenchStore();
