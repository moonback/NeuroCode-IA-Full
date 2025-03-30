import { atom, onMount } from 'nanostores';

const isBrowser = typeof window !== 'undefined';

const getInitialValue = (): string => {
  try {
    const stored = isBrowser ? localStorage.getItem('customPrompt') : '';
    return stored || '';  // Add JSON.parse
  } catch (error) {
    console.error('Erreur lors de la lecture de localStorage:', error);
    return '';
  }
};

export const promptStore = atom<string>('');

if (isBrowser) {
  const initialValue = localStorage.getItem('customPrompt') || '';
  promptStore.set(initialValue);
}

// Synchronisation initiale avec localStorage au montage
onMount(promptStore, () => {
  const value = localStorage.getItem('customPrompt') || '';
  promptStore.set(value);
});

// Écouter les changements et les sauvegarder dans localStorage
if (isBrowser) {
  promptStore.listen((value) => {
    try {
      localStorage.setItem('customPrompt', value);  // Add JSON.stringify
    } catch (error) {
      console.error('Erreur lors de l\'écriture dans localStorage:', error);
    }
  });
}