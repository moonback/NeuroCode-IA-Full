import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'react-toastify';
import { classNames } from '~/utils/classNames';
import { Switch } from '~/components/ui/Switch';
import type { UserProfile } from '~/components/@settings/core/types';
import { isMac } from '~/utils/os';
import { useSettings } from '~/lib/hooks/useSettings';
import { NOTIFICATION_SOUNDS, getSelectedSound, setSelectedSound, playTestSound as playTestAudio } from '~/utils/audio';
import { debounce } from '~/utils/debounce';

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

// Section component for consistency
const SettingsSection = ({ 
  icon, 
  title, 
  delay, 
  children 
}: { 
  icon: string; 
  title: string; 
  delay: number; 
  children: React.ReactNode 
}) => (
  <motion.div
    className="bg-white dark:bg-[#0A0A0A] rounded-lg shadow-md border border-gray-100 dark:border-gray-800 p-2 space-y-6"
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay }}
  >
    <div className="flex items-center gap-3 border-b border-gray-100 dark:border-gray-800 pb-4">
      <div className={`${icon} w-5 h-5 text-violet-600`} />
      <span className="text-base font-semibold text-bolt-elements-textPrimary">{title}</span>
    </div>
    {children}
  </motion.div>
);

// Option item component
const SettingsItem = ({ 
  icon, 
  label, 
  children 
}: { 
  icon: string; 
  label: string; 
  children: React.ReactNode 
}) => (
  <div className="bg-gray-50 dark:bg-[#111111] rounded-xl p-2 transition-all hover:bg-gray-100 dark:hover:bg-[#151515]">
    <div className="flex items-center gap-3 mb-3">
      <div className={`${icon} w-4 h-4 text-violet-500`} />
      <label className="text-sm font-medium text-bolt-elements-textPrimary">{label}</label>
    </div>
    {children}
  </div>
);

export default function SettingsTab() {
  const [currentTimezone, setCurrentTimezone] = useState('');
  const { 
    chatSoundEnabled, 
    setChatSoundEnabled, 
    chatSoundVolume, 
    setChatSoundVolume,
    alertSoundEnabled,
    setAlertSoundEnabled,
    customInstructions, // Added custom instructions
    setCustomInstructions // Added setter for custom instructions
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

  // Added local state for custom instructions to use with debounce
  const [localInstructions, setLocalInstructions] = useState(customInstructions);

  // Update local state if global state changes (e.g., initial load)
  useEffect(() => {
    setLocalInstructions(customInstructions);
  }, [customInstructions]);

  // Debounced update function
  const debouncedUpdate = useCallback(
    debounce((value: string) => {
      setCustomInstructions(value);
      toast.info('Instructions personnalisées sauvegardées');
    }, 5000), // Save 500ms after typing stops
    [setCustomInstructions]
  );

  const handleInstructionChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setLocalInstructions(newValue);
    debouncedUpdate(newValue);
  };

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
    <div className="max-w-6xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <motion.div 
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <h1 className="text-2xl font-bold text-bolt-elements-textPrimary mb-2">Paramètres</h1>
        <p className="text-bolt-elements-textSecondary">Personnalisez votre expérience NeuroCode</p>
      </motion.div>
       {/* Custom Instructions Section - NEW */}
<SettingsSection icon="i-ph:user-focus-fill" title="Instructions Personnalisées" delay={0.25}>
  <SettingsItem icon="i-ph:scroll-fill" label="Vos instructions pour l'IA">
    <p className="text-xs text-bolt-elements-textSecondary mb-3">
      Personnalisez l'IA en définissant des instructions spécifiques qui seront appliquées à chaque conversation. Configurez le style, le ton et le format des réponses selon vos besoins.
    </p>
    
    {/* Active instruction indicator */}
    <div className="bg-gradient-to-r from-violet-50 to-violet-100 dark:from-violet-900/10 dark:to-violet-800/10 border border-violet-200 dark:border-violet-800/30 rounded-xl p-4 mb-4 shadow-sm hover:shadow-md transition-all duration-300">
      <div className="flex items-start gap-4">
        <div className="i-ph:lightbulb-fill w-6 h-6 text-violet-600 dark:text-violet-400 animate-pulse" />
        <div className="flex-1">
          <h4 className="text-sm font-semibold text-bolt-elements-textPrimary mb-2 flex items-center gap-2">
            Mode actif
            <div className="h-4 w-[1px] bg-gray-300 dark:bg-gray-700"></div>
            <span className="text-xs font-normal text-bolt-elements-textSecondary">Status actuel</span>
          </h4>
          <div className="p-2 bg-white dark:bg-black/20 rounded-lg backdrop-blur-sm">
            {getModeIndicator(localInstructions)}
          </div>
        </div>
      </div>
    </div>

   

    {/* Communication style presets */}
    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-4">
      <button
        onClick={() => {
          const expertInstructions = "You are an AI assistant that must always show structured reasoning. Follow these steps:\n\n" +
            "[Step 1] Analyze the problem\n" +
            "- Break down the technical requirements\n" + 
            "- Identify constraints and assumptions\n\n" +
            "[Step 2] List key elements\n" +
            "- Core technical components\n" +
            "- Critical dependencies\n" +
            "- Design considerations\n\n" +
            "[Step 3] Apply solution method\n" + 
            "- Present architectural approach\n" +
            "- Provide implementation details\n" +
            "- Include code examples\n\n" +
            "[Step 4] Verify each step\n" +
            "- Review design decisions\n" +
            "- Validate against requirements\n" +
            "- Check edge cases\n\n" +
            "[Response] Final solution\n" +
            "- Complete implementation\n" +
            "- Documentation and comments\n" +
            "- Best practices and optimizations";
          setLocalInstructions(expertInstructions);
          debouncedUpdate(expertInstructions);
          toast.info('Mode raisonnement activé');
        }}
        className={classNames(
          'px-3 py-2.5 text-xs font-semibold rounded-lg transition-all duration-200 shadow-sm hover:shadow-md active:transform active:scale-95',
          'flex items-center justify-center gap-2',
          localInstructions === "You are an AI assistant that must always show structured reasoning. Follow these steps:\n\n[Step 1] Analyze the problem\n- Break down the technical requirements\n- Identify constraints and assumptions\n\n[Step 2] List key elements\n- Core technical components\n- Critical dependencies\n- Design considerations\n\n[Step 3] Apply solution method\n- Present architectural approach\n- Provide implementation details\n- Include code examples\n\n[Step 4] Verify each step\n- Review design decisions\n- Validate against requirements\n- Check edge cases\n\n[Response] Final solution\n- Complete implementation\n- Documentation and comments\n- Best practices and optimizations" ?
            'text-white bg-violet-600 hover:bg-violet-700 ring-2 ring-violet-300 dark:ring-violet-800' :
            'text-violet-700 dark:text-gray-300 bg-violet-100 dark:bg-violet-900/20 hover:bg-violet-200 dark:hover:bg-violet-900/30'
        )}
      >
        <div className="i-ph:code-fill w-3.5 h-3.5" />
        Mode Raisonnement
      </button>
      <button
        onClick={() => {
          const teachingInstructions = "Act as a programming mentor focused on learning and understanding. For each solution: 1) Break down complex concepts into simple, digestible parts 2) Provide step-by-step explanations with clear reasoning 3) Use relevant analogies and real-world examples 4) Include code comments explaining the purpose of each significant block 5) Highlight best practices and common pitfalls 6) Suggest resources for further learning. Guide through the thought process and explain why certain approaches are chosen over others.";
          setLocalInstructions(teachingInstructions);
          debouncedUpdate(teachingInstructions);
          toast.info('Mode pédagogique activé');
        }}
        className={classNames(
          'px-3 py-2.5 text-xs font-semibold rounded-lg transition-all duration-200 shadow-sm hover:shadow-md active:transform active:scale-95',
          'flex items-center justify-center gap-2',
          localInstructions === "Adopts a detailed teaching approach. Breaks down each technical concept into easily understandable elements. Uses relevant analogies and practical examples to illustrate explanations. Guides students gradually through solutions by explaining each decision." ?
            'text-white bg-green-600 hover:bg-green-700 ring-2 ring-green-300 dark:ring-green-800' :
            'text-green-700 dark:text-gray-300 bg-green-100 dark:bg-green-900/20 hover:bg-green-200 dark:hover:bg-green-900/30'
        )}
      >
        <div className="i-ph:student-fill w-3.5 h-3.5" />
        Mode Pédagogique
      </button>
      <button
        onClick={() => {
          const conciseInstructions = "Provide direct and effective answers. Focus on the essentials with optimized code and strategic comments. Prioritize clarity and conciseness while maintaining technical quality.";
          setLocalInstructions(conciseInstructions);
          debouncedUpdate(conciseInstructions);
          toast.info('Mode concis activé');
        }}
        className={classNames(
          'px-3 py-2.5 text-xs font-semibold rounded-lg transition-all duration-200 shadow-sm hover:shadow-md active:transform active:scale-95',
          'flex items-center justify-center gap-2',
          localInstructions === "Provide direct and effective answers. Focus on the essentials with optimized code and strategic comments. Prioritize clarity and conciseness while maintaining technical quality." ?
            'text-white bg-blue-600 hover:bg-blue-700 ring-2 ring-blue-300 dark:ring-blue-800' :
            'text-blue-700 dark:text-gray-300 bg-blue-100 dark:bg-blue-900/20 hover:bg-blue-200 dark:hover:bg-blue-900/30'
        )}
      >
        <div className="i-ph:lightning-fill w-3.5 h-3.5" />
        Mode Concis
      </button>
    </div>

    {/* Domain-specific presets */}
    {/* <div className="mb-4">
      <h4 className="text-xs font-medium text-bolt-elements-textSecondary mb-2 flex items-center gap-1.5">
        <div className="i-ph:code-block-fill w-3.5 h-3.5" />
        Spécialisations techniques
      </h4>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <button
          onClick={() => {
            const webDevInstructions = "Focus on modern web development best practices. Prioritize responsive design, accessibility, and performance optimization. Provide code examples using modern frameworks and explain browser compatibility considerations.";
            setLocalInstructions(webDevInstructions);
            debouncedUpdate(webDevInstructions);
            toast.info('Mode développement web activé');
          }}
          className="px-3 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800/50 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-800 transition-all duration-200 shadow-sm"
        >
          Web Development
        </button>
        <button
          onClick={() => {
            const dataInstructions = "Emphasize data science and machine learning concepts. Provide detailed explanations of algorithms, statistical methods, and model evaluation. Include code examples with popular data science libraries and visualization techniques.";
            setLocalInstructions(dataInstructions);
            debouncedUpdate(dataInstructions);
            toast.info('Mode data science activé');
          }}
          className="px-3 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800/50 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-800 transition-all duration-200 shadow-sm"
        >
          Data Science
        </button>
        <button
          onClick={() => {
            const mobileInstructions = "Focus on mobile app development best practices. Provide platform-specific guidance for iOS and Android. Emphasize UI/UX considerations, performance optimization, and native capabilities.";
            setLocalInstructions(mobileInstructions);
            debouncedUpdate(mobileInstructions);
            toast.info('Mode développement mobile activé');
          }}
          className="px-3 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800/50 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-800 transition-all duration-200 shadow-sm"
        >
          Mobile Development
        </button>
        <button
          onClick={() => {
            const devopsInstructions = "Prioritize DevOps and infrastructure concepts. Explain CI/CD pipelines, containerization, cloud services, and infrastructure as code. Focus on automation, scalability, and security best practices.";
            setLocalInstructions(devopsInstructions);
            debouncedUpdate(devopsInstructions);
            toast.info('Mode DevOps activé');
          }}
          className="px-3 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800/50 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-800 transition-all duration-200 shadow-sm"
        >
          DevOps
        </button>
      </div>
    </div> */}

    {/* Custom instructions textarea */}
    <div className="relative">
      <textarea
        value={localInstructions}
        onChange={handleInstructionChange}
        className={classNames(
          'w-full px-4 py-3 rounded-lg text-sm min-h-[150px] resize-y',
          'bg-white dark:bg-[#0A0A0A]',
          'border border-gray-200 dark:border-gray-800',
          'text-bolt-elements-textPrimary',
          'placeholder-gray-500 dark:placeholder-gray-400',
          'focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500',
          'transition-all duration-200',
          'hover:border-violet-400'
        )}
        placeholder="Personnalisez vos instructions : définissez le style de communication, le niveau de détail technique, et les préférences de formatage du code..."
      />
      <div className="absolute bottom-3 right-3">
        <div className="text-xs text-bolt-elements-textTertiary bg-white dark:bg-[#0A0A0A] px-2 py-1 rounded-md border border-gray-200 dark:border-gray-800">
          {localInstructions.length} caractères
        </div>
      </div>
    </div>

    {/* Info and save indicator */}
    <div className="flex items-center justify-between mt-3">
      <div className="flex items-center gap-2">
        <div className="i-ph:info-fill w-4 h-4 text-violet-500" />
        <p className="text-xs text-bolt-elements-textTertiary">
          Les modifications sont sauvegardées automatiquement après 5 secondes. L'ajout d'instructions détaillées peut augmenter l'utilisation des tokens.
        </p>
      </div>
      <button
        onClick={() => {
          setLocalInstructions("");
          debouncedUpdate("");
          toast.info('Instructions réinitialisées');
        }}
        className="px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/10 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/20 transition-all duration-200"
      >
        Réinitialiser
      </button>
    </div>
  </SettingsItem>
</SettingsSection>
      {/* Langue & Notifications */}
      {/* <SettingsSection icon="i-ph:palette-fill" title="Préférences" delay={0.1}>
        <div className="grid md:grid-cols-2 gap-4">
          <SettingsItem icon="i-ph:translate-fill" label="Langue">
            <select
              value={settings.language}
              onChange={(e) => setSettings((prev) => ({ ...prev, language: e.target.value }))}
              className={classNames(
                'w-full px-4 py-3 rounded-lg text-sm',
                'bg-white dark:bg-[#0A0A0A]',
                'border border-gray-200 dark:border-gray-800',
                'text-bolt-elements-textPrimary',
                'focus:outline-none focus:ring-2 focus:ring-violet-500/30',
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
          </SettingsItem>

          <SettingsItem icon="i-ph:bell-fill" label="Notifications">
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
          </SettingsItem>
        </div>
      </SettingsSection> */}

      {/* Sound Settings */}
      <SettingsSection icon="i-ph:speaker-high-fill" title="Paramètres sonores" delay={0.15}>
        {/* Basic Sound Settings */}
        <div className="grid md:grid-cols-2 gap-4">
          {/* Sound Selection */}
          <SettingsItem icon="i-ph:music-notes-fill" label="Type de son">
            <select
              value={selectedSound}
              onChange={(e) => handleSoundChange(e.target.value)}
              className={classNames(
                'w-full px-4 py-3 rounded-lg text-sm',
                'bg-white dark:bg-[#0A0A0A]',
                'border border-gray-200 dark:border-gray-800',
                'text-bolt-elements-textPrimary',
                'focus:outline-none focus:ring-2 focus:ring-violet-500/30',
                'transition-all duration-200',
              )}
            >
              <option value={NOTIFICATION_SOUNDS.BOLT}>Neurocode (Par défaut)</option>
              <option value={NOTIFICATION_SOUNDS.CHIME}>Carillon</option>
              <option value={NOTIFICATION_SOUNDS.ALERT}>Alerte</option>
            </select>
          </SettingsItem>

          {/* Volume Control */}
          <SettingsItem icon="i-ph:speaker-simple-fill" label="Volume">
            <div className="flex items-center gap-4">
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={chatSoundVolume}
                onChange={(e) => setChatSoundVolume(parseFloat(e.target.value))}
                className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-violet-500"
              />
              <span className="text-sm font-medium text-bolt-elements-textSecondary min-w-[48px] text-center">
                {Math.round(chatSoundVolume * 100)}%
              </span>
              <button
                onClick={playTestSound}
                className="px-4 py-2 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 transition-colors shadow-sm"
              >
                Tester
              </button>
            </div>
          </SettingsItem>
        </div>

        {/* Sound Toggles */}
        <div className="mt-4 grid md:grid-cols-2 gap-4">
          {/* Chat End Sound Settings */}
          <SettingsItem icon="i-ph:bell-simple-fill" label="Son de fin de discussion">
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
          </SettingsItem>

          {/* Alert Sound Settings */}
          <SettingsItem icon="i-ph:warning-fill" label="Son d'alerte">
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
          </SettingsItem>
        </div>
      </SettingsSection>

      {/* Fuseau horaire */}
      <SettingsSection icon="i-ph:clock-fill" title="Paramètres horaires" delay={0.3}>
        <SettingsItem icon="i-ph:globe-fill" label="Fuseau horaire">
          <select
            value={settings.timezone}
            onChange={(e) => setSettings((prev) => ({ ...prev, timezone: e.target.value }))}
            className={classNames(
              'w-full px-4 py-3 rounded-lg text-sm',
              'bg-white dark:bg-[#0A0A0A]',
              'border border-gray-200 dark:border-gray-800',
              'text-bolt-elements-textPrimary',
              'focus:outline-none focus:ring-2 focus:ring-violet-500/30',
              'transition-all duration-200',
            )}
          >
            <option value={currentTimezone}>{currentTimezone}</option>
          </select>
        </SettingsItem>
      </SettingsSection>

      {/* Raccourcis clavier simplifiés */}
      <SettingsSection icon="i-ph:keyboard-fill" title="Raccourcis clavier" delay={0.35}>
        <div className="bg-gray-50 dark:bg-[#111111] rounded-xl p-5 transition-all hover:bg-gray-100 dark:hover:bg-[#151515]">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="i-ph:palette-fill w-5 h-5 text-violet-500" />
              <div>
                <p className="text-sm font-medium text-bolt-elements-textPrimary">Changer de thème</p>
                <p className="text-xs text-bolt-elements-textSecondary mt-1">Basculer entre le mode clair et sombre</p>
              </div>
            </div>
            <div className="flex items-center gap-1 mt-2 sm:mt-0">
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
      </SettingsSection>
    </div>
  );
}

// Define constants for instruction modes
const INSTRUCTION_MODES = {
  EXPERT: "As a senior technical expert, provide in-depth explanations and optimized solutions. Your code must adhere to best practices with clear documentation and a robust architecture. Focus on performance, maintainability, and advanced design patterns.",
  TEACHING: "Adopts a detailed teaching approach. Breaks down each technical concept into easily understandable elements. Uses relevant analogies and practical examples to illustrate explanations. Guides students gradually through solutions by explaining each decision.",
  CONCISE: "Provide direct and effective answers. Focus on the essentials with optimized code and strategic comments. Prioritize clarity and conciseness while maintaining technical quality.",
};

// Function to get mode indicator
const getModeIndicator = (instructions: string) => {
  switch (instructions) {
    case INSTRUCTION_MODES.EXPERT:
      return (
        <span className="flex items-center gap-2 text-sm">
          <span className="w-2.5 h-2.5 rounded-full bg-violet-500 ring-4 ring-violet-500/20"></span>
          <span className="font-medium text-violet-700 dark:text-violet-400">Mode Rraisonnement</span>
        </span>
      );
    case INSTRUCTION_MODES.TEACHING:
      return (
        <span className="flex items-center gap-2 text-sm">
          <span className="w-2.5 h-2.5 rounded-full bg-green-500 ring-4 ring-green-500/20"></span>
          <span className="font-medium text-green-700 dark:text-green-400">Mode Pédagogique</span>
        </span>
      );
    case INSTRUCTION_MODES.CONCISE:
      return (
        <span className="flex items-center gap-2 text-sm">
          <span className="w-2.5 h-2.5 rounded-full bg-blue-500 ring-4 ring-blue-500/20"></span>
          <span className="font-medium text-blue-700 dark:text-blue-400">Mode Concis</span>
        </span>
      );
    default:
      return (
        <span className="flex items-center gap-2 text-sm">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-500 ring-4 ring-amber-500/20"></span>
          <span className="font-medium text-amber-700 dark:text-amber-400">Mode Personnalisé</span>
        </span>
      );
  }
};
