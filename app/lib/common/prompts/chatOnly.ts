
import { WORK_DIR } from '~/utils/constants';
import { allowedHTMLElements } from '~/utils/markdown';
import { stripIndents } from '~/utils/stripIndent';
import { PromptLibrary } from '../prompt-library';
import type { PromptOptions } from '../prompt-library';

export function getChatOnlyPrompt(options: PromptOptions): string {
  const basePrompt = PromptLibrary.getPropmtFromLibrary('chatOnly', {
    cwd: options.cwd || WORK_DIR,
    allowedHtmlElements: options.allowedHtmlElements || allowedHTMLElements,
    modificationTagName: options.modificationTagName || 'div',
    supabase: options.supabase
  });

  return stripIndents(basePrompt);
}

// Default export for backward compatibility
export default getChatOnlyPrompt;