import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'react-toastify';
import { classNames } from '~/utils/classNames';
import { Switch } from '~/components/ui/Switch';
import type { UserProfile } from '~/components/@settings/core/types';
import { isMac } from '~/utils/os';
import { useSettings } from '~/lib/hooks/useSettings';
import { NOTIFICATION_SOUNDS, getSelectedSound, setSelectedSound, playTestSound as playTestAudio } from '~/utils/audio';
// Helper to get modifier key symbols/text
const getModifierSymbol = (modifier: string): string => {
  switch (modifier) {
    case 'meta':
      return isMac ? '⌘' : 'Win';
    case 'alt':
      return isMac ? '⌥' : 'Alt';
    case 'shift':
      return '⇧';
    default:
      return modifier;
  }
};

export default function SettingsTab() {
  const [currentTimezone, setCurrentTimezone] = useState('');
  const { 
  chatSoundEnabled, 
  setChatSoundEnabled, 
  chatSoundVolume, 
  setChatSoundVolume,
  alertSoundEnabled,
  setAlertSoundEnabled 
} = useSettings();
  const [selectedSound, setSelectedSoundState] = useState(() => getSelectedSound());
  const [settings, setSettings] = useState<UserProfile>(() => {
    const saved = localStorage.getItem('bolt_user_profile');
    return saved
      ? JSON.parse(saved)
      : {
          notifications: true,
          language: 'fr',
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        };
  });

  useEffect(() => {
    setCurrentTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  }, []);

  // Save settings automatically when they change
  useEffect(() => {
    try {
      // Get existing profile data
      const existingProfile = JSON.parse(localStorage.getItem('bolt_user_profile') || '{}');

      // Merge with new settings
      const updatedProfile = {
        ...existingProfile,
        notifications: settings.notifications,
        language: settings.language,
        timezone: settings.timezone,
      };

      localStorage.setItem('bolt_user_profile', JSON.stringify(updatedProfile));
      toast.success('Paramètres mis à jour');
    } catch (error) {
      console.error('Erreur lors de la sauvegarde des paramètres :', error);
      toast.error('Échec de la mise à jour des paramètres');
    }
  }, [settings]);
// Play a test sound for audio preview
const playTestSound = () => {
  playTestAudio();
  toast.info('Lecture du son de test');
};

// Handle sound selection change
const handleSoundChange = (soundPath: string) => {
  setSelectedSoundState(soundPath);
  setSelectedSound(soundPath);

  // Play the selected sound for preview
  playTestAudio(soundPath);
  toast.success('Le son a changé');
};

  return (
    <div className="space-y-6">
      {/* Langue & Notifications */}
      <motion.div
        className="bg-white dark:bg-[#0A0A0A] rounded-lg shadow-sm dark:shadow-none p-6 space-y-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <div className="flex items-center gap-3 border-b border-gray-100 dark:border-gray-800 pb-4">
          <div className="i-ph:palette-fill w-5 h-5 text-purple-500" />
          <span className="text-base font-semibold text-bolt-elements-textPrimary">Préférences</span>
        </div>

        <div className="bg-gray-50 dark:bg-[#111111] rounded-xl p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="i-ph:translate-fill w-4 h-4 text-bolt-elements-textSecondary" />
            <label className="text-sm font-medium text-bolt-elements-textPrimary">Langue</label>
          </div>
          <select
            value={settings.language}
            onChange={(e) => setSettings((prev) => ({ ...prev, language: e.target.value }))}
            className={classNames(
              'w-full px-4 py-2.5 rounded-lg text-sm',
              'bg-white dark:bg-[#0A0A0A]',
              'border border-gray-200 dark:border-gray-800',
              'text-bolt-elements-textPrimary',
              'focus:outline-none focus:ring-2 focus:ring-purple-500/30',
              'transition-all duration-200',
            )}
          >
            <option value="en">Anglais</option>
            <option value="es">Espagnol</option>
            <option value="fr">Français</option>
            <option value="de">Allemand</option>
            <option value="it">Italien</option>
            <option value="pt">Portugais</option>
            <option value="ru">Russe</option>
            <option value="zh">Chinois</option>
            <option value="ja">Japonais</option>
            <option value="ko">Coréen</option>
          </select>
        </div>

        <div className="bg-gray-50 dark:bg-[#111111] rounded-xl p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="i-ph:bell-fill w-4 h-4 text-bolt-elements-textSecondary" />
            <label className="text-sm font-medium text-bolt-elements-textPrimary">Notifications</label>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-bolt-elements-textSecondary">
              {settings.notifications ? 'Les notifications sont activées' : 'Les notifications sont désactivées'}
            </span>
            <Switch
              checked={settings.notifications}
              onCheckedChange={(checked) => {
                // Update local state
                setSettings((prev) => ({ ...prev, notifications: checked }));

                // Update localStorage immediately
                const existingProfile = JSON.parse(localStorage.getItem('bolt_user_profile') || '{}');
                const updatedProfile = {
                  ...existingProfile,
                  notifications: checked,
                };
                localStorage.setItem('bolt_user_profile', JSON.stringify(updatedProfile));

                // Dispatch storage event for other components
                window.dispatchEvent(
                  new StorageEvent('storage', {
                    key: 'bolt_user_profile',
                    newValue: JSON.stringify(updatedProfile),
                  }),
                );

                toast.success(`Notifications ${checked ? 'activées' : 'désactivées'}`);
              }}
            />
          </div>
        </div>
      </motion.div>
 {/* Sound Settings */}
<motion.div
  className="bg-white dark:bg-[#0A0A0A] rounded-lg shadow-sm dark:shadow-none p-6 space-y-6"
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ delay: 0.15 }}
>
  {/* Header */}
  <div className="flex items-center gap-3 border-b border-gray-100 dark:border-gray-800 pb-4">
    <div className="i-ph:speaker-high-fill w-5 h-5 text-purple-500" />
    <span className="text-base font-semibold text-bolt-elements-textPrimary">Paramètres sonores</span>
  </div>

  {/* Chat End Sound Settings */}
  <div className="bg-gray-50 dark:bg-[#111111] rounded-xl p-4">
    <div className="flex items-center gap-3 mb-3">
      <div className="i-ph:bell-simple-fill w-4 h-4 text-bolt-elements-textSecondary" />
      <label className="text-sm font-medium text-bolt-elements-textPrimary">Son de fin de discussion</label>
    </div>
    <div className="flex items-center justify-between">
      <span className="text-sm text-bolt-elements-textSecondary">
        {chatSoundEnabled ? 'Notification sonore activée' : 'Notification sonore désactivée'}
      </span>
      <Switch
        checked={chatSoundEnabled}
        onCheckedChange={(checked) => {
          setChatSoundEnabled(checked);
          toast.success(`Son de discussion ${checked ? 'activé' : 'désactivé'}`);
        }}
      />
    </div>
  </div>

  {/* Alert Sound Settings */}
  <div className="bg-gray-50 dark:bg-[#111111] rounded-xl p-4">
    <div className="flex items-center gap-3 mb-3">
      <div className="i-ph:warning-fill w-4 h-4 text-bolt-elements-textSecondary" />
      <label className="text-sm font-medium text-bolt-elements-textPrimary">Son d'alerte</label>
    </div>
    <div className="flex items-center justify-between">
      <span className="text-sm text-bolt-elements-textSecondary">
        {alertSoundEnabled ? 'Alertes sonores activées' : 'Alertes sonores désactivées'}
      </span>
      <Switch
        checked={alertSoundEnabled}
        onCheckedChange={(checked) => {
          setAlertSoundEnabled(checked);
          toast.success(`Alertes sonores ${checked ? 'activées' : 'désactivées'}`);
        }}
      />
    </div>
  </div>

  {/* Advanced Sound Settings */}
  {chatSoundEnabled && (
    <div className="space-y-6">
      {/* Sound Selection */}
      <div className="bg-gray-50 dark:bg-[#111111] rounded-xl p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="i-ph:music-notes-fill w-4 h-4 text-bolt-elements-textSecondary" />
          <label className="text-sm font-medium text-bolt-elements-textPrimary">Type de son</label>
        </div>
        <select
          value={selectedSound}
          onChange={(e) => handleSoundChange(e.target.value)}
          className={classNames(
            'w-full px-4 py-2.5 rounded-lg text-sm',
            'bg-white dark:bg-[#0A0A0A]',
            'border border-gray-200 dark:border-gray-800',
            'text-bolt-elements-textPrimary',
            'focus:outline-none focus:ring-2 focus:ring-purple-500/30',
            'transition-all duration-200',
          )}
        >
          <option value={NOTIFICATION_SOUNDS.BOLT}>Neurocode (Par défaut)</option>
          <option value={NOTIFICATION_SOUNDS.CHIME}>Carillon</option>
          <option value={NOTIFICATION_SOUNDS.ALERT}>Alerte</option>
        </select>
      </div>

      {/* Volume Control */}
      <div className="bg-gray-50 dark:bg-[#111111] rounded-xl p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="i-ph:speaker-simple-fill w-4 h-4 text-bolt-elements-textSecondary" />
          <label className="text-sm font-medium text-bolt-elements-textPrimary">Volume</label>
        </div>
        <div className="flex items-center gap-4">
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={chatSoundVolume}
            onChange={(e) => setChatSoundVolume(parseFloat(e.target.value))}
            className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
          />
          <span className="text-sm font-medium text-bolt-elements-textSecondary min-w-[48px] text-center">
            {Math.round(chatSoundVolume * 100)}%
          </span>
          <button
            onClick={playTestSound}
            className="px-4 py-2 text-sm font-medium text-white bg-purple-500 rounded-lg hover:bg-purple-600 transition-colors"
          >
            Tester
          </button>
        </div>
      </div>
    </div>
  )}
</motion.div>
      {/* Fuseau horaire */}
      <motion.div
        className="bg-white dark:bg-[#0A0A0A] rounded-lg shadow-sm dark:shadow-none p-6 space-y-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <div className="flex items-center gap-3 border-b border-gray-100 dark:border-gray-800 pb-4">
          <div className="i-ph:clock-fill w-5 h-5 text-purple-500" />
          <span className="text-base font-semibold text-bolt-elements-textPrimary">Paramètres horaires</span>
        </div>

        <div className="bg-gray-50 dark:bg-[#111111] rounded-xl p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="i-ph:globe-fill w-4 h-4 text-bolt-elements-textSecondary" />
            <label className="text-sm font-medium text-bolt-elements-textPrimary">Fuseau horaire</label>
          </div>
          <select
            value={settings.timezone}
            onChange={(e) => setSettings((prev) => ({ ...prev, timezone: e.target.value }))}
            className={classNames(
              'w-full px-4 py-2.5 rounded-lg text-sm',
              'bg-white dark:bg-[#0A0A0A]',
              'border border-gray-200 dark:border-gray-800',
              'text-bolt-elements-textPrimary',
              'focus:outline-none focus:ring-2 focus:ring-purple-500/30',
              'transition-all duration-200',
            )}
          >
            <option value={currentTimezone}>{currentTimezone}</option>
          </select>
        </div>
      </motion.div>

      {/* Raccourcis clavier simplifiés */}
      <motion.div
        className="bg-white dark:bg-[#0A0A0A] rounded-lg shadow-sm dark:shadow-none p-6 space-y-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <div className="flex items-center gap-3 border-b border-gray-100 dark:border-gray-800 pb-4">
          <div className="i-ph:keyboard-fill w-5 h-5 text-purple-500" />
          <span className="text-base font-semibold text-bolt-elements-textPrimary">Raccourcis clavier</span>
        </div>

        <div className="bg-gray-50 dark:bg-[#111111] rounded-xl p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="i-ph:palette-fill w-4 h-4 text-bolt-elements-textSecondary" />
            <label className="text-sm font-medium text-bolt-elements-textPrimary">Changer de thème</label>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-bolt-elements-textSecondary">Basculer entre le mode clair et sombre</span>
            <div className="flex items-center gap-1">
              <kbd className="px-2 py-1 text-xs font-semibold text-bolt-elements-textSecondary bg-white dark:bg-[#0A0A0A] border border-gray-200 dark:border-gray-800 rounded shadow-sm">
                {getModifierSymbol('meta')}
              </kbd>
              <kbd className="px-2 py-1 text-xs font-semibold text-bolt-elements-textSecondary bg-white dark:bg-[#0A0A0A] border border-gray-200 dark:border-gray-800 rounded shadow-sm">
                {getModifierSymbol('alt')}
              </kbd>
              <kbd className="px-2 py-1 text-xs font-semibold text-bolt-elements-textSecondary bg-white dark:bg-[#0A0A0A] border border-gray-200 dark:border-gray-800 rounded shadow-sm">
                {getModifierSymbol('shift')}
              </kbd>
              <kbd className="px-2 py-1 text-xs font-semibold text-bolt-elements-textSecondary bg-white dark:bg-[#0A0A0A] border border-gray-200 dark:border-gray-800 rounded shadow-sm">
                D
              </kbd>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
