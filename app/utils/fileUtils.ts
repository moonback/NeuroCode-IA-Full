import ignore from 'ignore';

// Common patterns to ignore, similar to .gitignore
export const IGNORE_PATTERNS = [
  'node_modules/**',
  '.git/**',
  'dist/**',
  'build/**',
  '.next/**',
  'coverage/**',
  '.cache/**',
  '.vscode/**',
  '.idea/**',
  '**/*.log',
  '**/.DS_Store',
  '**/npm-debug.log*',
  '**/yarn-debug.log*',
  '**/yarn-error.log*',
];

export const MAX_FILES = 1000;
export const ig = ignore().add(IGNORE_PATTERNS);

export const generateId = () => Math.random().toString(36).substring(2, 15);

export const isBinaryFile = async (file: File): Promise<boolean> => {
  const chunkSize = 1024;
  const buffer = new Uint8Array(await file.slice(0, chunkSize).arrayBuffer());

  for (let i = 0; i < buffer.length; i++) {
    const byte = buffer[i];

    if (byte === 0 || (byte < 32 && byte !== 9 && byte !== 10 && byte !== 13)) {
      return true;
    }
  }

  return false;
};

export const shouldIncludeFile = (path: string): boolean => {
  return !ig.ignores(path);
};

/**
 * Ajoute un fichier à la liste des fichiers ciblés dans le textarea du chat.
 * @param filePath - Le chemin du fichier à ajouter
 * @param textareaElement - L'élément textarea du chat
 * @returns true si le fichier a été ajouté, false sinon (déjà présent ou erreur)
 */
export function addTargetedFile(filePath: string, textareaElement: HTMLTextAreaElement | null): boolean {
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
export function removeTargetedFile(filePath: string, textareaElement: HTMLTextAreaElement | null): boolean {
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

const readPackageJson = async (files: File[]): Promise<{ scripts?: Record<string, string> } | null> => {
  const packageJsonFile = files.find((f) => f.webkitRelativePath.endsWith('package.json'));

  if (!packageJsonFile) {
    return null;
  }

  try {
    const content = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsText(packageJsonFile);
    });

    return JSON.parse(content);
  } catch (error) {
    console.error('Error reading package.json:', error);
    return null;
  }
};

export const detectProjectType = async (
  files: File[],
): Promise<{ type: string; setupCommand: string; followupMessage: string }> => {
  const hasFile = (name: string) => files.some((f) => f.webkitRelativePath.endsWith(name));

  if (hasFile('package.json')) {
    const packageJson = await readPackageJson(files);
    const scripts = packageJson?.scripts || {};

    // Check for preferred commands in priority order
    const preferredCommands = ['dev', 'start', 'preview'];
    const availableCommand = preferredCommands.find((cmd) => scripts[cmd]);

    if (availableCommand) {
      return {
        type: 'Node.js',
        setupCommand: `npm install && npm run ${availableCommand}`,
        followupMessage: `Found "${availableCommand}" script in package.json. Running "npm run ${availableCommand}" after installation.`,
      };
    }

    return {
      type: 'Node.js',
      setupCommand: 'npm install',
      followupMessage:
        'Would you like me to inspect package.json to determine the available scripts for running this project?',
    };
  }

  if (hasFile('index.html')) {
    return {
      type: 'Static',
      setupCommand: 'npx --yes serve',
      followupMessage: '',
    };
  }

  return { type: '', setupCommand: '', followupMessage: '' };
};

export const filesToArtifacts = (files: { [path: string]: { content: string } }, id: string): string => {
  return `
<boltArtifact id="${id}" title="User Updated Files">
${Object.keys(files)
  .map(
    (filePath) => `
<boltAction type="file" filePath="${filePath}">
${files[filePath].content}
</boltAction>
`,
  )
  .join('\n')}
</boltArtifact>
  `;
};
