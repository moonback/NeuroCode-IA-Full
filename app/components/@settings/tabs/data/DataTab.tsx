import { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'react-toastify';
import { DialogRoot, DialogClose, Dialog, DialogTitle } from '~/components/ui/Dialog';
import { db, getAll, deleteById } from '~/lib/persistence';

export default function DataTab() {
  const [isDownloadingTemplate, setIsDownloadingTemplate] = useState(false);
  const [isImportingKeys, setIsImportingKeys] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showResetInlineConfirm, setShowResetInlineConfirm] = useState(false);
  const [showDeleteInlineConfirm, setShowDeleteInlineConfirm] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const apiKeyFileInputRef = useRef<HTMLInputElement>(null);

  const handleExportAllChats = async () => {
    try {
      if (!db) {
        throw new Error('Base de données non initialisée');
      }

      // Get all chats from IndexedDB
      const allChats = await getAll(db);
      const exportData = {
        chats: allChats,
        exportDate: new Date().toISOString(),
      };

      // Download as JSON
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bolt-chats-${new Date().toISOString()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success('Chats exportés avec succès');
    } catch (error) {
      console.error('Erreur lors de l\'exportation :', error);
      toast.error('Échec de l\'exportation des chats');
    }
  };

  const handleExportSettings = () => {
    try {
      const settings = {
        userProfile: localStorage.getItem('bolt_user_profile'),
        settings: localStorage.getItem('bolt_settings'),
        exportDate: new Date().toISOString(),
      };

      const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bolt-settings-${new Date().toISOString()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success('Paramètres exportés avec succès');
    } catch (error) {
      console.error('Erreur lors de l\'exportation :', error);
      toast.error('Échec de l\'exportation des paramètres');
    }
  };

  const handleImportSettings = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    try {
      const content = await file.text();
      const settings = JSON.parse(content);

      if (settings.userProfile) {
        localStorage.setItem('bolt_user_profile', settings.userProfile);
      }

      if (settings.settings) {
        localStorage.setItem('bolt_settings', settings.settings);
      }

      window.location.reload(); // Reload to apply settings
      toast.success('Paramètres importés avec succès');
    } catch (error) {
      console.error('Erreur lors de l\'importation :', error);
      toast.error('Échec de l\'importation des paramètres');
    }
  };

  const handleImportAPIKeys = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setIsImportingKeys(true);

    try {
      const content = await file.text();
      const keys = JSON.parse(content);

      // Validate and save each key
      Object.entries(keys).forEach(([key, value]) => {
        if (typeof value !== 'string') {
          throw new Error(`Valeur invalide pour la clé : ${key}`);
        }

        localStorage.setItem(`bolt_${key.toLowerCase()}`, value);
      });

      toast.success('Clés API importées avec succès');
    } catch (error) {
      console.error('Erreur lors de l\'importation des clés API :', error);
      toast.error('Échec de l\'importation des clés API');
    } finally {
      setIsImportingKeys(false);

      if (apiKeyFileInputRef.current) {
        apiKeyFileInputRef.current.value = '';
      }
    }
  };

  const handleDownloadTemplate = () => {
    setIsDownloadingTemplate(true);

    try {
      const template = {
        Anthropic_API_KEY: '',
        OpenAI_API_KEY: '',
        Google_API_KEY: '',
        Groq_API_KEY: '',
        HuggingFace_API_KEY: '',
        OpenRouter_API_KEY: '',
        Deepseek_API_KEY: '',
        Mistral_API_KEY: '',
        OpenAILike_API_KEY: '',
        Together_API_KEY: '',
        xAI_API_KEY: '',
        Perplexity_API_KEY: '',
        Cohere_API_KEY: '',
        AzureOpenAI_API_KEY: '',
        OPENAI_LIKE_API_BASE_URL: '',
        LMSTUDIO_API_BASE_URL: '',
        OLLAMA_API_BASE_URL: '',
        TOGETHER_API_BASE_URL: '',
      };

      const blob = new Blob([JSON.stringify(template, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'bolt-api-keys-template.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success('Modèle téléchargé avec succès');
    } catch (error) {
      console.error('Erreur lors du téléchargement du modèle :', error);
      toast.error('Échec du téléchargement du modèle');
    } finally {
      setIsDownloadingTemplate(false);
    }
  };

  const handleResetSettings = async () => {
    setIsResetting(true);

    try {
      // Clear all stored settings from localStorage
      localStorage.removeItem('bolt_user_profile');
      localStorage.removeItem('bolt_settings');
      localStorage.removeItem('bolt_chat_history');

      // Clear all data from IndexedDB
      if (!db) {
        throw new Error('Base de données non initialisée');
      }

      // Get all chats and delete them
      const chats = await getAll(db as IDBDatabase);
      const deletePromises = chats.map((chat) => deleteById(db as IDBDatabase, chat.id));
      await Promise.all(deletePromises);

      // Close the dialog first
      setShowResetInlineConfirm(false);

      // Then reload and show success message
      window.location.reload();
      toast.success('Paramètres réinitialisés avec succès');
    } catch (error) {
      console.error('Erreur lors de la réinitialisation :', error);
      setShowResetInlineConfirm(false);
      toast.error('Échec de la réinitialisation des paramètres');
    } finally {
      setIsResetting(false);
    }
  };

  const handleDeleteAllChats = async () => {
    setIsDeleting(true);

    try {
      // Clear chat history from localStorage
      localStorage.removeItem('bolt_chat_history');

      // Clear chats from IndexedDB
      if (!db) {
        throw new Error('Base de données non initialisée');
      }

      // Get all chats and delete them one by one
      const chats = await getAll(db as IDBDatabase);
      const deletePromises = chats.map((chat) => deleteById(db as IDBDatabase, chat.id));
      await Promise.all(deletePromises);

      // Close the dialog first
      setShowDeleteInlineConfirm(false);

      // Then show the success message
      toast.success('Historique des chats supprimé avec succès');
    } catch (error) {
      console.error('Erreur lors de la suppression :', error);
      setShowDeleteInlineConfirm(false);
      toast.error('Échec de la suppression de l\'historique des chats');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <input ref={fileInputRef} type="file" accept=".json" onChange={handleImportSettings} className="hidden" />
      {/* Reset Settings Dialog */}
      <DialogRoot open={showResetInlineConfirm} onOpenChange={setShowResetInlineConfirm}>
        <Dialog showCloseButton={false} className="z-[1000]">
          <div className="p-6">
            <div className="flex items-center gap-3">
              <div className="i-ph:warning-circle-fill w-5 h-5 text-yellow-500" />
              <DialogTitle>Réinitialiser tous les paramètres ?</DialogTitle>
            </div>
            <p className="text-sm text-bolt-elements-textSecondary mt-2">
              Cela réinitialisera tous vos paramètres à leurs valeurs par défaut. Cette action ne peut
            </p>
            <div className="flex justify-end items-center gap-3 mt-6">
              <DialogClose asChild>
                <button className="px-4 py-2 rounded-lg text-sm bg-[#F5F5F5] dark:bg-[#1A1A1A] text-[#666666] dark:text-[#999999] hover:text-[#333333] dark:hover:text-white">
                  Annuler
                </button>
              </DialogClose>
              <motion.button
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm bg-white dark:bg-[#1A1A1A] text-yellow-600 dark:text-yellow-500 hover:bg-yellow-50 dark:hover:bg-yellow-500/10 border border-transparent hover:border-yellow-500/10 dark:hover:border-yellow-500/20"
                onClick={handleResetSettings}
                disabled={isResetting}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                {isResetting ? (
                  <div className="i-ph:spinner-gap-bold animate-spin w-4 h-4" />
                ) : (
                  <div className="i-ph:arrow-counter-clockwise w-4 h-4" />
                )}
                Réinitialiser les paramètres
              </motion.button>
            </div>
          </div>
        </Dialog>
      </DialogRoot>

      {/* Delete Confirmation Dialog */}
      <DialogRoot open={showDeleteInlineConfirm} onOpenChange={setShowDeleteInlineConfirm}>
        <Dialog showCloseButton={false} className="z-[1000]">
          <div className="p-6">
            <div className="flex items-center gap-3">
              <div className="i-ph:warning-circle-fill w-5 h-5 text-red-500" />
              <DialogTitle>Supprimer tous les chats ?</DialogTitle>
            </div>
            <p className="text-sm text-bolt-elements-textSecondary mt-2">
              Cela supprimera définitivement tout votre historique de chats. Cette action ne peut pas être annulée.
            </p>
            <div className="flex justify-end items-center gap-3 mt-6">
              <DialogClose asChild>
                <button className="px-4 py-2 rounded-lg text-sm bg-[#F5F5F5] dark:bg-[#1A1A1A] text-[#666666] dark:text-[#999999] hover:text-[#333333] dark:hover:text-white">
                  Annuler
                </button>
              </DialogClose>
              <motion.button
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm bg-white dark:bg-[#1A1A1A] text-red-500 dark:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 border border-transparent hover:border-red-500/10 dark:hover:border-red-500/20"
                onClick={handleDeleteAllChats}
                disabled={isDeleting}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                {isDeleting ? (
                  <div className="i-ph:spinner-gap-bold animate-spin w-4 h-4" />
                ) : (
                  <div className="i-ph:trash w-4 h-4" />
                )}
                Supprimer tout
              </motion.button>
            </div>
          </div>
        </Dialog>
      </DialogRoot>

      {/* Chat History Section */}
      <motion.div
        className="bg-white dark:bg-[#0A0A0A] rounded-lg p-6 border border-[#E5E5E5] dark:border-[#1A1A1A]"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <div className="flex items-center gap-2 mb-2">
          <div className="i-ph:chat-circle-duotone w-5 h-5 text-purple-500" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">Historique des chats</h3>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">Exportez ou supprimez tout votre historique de chats.</p>
        <div className="flex gap-4">
          <motion.button
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-500 text-white text-sm hover:bg-purple-600"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleExportAllChats}
          >
            <div className="i-ph:download-simple w-4 h-4" />
            Exporter tous les chats
          </motion.button>
          <motion.button
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-50 text-red-500 text-sm hover:bg-red-100 dark:bg-red-500/10 dark:hover:bg-red-500/20"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setShowDeleteInlineConfirm(true)}
          >
            <div className="i-ph:trash w-4 h-4" />
            Supprimer tous les chats
          </motion.button>
        </div>
      </motion.div>

      {/* Settings Backup Section */}
      <motion.div
        className="bg-white dark:bg-[#0A0A0A] rounded-lg p-6 border border-[#E5E5E5] dark:border-[#1A1A1A]"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <div className="flex items-center gap-2 mb-2">
          <div className="i-ph:gear-duotone w-5 h-5 text-purple-500" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">Sauvegarde des paramètres</h3>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Exportez vos paramètres vers un fichier JSON ou importez des paramètres à partir d'un fichier précédemment exporté.
        </p>
        <div className="flex gap-4">
          <motion.button
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-500 text-white text-sm hover:bg-purple-600"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleExportSettings}
          >
            <div className="i-ph:download-simple w-4 h-4" />
            Exporter les paramètres
          </motion.button>
          <motion.button
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-500 text-white text-sm hover:bg-purple-600"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="i-ph:upload-simple w-4 h-4" />
            Importer les paramètres
          </motion.button>
          <motion.button
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-yellow-50 text-yellow-600 text-sm hover:bg-yellow-100 dark:bg-yellow-500/10 dark:hover:bg-yellow-500/20 dark:text-yellow-500"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setShowResetInlineConfirm(true)}
          >
            <div className="i-ph:arrow-counter-clockwise w-4 h-4" />
            Réinitialiser les paramètres
          </motion.button>
        </div>
      </motion.div>

      {/* Gestion des clés API */}
      <motion.div
        className="bg-white dark:bg-[#0A0A0A] rounded-lg p-6 border border-[#E5E5E5] dark:border-[#1A1A1A]"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <div className="flex items-center gap-2 mb-2">
          <div className="i-ph:key-duotone w-5 h-5 text-purple-500" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">Gestion des clés API</h3>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Importez des clés API à partir d'un fichier JSON ou téléchargez un modèle pour remplir vos clés.
        </p>
        <div className="flex gap-4">
          <input
            ref={apiKeyFileInputRef}
            type="file"
            accept=".json"
            onChange={handleImportAPIKeys}
            className="hidden"
          />
          <motion.button
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-500 text-white text-sm hover:bg-purple-600"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleDownloadTemplate}
            disabled={isDownloadingTemplate}
          >
            {isDownloadingTemplate ? (
              <div className="i-ph:spinner-gap-bold animate-spin w-4 h-4" />
            ) : (
              <div className="i-ph:download-simple w-4 h-4" />
            )}
            Télécharger le modèle
          </motion.button>
          <motion.button
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-500 text-white text-sm hover:bg-purple-600"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => apiKeyFileInputRef.current?.click()}
            disabled={isImportingKeys}
          >
            {isImportingKeys ? (
              <div className="i-ph:spinner-gap-bold animate-spin w-4 h-4" />
            ) : (
              <div className="i-ph:upload-simple w-4 h-4" />
            )}
            Importer les clés API
          </motion.button>
        </div>
      </motion.div>
    </div>
  );
}
