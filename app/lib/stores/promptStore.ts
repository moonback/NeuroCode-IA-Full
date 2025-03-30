import { atom } from 'nanostores';

const isBrowser = typeof window !== 'undefined';

const getInitialValue = (): string => {
  try {
    const stored = isBrowser ? localStorage.getItem('customPrompt') : '';
    return typeof stored === 'string' ? stored : '';
  } catch (error) {
    console.error('Erreur lors de la lecture de localStorage:', error);
    return '';
  }
};

export const promptStore = atom<string>(getInitialValue());

// Écouter les changements et les sauvegarder dans localStorage
if (isBrowser) {
  promptStore.listen((value) => {
    try {
      localStorage.setItem('customPrompt', JSON.stringify(value));
    } catch (error) {
      console.error('Erreur lors de l\'écriture dans localStorage:', error);
    }
  });
}