import { generateText, type CoreTool, type GenerateTextResult, type Message } from 'ai';
import ignore from 'ignore';
import type { IProviderSetting } from '~/types/model';
import { IGNORE_PATTERNS, type FileMap } from './constants';
import { DEFAULT_MODEL, DEFAULT_PROVIDER, PROVIDER_LIST } from '~/utils/constants';
import { createFilesContext, extractCurrentContext, extractPropertiesFromMessage, simplifyBoltActions } from './utils';
import { createScopedLogger } from '~/utils/logger';
import { LLMManager } from '~/lib/modules/llm/manager';
import { enhancedContextCache } from './enhanced-context-cache';

// Common patterns to ignore, similar to .gitignore

const ig = ignore().add(IGNORE_PATTERNS);
const logger = createScopedLogger('select-context');

export async function selectContext(props: {
  messages: Message[];
  env?: Env;
  apiKeys?: Record<string, string>;
  files: FileMap;
  providerSettings?: Record<string, IProviderSetting>;
  promptId?: string;
  contextOptimization?: boolean;
  summary: string;
  onFinish?: (resp: GenerateTextResult<Record<string, CoreTool<any, any>>, never>) => void;
  useCache?: boolean;
}) {
  const { messages, env: serverEnv, apiKeys, files, providerSettings, summary, onFinish, useCache = true } = props;
  
  // Vérifier si on peut utiliser le cache
  if (useCache) {
    // Générer une clé de cache basée sur les messages et les fichiers disponibles
    const filePaths = getFilePaths(files || {});
    const messageIds = messages.map(m => m.id);
    const cacheKey = enhancedContextCache.generateCacheKey({
      promptId: props.promptId,
      messageIds,
      filePaths,
    });
    
    // Essayer de récupérer le contexte depuis le cache
    const cachedContext = enhancedContextCache.get(cacheKey);
    if (cachedContext) {
      logger.info('Contexte récupéré depuis le cache');
      return cachedContext.contextFiles;
    }
  }
  let currentModel = DEFAULT_MODEL;
  let currentProvider = DEFAULT_PROVIDER.name;
  const processedMessages = messages.map((message) => {
    if (message.role === 'user') {
      const { model, provider, content } = extractPropertiesFromMessage(message);
      currentModel = model;
      currentProvider = provider;

      return { ...message, content };
    } else if (message.role == 'assistant') {
      let content = message.content;

      content = simplifyBoltActions(content);

      content = content.replace(/<div class=\\"__boltThought__\\">.*?<\/div>/s, '');
      content = content.replace(/<think>.*?<\/think>/s, '');

      return { ...message, content };
    }

    return message;
  });

  const provider = PROVIDER_LIST.find((p) => p.name === currentProvider) || DEFAULT_PROVIDER;
  const staticModels = LLMManager.getInstance().getStaticModelListFromProvider(provider);
  let modelDetails = staticModels.find((m) => m.name === currentModel);

  if (!modelDetails) {
    const modelsList = [
      ...(provider.staticModels || []),
      ...(await LLMManager.getInstance().getModelListFromProvider(provider, {
        apiKeys,
        providerSettings,
        serverEnv: serverEnv as any,
      })),
    ];

    if (!modelsList.length) {
      throw new Error(`No models found for provider ${provider.name}`);
    }

    modelDetails = modelsList.find((m) => m.name === currentModel);

    if (!modelDetails) {
      // Fallback to first model
      logger.warn(
        `MODEL [${currentModel}] not found in provider [${provider.name}]. Falling back to first model. ${modelsList[0].name}`,
      );
      modelDetails = modelsList[0];
    }
  }

  const { codeContext } = extractCurrentContext(processedMessages);

  let filePaths = getFilePaths(files || {});
  filePaths = filePaths.filter((x) => {
    const relPath = x.replace('/home/project/', '');
    return !ig.ignores(relPath);
  });

  let context = '';
  const currrentFiles: string[] = [];
  const contextFiles: FileMap = {};

  if (codeContext?.type === 'codeContext') {
    const codeContextFiles: string[] = codeContext.files;
    Object.keys(files || {}).forEach((path) => {
      let relativePath = path;

      if (path.startsWith('/home/project/')) {
        relativePath = path.replace('/home/project/', '');
      }

      if (codeContextFiles.includes(relativePath)) {
        contextFiles[relativePath] = files[path];
        currrentFiles.push(relativePath);
      }
    });
    context = createFilesContext(contextFiles);
  }

  const summaryText = `Here is the summary of the chat till now: ${summary}`;

  const extractTextContent = (message: Message) =>
    Array.isArray(message.content)
      ? (message.content.find((item) => item.type === 'text')?.text as string) || ''
      : message.content;

  const lastUserMessage = processedMessages.filter((x) => x.role == 'user').pop();

  if (!lastUserMessage) {
    throw new Error('No user message found');
  }

  // select files from the list of code file from the project that might be useful for the current request from the user
  // Ajouter un message d'information sur le nombre de fichiers disponibles
  logger.info(`Nombre total de fichiers disponibles: ${filePaths.length}`);
  
  const resp = await generateText({
    system: `
        You are a software engineer. You are working on a project. You have access to the following files:

        AVAILABLE FILES PATHS
        ---
        ${filePaths.map((path) => `- ${path}`).join('\n')}
        ---

        You have following code loaded in the context buffer that you can refer to:

        CURRENT CONTEXT BUFFER
        ---
        ${context}
        ---

        Now, you are given a task. You need to select the files that are relevant to the task from the list of files above.

        RESPONSE FORMAT:
        your response should be in following format:
---
<updateContextBuffer>
    <includeFile path="path/to/file"/>
    <excludeFile path="path/to/file"/>
</updateContextBuffer>
---
        * Your should start with <updateContextBuffer> and end with </updateContextBuffer>.
        * You can include multiple <includeFile> and <excludeFile> tags in the response.
        * You should not include any other text in the response.
        * You should not include any file that is not in the list of files above.
        * You should not include any file that is already in the context buffer.
        * If no changes are needed, you can leave the response empty updateContextBuffer tag.
        `,
    prompt: `
        ${summaryText}

        Users Question: ${extractTextContent(lastUserMessage)}

        update the context buffer with the files that are relevant to the task from the list of files above.

        CRITICAL RULES:
        * Only include relevant files in the context buffer.
        * IMPORTANT: context buffer should ONLY include files that are in the AVAILABLE FILES PATHS list above.
        * DO NOT include files like package.json, vite.config.ts, tsconfig.json unless they are explicitly listed in AVAILABLE FILES PATHS.
        * context buffer is extremely expensive, so only include files that are absolutely necessary.
        * If no changes are needed, you can leave the response empty updateContextBuffer tag.
        * Only 5 files can be placed in the context buffer at a time.
        * if the buffer is full, you need to exclude files that is not needed and include files that are relevant.

        `,
    model: provider.getModelInstance({
      model: currentModel,
      serverEnv,
      apiKeys,
      providerSettings,
    }),
  });

  const response = resp.text;
  const updateContextBuffer = response.match(/<updateContextBuffer>([\s\S]*?)<\/updateContextBuffer>/);

  if (!updateContextBuffer) {
    throw new Error('Invalid response. Please follow the response format');
  }

  const includeFiles =
    updateContextBuffer[1]
      .match(/<includeFile path="([^"]*)"[/]?>/gm)
      ?.map((x) => x.replace('<includeFile path="', '').replace('"', '').replace('/>', '')) || [];
  const excludeFiles =
    updateContextBuffer[1]
      .match(/<excludeFile path="([^"]*)"[/]?>/gm)
      ?.map((x) => x.replace('<excludeFile path="', '').replace('"', '').replace('/>', '')) || [];

  const filteredFiles: FileMap = {};
  excludeFiles.forEach((path) => {
    delete contextFiles[path];
  });
  // Garder une trace des fichiers valides et invalides pour le logging
  const validFiles: string[] = [];
  const invalidFiles: string[] = [];
  
  includeFiles.forEach((path) => {
    let fullPath = path;

    if (!path.startsWith('/home/project/')) {
      fullPath = `/home/project/${path}`;
    }

    // Vérifier si le fichier existe dans la liste des fichiers disponibles
    if (!filePaths.includes(fullPath)) {
      logger.error(`File ${path} is not in the list of files above.`);
      invalidFiles.push(path);
      return;
    }

    if (currrentFiles.includes(path)) {
      return;
    }

    filteredFiles[path] = files[fullPath];
    validFiles.push(path);
  });
  
  // Journaliser un résumé des fichiers traités
  if (validFiles.length > 0) {
    logger.info(`Fichiers valides sélectionnés: ${validFiles.length}`);
  }
  if (invalidFiles.length > 0) {
    logger.warn(`Fichiers invalides ignorés: ${invalidFiles.length}`);
  }
  
  // Si aucun fichier n'a été sélectionné, essayer de sélectionner au moins un fichier pertinent
  if (Object.keys(filteredFiles).length === 0) {
    logger.warn('Aucun fichier sélectionné, tentative de sélection de secours');
    
    // Essayer de trouver des fichiers pertinents basés sur des mots-clés de la question de l'utilisateur
    const userQuestion = extractTextContent(lastUserMessage).toLowerCase();
    const relevantKeywords = [
      { keyword: 'react', extensions: ['.jsx', '.tsx', '.js', '.ts'] },
      { keyword: 'vue', extensions: ['.vue', '.js', '.ts'] },
      { keyword: 'angular', extensions: ['.ts', '.html'] },
      { keyword: 'node', extensions: ['.js', '.ts'] },
      { keyword: 'express', extensions: ['.js', '.ts'] },
      { keyword: 'api', extensions: ['.js', '.ts', '.py'] },
      { keyword: 'component', extensions: ['.jsx', '.tsx', '.vue', '.svelte'] },
      { keyword: 'style', extensions: ['.css', '.scss', '.less'] },
      { keyword: 'test', extensions: ['.spec.ts', '.test.js', '.spec.js'] },
      { keyword: 'database', extensions: ['.sql', '.prisma', '.js', '.ts'] },
    ];
    
    // Chercher des fichiers pertinents basés sur les mots-clés
    let foundRelevantFile = false;
    for (const { keyword, extensions } of relevantKeywords) {
      if (userQuestion.includes(keyword)) {
        // Chercher des fichiers avec les extensions correspondantes
        for (const path of filePaths) {
          const relativePath = path.replace('/home/project/', '');
          if (extensions.some(ext => relativePath.endsWith(ext))) {
            filteredFiles[relativePath] = files[path];
            logger.info(`Fichier pertinent sélectionné basé sur le mot-clé '${keyword}': ${relativePath}`);
            foundRelevantFile = true;
            break;
          }
        }
        if (foundRelevantFile) break;
      }
    }
    
    // Si aucun fichier pertinent n'a été trouvé, sélectionner le premier fichier disponible
    if (!foundRelevantFile && filePaths.length > 0) {
      const backupPath = filePaths[0].replace('/home/project/', '');
      filteredFiles[backupPath] = files[filePaths[0]];
      logger.info(`Fichier de secours sélectionné: ${backupPath}`);
    }
  }

  if (onFinish) {
    onFinish(resp);
  }

  const totalFiles = Object.keys(filteredFiles).length;
  logger.info(`Total files: ${totalFiles}`);

  if (totalFiles == 0) {
    logger.warn('Aucun fichier sélectionné après le traitement, utilisation du cache désactivée');
    // Au lieu de lancer une erreur, on continue avec un ensemble vide de fichiers
    // Le système pourra fonctionner avec un contexte minimal plutôt que d'échouer complètement
    return {};
  }

  // Mettre en cache le contexte si l'option est activée
  if (useCache) {
    const filePaths = getFilePaths(files || {});
    const messageIds = messages.map(m => m.id);
    const cacheKey = enhancedContextCache.generateCacheKey({
      promptId: props.promptId,
      messageIds,
      filePaths,
    });
    
    // Stocker le contexte dans le cache
    enhancedContextCache.set(cacheKey, {
      contextFiles: filteredFiles,
      summary,
    });
    logger.info('Contexte mis en cache');
  }

  return filteredFiles;

  // generateText({
}

export function getFilePaths(files: FileMap) {
  let filePaths = Object.keys(files);
  filePaths = filePaths.filter((x) => {
    const relPath = x.replace('/home/project/', '');
    return !ig.ignores(relPath);
  });

  return filePaths;
}
