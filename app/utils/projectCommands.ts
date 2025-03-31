import type { Message } from 'ai';
import { generateId } from './fileUtils';

export interface ProjectCommands {
  type: string;
  setupCommand?: string;
  startCommand?: string;
  followupMessage: string;
}

interface FileContent {
  content: string;
  path: string;
}

export async function detectProjectCommands(files: FileContent[]): Promise<ProjectCommands> {
  const hasFile = (name: string) => files.some((f) => f.path.endsWith(name));

  if (hasFile('package.json')) {
    const packageJsonFile = files.find((f) => f.path.endsWith('package.json'));

    if (!packageJsonFile) {
      return { type: '', setupCommand: '', followupMessage: '' };
    }

    try {
      const packageJson = JSON.parse(packageJsonFile.content);
      const scripts = packageJson?.scripts || {};

      // Vérifie les commandes préférées par ordre de priorité
      const preferredCommands = ['dev', 'start', 'preview'];
      const availableCommand = preferredCommands.find((cmd) => scripts[cmd]);

      if (availableCommand) {
        return {
          type: 'Node.js',
          setupCommand: `npm install`,
          startCommand: `npm run ${availableCommand}`,
          followupMessage: `J'ai trouvé le script "${availableCommand}" dans package.json. Je vais exécuter "npm run ${availableCommand}" après l'installation.`,
        };
      }

      return {
        type: 'Node.js',
        setupCommand: 'npm install',
        followupMessage:
          'Voulez-vous que j\'inspecte le package.json pour déterminer les scripts disponibles pour exécuter ce projet ?',
      };
    } catch (error) {
      console.error('Erreur lors de l\'analyse du package.json :', error);
      return { type: '', setupCommand: '', followupMessage: '' };
    }
  }

  if (hasFile('index.html')) {
    return {
      type: 'Statique',
      startCommand: 'npx --yes serve',
      followupMessage: '',
    };
  }

  return { type: '', setupCommand: '', followupMessage: '' };
}

export function createCommandsMessage(commands: ProjectCommands): Message | null {
  if (!commands.setupCommand && !commands.startCommand) {
 // If no commands detected, still might need to prompt if only setup is found
 if (commands.setupCommand && commands.followupMessage) {
  // Let's create a confirmation prompt even if only setup is found
} else {
  return null; // No relevant commands or message found
}  }

const artifactId = `setup-actions-${generateId()}`;

   /*
   * Encode les commandes dans la valeur du bouton 'proceed'
   * Format : "proceed|setupCommand|startCommand"
   * Utilise des chaînes vides si les commandes sont indéfinies
   */
   const setupCmd = commands.setupCommand || '';
   const startCmd = commands.startCommand || '';
   const proceedValue = `proceed|${setupCmd}|${startCmd}`;

    // Crée le message de confirmation avec les boutons
    const confirmationContent = `📦 Projet ${commands.type} détecté${commands.followupMessage ? `\n\n${commands.followupMessage}` : ''}

🛠️ Configuration du Projet
${commands.setupCommand ? `▪️ Installation : \`${commands.setupCommand}\`` : ''}
${commands.startCommand ? `\n▪️ Lancement : \`${commands.startCommand}\`` : ''}

💫 Souhaitez-vous procéder à la configuration et au lancement de l'application ?

<boltArtifact id="${artifactId}" title="Configuration du Projet">
<boltAction type="button" value="skip" artifactId="${artifactId}">⏳ Reporter la configuration</boltAction>
<boltAction type="button" value="${proceedValue}" artifactId="${artifactId}">✨ Configurer et Lancer</boltAction>
</boltArtifact>`;
  return {
    role: 'assistant',
    content: confirmationContent,

    id: generateId(),
    createdAt: new Date(),
  };
}

export function escapeBoltArtifactTags(input: string) {
  // Regular expression to match boltArtifact tags and their content
  const regex = /(<boltArtifact[^>]*>)([\s\S]*?)(<\/boltArtifact>)/g;

  return input.replace(regex, (match, openTag, content, closeTag) => {
    // Escape the opening tag
    const escapedOpenTag = openTag.replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // Escape the closing tag
    const escapedCloseTag = closeTag.replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // Return the escaped version
    return `${escapedOpenTag}${content}${escapedCloseTag}`;
  });
}

export function escapeBoltAActionTags(input: string) {
  // Regular expression to match boltArtifact tags and their content
  const regex = /(<boltAction[^>]*>)([\s\S]*?)(<\/boltAction>)/g;

  return input.replace(regex, (match, openTag, content, closeTag) => {
    // Escape the opening tag
    const escapedOpenTag = openTag.replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // Escape the closing tag
    const escapedCloseTag = closeTag.replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // Return the escaped version
    return `${escapedOpenTag}${content}${escapedCloseTag}`;
  });
}

export function escapeBoltTags(input: string) {
  return escapeBoltArtifactTags(escapeBoltAActionTags(input));
}
