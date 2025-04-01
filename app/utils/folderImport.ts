import type { Message } from 'ai';
import { generateId } from './fileUtils';
import { detectProjectCommands, createCommandsMessage, escapeBoltTags } from './projectCommands';

export const createChatFromFolder = async (
  files: File[],
  binaryFiles: string[],
  folderName: string,
): Promise<Message[]> => {
  const fileArtifacts = await Promise.all(
    files.map(async (file) => {
      return new Promise<{ content: string; path: string }>((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = () => {
          const content = reader.result as string;
          const relativePath = file.webkitRelativePath.split('/').slice(1).join('/');
          resolve({
            content,
            path: relativePath,
          });
        };
        reader.onerror = reject;
        reader.readAsText(file);
      });
    }),
  );

  const commands = await detectProjectCommands(fileArtifacts);
  const commandsMessage = createCommandsMessage(commands);

  const binaryFilesMessage =
    binaryFiles.length > 0
      ? `\n\nFichiers binaires ignorés: ${binaryFiles.length}\n${binaryFiles.map((f) => `- ${f}`).join('\n')}`
      : '';

  const filesMessage: Message = {
    role: 'assistant',
    content: `J'ai importé le contenu du dossier "${folderName}".${binaryFilesMessage}
<boltArtifact id="imported-files" title="Fichiers importés" type="bundled" >
${fileArtifacts
  .map(
    (file) => `<boltAction type="file" filePath="${file.path}">
${escapeBoltTags(file.content)}
</boltAction>`,
  )
  .join('\n\n')}
</boltArtifact>`,
    id: generateId(),
    createdAt: new Date(),
  };

  const userMessage: Message = {
    role: 'user',
    id: generateId(),
    content: `Importer le dossier "${folderName}" et analyser son contenu`,
    createdAt: new Date(),
  };

  const messages = [userMessage, filesMessage];

  if (commandsMessage) {
    // Add the commands message after the files message
    messages.push(commandsMessage);
  }

  return messages;
};
