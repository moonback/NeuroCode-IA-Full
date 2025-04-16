import { type Message } from 'ai';
import { DEFAULT_MODEL, DEFAULT_PROVIDER, MODEL_REGEX, PROVIDER_REGEX } from '~/utils/constants';
import { IGNORE_PATTERNS, type FileMap } from './constants';
import ignore from 'ignore';
import type { ContextAnnotation } from '~/types/context';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('file-relevance-scorer');

class FileRelevanceScorer {
  private static instance: FileRelevanceScorer;
  private mentionFrequency: Map<string, number>;
  private dependencyGraph: Map<string, Set<string>>;

  private constructor() {
    this.mentionFrequency = new Map();
    this.dependencyGraph = new Map();
  }

  public static getInstance(): FileRelevanceScorer {
    if (!FileRelevanceScorer.instance) {
      FileRelevanceScorer.instance = new FileRelevanceScorer();
    }
    return FileRelevanceScorer.instance;
  }

  public updateMentionFrequency(filePath: string): void {
    const count = this.mentionFrequency.get(filePath) || 0;
    this.mentionFrequency.set(filePath, count + 1);
  }

  public addDependency(source: string, target: string): void {
    if (!this.dependencyGraph.has(source)) {
      this.dependencyGraph.set(source, new Set());
    }
    this.dependencyGraph.get(source)?.add(target);
  }

  public scoreFile(filePath: string, query: string, files: FileMap): number {
    const mentionScore = this.getMentionScore(filePath);
    const dependencyScore = this.getDependencyScore(filePath);
    const contentRelevanceScore = this.getContentRelevanceScore(filePath, query, files);

    return (
      mentionScore * 0.3 +
      dependencyScore * 0.3 +
      contentRelevanceScore * 0.4
    );
  }

  private getMentionScore(filePath: string): number {
    const count = this.mentionFrequency.get(filePath) || 0;
    const maxCount = Math.max(...Array.from(this.mentionFrequency.values()));
    return maxCount > 0 ? count / maxCount : 0;
  }

  private getDependencyScore(filePath: string): number {
    const dependencies = this.dependencyGraph.get(filePath);
    if (!dependencies) return 0;
    return Math.min(dependencies.size / 10, 1); // Normalize to 0-1
  }

  private getContentRelevanceScore(filePath: string, query: string, files: FileMap): number {
    const file = files[filePath];
    if (!file || file.type !== 'file' || !file.content) return 0;

    const content = file.content.toLowerCase();
    const queryTerms = query.toLowerCase().split(/\s+/);
    
    let matchCount = 0;
    for (const term of queryTerms) {
      if (content.includes(term)) matchCount++;
    }

    return matchCount / queryTerms.length;
  }

  public reset(): void {
    this.mentionFrequency.clear();
    this.dependencyGraph.clear();
  }
}

export const fileRelevanceScorer = FileRelevanceScorer.getInstance();

export function extractPropertiesFromMessage(message: Omit<Message, 'id'>): {
  model: string;
  provider: string;
  content: string;
} {
  const textContent = Array.isArray(message.content)
    ? message.content.find((item) => item.type === 'text')?.text || ''
    : message.content;

  const modelMatch = textContent.match(MODEL_REGEX);
  const providerMatch = textContent.match(PROVIDER_REGEX);

  /*
   * Extract model
   * const modelMatch = message.content.match(MODEL_REGEX);
   */
  const model = modelMatch ? modelMatch[1] : DEFAULT_MODEL;

  /*
   * Extract provider
   * const providerMatch = message.content.match(PROVIDER_REGEX);
   */
  const provider = providerMatch ? providerMatch[1] : DEFAULT_PROVIDER.name;

  const cleanedContent = Array.isArray(message.content)
    ? message.content.map((item) => {
        if (item.type === 'text') {
          return {
            type: 'text',
            text: item.text?.replace(MODEL_REGEX, '').replace(PROVIDER_REGEX, ''),
          };
        }

        return item; // Preserve image_url and other types as is
      })
    : textContent.replace(MODEL_REGEX, '').replace(PROVIDER_REGEX, '');

  return { model, provider, content: cleanedContent };
}

export function simplifyBoltActions(input: string): string {
  // Using regex to match boltAction tags that have type="file"
  const regex = /(<boltAction[^>]*type="file"[^>]*>)([\s\S]*?)(<\/boltAction>)/g;

  // Replace each matching occurrence
  return input.replace(regex, (_0, openingTag, _2, closingTag) => {
    return `${openingTag}\n          ...\n        ${closingTag}`;
  });
}

export function createFilesContext(files: FileMap, useRelativePath?: boolean, query?: string) {
  const ig = ignore().add(IGNORE_PATTERNS);
  let filePaths = Object.keys(files);
  filePaths = filePaths.filter((x) => {
    const relPath = x.replace('/home/project/', '');
    return !ig.ignores(relPath);
  });

  // Score and sort files by relevance if query is provided
  if (query) {
    const scoredFiles = filePaths.map(path => ({
      path,
      score: fileRelevanceScorer.scoreFile(path, query, files)
    }));

    // Sort by score in descending order
    scoredFiles.sort((a, b) => b.score - a.score);

    // Update mention frequency for selected files
    scoredFiles.slice(0, 10).forEach(file => {
      fileRelevanceScorer.updateMentionFrequency(file.path);
    });

    // Update filePaths with sorted results
    filePaths = scoredFiles.map(file => file.path);

    logger.debug(`Scored files for query "${query}": ${scoredFiles.slice(0, 5).map(f => `${f.path}(${f.score.toFixed(2)})`).join(', ')}`);
  }

  const fileContexts = filePaths
    .filter((x) => files[x] && files[x].type == 'file')
    .map((path) => {
      const dirent = files[path];

      if (!dirent || dirent.type == 'folder') {
        return '';
      }

      const codeWithLinesNumbers = dirent.content
        .split('\n')
        // .map((v, i) => `${i + 1}|${v}`)
        .join('\n');

      let filePath = path;

      if (useRelativePath) {
        filePath = path.replace('/home/project/', '');
      }

      return `<boltAction type="file" filePath="${filePath}">${codeWithLinesNumbers}</boltAction>`;
    });

  return `<boltArtifact id="code-content" title="Code Content" >\n${fileContexts.join('\n')}\n</boltArtifact>`;
}

export function extractCurrentContext(messages: Message[]) {
  const lastAssistantMessage = messages.filter((x) => x.role == 'assistant').slice(-1)[0];

  if (!lastAssistantMessage) {
    return { summary: undefined, codeContext: undefined };
  }

  let summary: ContextAnnotation | undefined;
  let codeContext: ContextAnnotation | undefined;

  if (!lastAssistantMessage.annotations?.length) {
    return { summary: undefined, codeContext: undefined };
  }

  for (let i = 0; i < lastAssistantMessage.annotations.length; i++) {
    const annotation = lastAssistantMessage.annotations[i];

    if (!annotation || typeof annotation !== 'object') {
      continue;
    }

    if (!(annotation as any).type) {
      continue;
    }

    const annotationObject = annotation as any;

    if (annotationObject.type === 'codeContext') {
      codeContext = annotationObject;
      break;
    } else if (annotationObject.type === 'chatSummary') {
      summary = annotationObject;
      break;
    }
  }

  return { summary, codeContext };
}
