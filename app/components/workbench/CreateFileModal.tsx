import { memo, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { workbenchStore } from '~/lib/stores/workbench';
import { toast } from 'react-toastify';
import { path } from '~/utils/path';

interface CreateFileModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetPath: string;
}

type CreationType = 'file' | 'folder';

export const CreateFileModal = memo(({ isOpen, onClose, targetPath }: CreateFileModalProps) => {
  const [name, setName] = useState('');
  const [type, setType] = useState<CreationType>('file');
  const [isCreating, setIsCreating] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim()) {
      toast.error(`Veuillez entrer un nom de ${type === 'file' ? 'fichier' : 'dossier'}`);
      return;
    }

    setIsCreating(true);
    
    try {
      const fullPath = path.join(targetPath, name.trim());
      let success = false;
      
      if (type === 'file') {
        success = await workbenchStore.createFile(fullPath, '');
        if (success) {
          toast.success(`Fichier ${name} créé avec succès`);
        } else {
          toast.error(`Échec de la création du fichier ${name}`);
        }
      } else {
        success = await workbenchStore.createFolder(fullPath);
        if (success) {
          toast.success(`Dossier ${name} créé avec succès`);
        } else {
          toast.error(`Échec de la création du dossier ${name}`);
        }
      }
      
      if (success) {
        setName('');
        onClose();
      }
    } catch (error) {
      console.error(`Error creating ${type}:`, error);
      toast.error(`Erreur lors de la création du ${type === 'file' ? 'fichier' : 'dossier'} ${name}`);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={onClose}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor rounded-xl shadow-xl p-6 max-w-md w-full mx-4 z-50 data-[state=open]:animate-scale-in">
          <Dialog.Title className="text-xl font-semibold text-bolt-elements-textPrimary mb-4">
            Créer un {type === 'file' ? 'fichier' : 'dossier'}
          </Dialog.Title>
          
          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <div className="flex gap-4 mb-4">
                <button
                  type="button"
                  className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-lg border ${type === 'file' ? 'border-blue-500 bg-blue-500/10' : 'border-bolt-elements-borderColor hover:bg-bolt-elements-background-depth-2'}`}
                  onClick={() => setType('file')}
                >
                  <div className="i-ph:file-plus text-blue-500" />
                  <span className={type === 'file' ? 'text-blue-500' : 'text-bolt-elements-textSecondary'}>Fichier</span>
                </button>
                <button
                  type="button"
                  className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-lg border ${type === 'folder' ? 'border-purple-500 bg-purple-500/10' : 'border-bolt-elements-borderColor hover:bg-bolt-elements-background-depth-2'}`}
                  onClick={() => setType('folder')}
                >
                  <div className="i-ph:folder-plus text-purple-500" />
                  <span className={type === 'folder' ? 'text-purple-500' : 'text-bolt-elements-textSecondary'}>Dossier</span>
                </button>
              </div>
              
              <label className="block text-sm font-medium text-bolt-elements-textSecondary mb-1">
                Nom du {type === 'file' ? 'fichier' : 'dossier'}
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded-md text-bolt-elements-textPrimary focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                placeholder={type === 'file' ? 'mon-fichier.txt' : 'mon-dossier'}
                autoFocus
              />
              <p className="mt-1 text-xs text-bolt-elements-textTertiary">
                Sera créé dans: {targetPath}
              </p>
            </div>
            
            <div className="flex justify-end gap-2 mt-6">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="px-4 py-2 text-sm font-medium text-bolt-elements-textSecondary bg-bolt-elements-background-depth-2 hover:bg-bolt-elements-background-depth-3 rounded-md focus:outline-none"
                  disabled={isCreating}
                >
                  Annuler
                </button>
              </Dialog.Close>
              <button
                type="submit"
                className="px-4 py-2 text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 rounded-md focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={isCreating || !name.trim()}
              >
                {isCreating ? (
                  <>
                    <span className="i-svg-spinners:270-ring-with-bg mr-2" />
                    Création...
                  </>
                ) : (
                  <>Créer</>
                )}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
});
