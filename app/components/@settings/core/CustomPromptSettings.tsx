// app/components/@settings/core/CustomPromptSettings.tsx
import { useState, useEffect, useCallback, useRef } from 'react';
import { useStore } from '@nanostores/react';
import { promptStore } from '~/lib/stores/promptStore';
import { Textarea } from '~/components/ui/Textarea';
import { Button } from '~/components/ui/Button';
import { toast } from 'react-toastify';
import { Switch } from '~/components/ui/Switch';
import { Label } from '~/components/ui/Label';
import { motion } from 'framer-motion';
import { Input } from '~/components/ui/Input';
import { Card } from '~/components/ui/Card';
import { useCharacterCount } from '~/lib/hooks/useCharacterCount';

interface Variable {
  name: string;
  description: string;
}

interface ToastConfig {
  position: 'bottom-right';
  duration: number;
  description?: string;
}

// const DEFAULT_AUTO_SAVE_DELAY = 1000; // 5 seconds
const MAX_CHARACTER_COUNT = 30000;
const FORBIDDEN_PATTERNS = [
  /<[^>]+>/, // HTML tags
  /javascript:/i, // JavaScript URLs
  /on\w+="[^"]*"/i, // Event handlers
  /eval\(/i, // eval function
  /document\./i, // Document object access
  /window\./i, // Window object access
  /<script.*?>.*?<\/script>/is, // Script tags
  /<\?php/i, // PHP code
  /<\?=/i,   // PHP short tags
  /<\?/i,    // PHP tags
  /sql\s*=/i, // SQL injection patterns
  /union\s+select/i, // SQL injection
  /--\s+/i,  // SQL comments
  /\/\*.*?\*\//s, // SQL block comments
  /<iframe/i, // iframe tags
  /<style.*?>.*?<\/style>/is // Style tags
];

const TOAST_CONFIG: ToastConfig = {
  position: 'bottom-right',
  duration: 3000
};

const MESSAGES = {
  SAVE_SUCCESS: 'Invite personnalisée enregistrée avec succès',
  RESET_SUCCESS: 'Invite personnalisée réinitialisée',
  AUTO_SAVE_DISABLED: 'Enregistrement automatique désactivé',
  AUTO_SAVE_ENABLED: (delay: number) => 
    `Les modifications seront sauvegardées automatiquement après ${delay} secondes`
};

interface CustomPromptSettingsProps {
  open: boolean;
  onClose: () => void;
}

export const CustomPromptSettings = ({ open, onClose }: CustomPromptSettingsProps) => {
  const customPrompt = useStore(promptStore);
  const [prompt, setPrompt] = useState(customPrompt);
  const [isModified, setIsModified] = useState(false);
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(true);
  // const [autoSaveDelay] = useState(DEFAULT_AUTO_SAVE_DELAY);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isFocused, setIsFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [characterCount, updateCharacterCount] = useCharacterCount(prompt);

  useEffect(() => {
    setIsModified(prompt !== customPrompt);
  }, [prompt, customPrompt]);

  const validatePrompt = useCallback((value: string): { valid: boolean; message?: string } => {
    const trimmedValue = value.trim();

    if (trimmedValue.length > MAX_CHARACTER_COUNT) {
      return {
        valid: false,
        message: `Le prompt ne peut pas dépasser ${MAX_CHARACTER_COUNT} caractères`
      };
    }

    for (const pattern of FORBIDDEN_PATTERNS) {
      if (pattern.test(trimmedValue)) {
        return {
          valid: false,
          message: 'Le prompt contient des éléments non autorisés'
        };
      }
    }

    return { valid: true };
  }, []);

  const handleSave = useCallback(() => {
    const validation = validatePrompt(prompt);
    if (!validation.valid) {
      toast(validation.message || 'Erreur de validation', TOAST_CONFIG);
      return;
    }

    try {
      const cleanedPrompt = prompt.replace(/\\"/g, '"').trim();
      promptStore.set(cleanedPrompt);
      toast(MESSAGES.SAVE_SUCCESS, TOAST_CONFIG);
      setIsModified(false);
    } catch (error) {
      if (error instanceof Error) {
        toast(error.message, TOAST_CONFIG);
      }
    }
  }, [prompt, validatePrompt]);

  const handleReset = useCallback(() => {
    setPrompt('');
    promptStore.set('');
    toast.info(MESSAGES.RESET_SUCCESS, TOAST_CONFIG);
    setIsModified(false);
  }, []);

  const clearSaveTimeout = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
  }, []);

  const handleTextareaChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    const validation = validatePrompt(newValue);

    if (!validation.valid) {
      toast(validation.message || 'Erreur de validation', TOAST_CONFIG);
      return;
    }

    setPrompt(newValue);
    updateCharacterCount(newValue);

    // if (autoSaveEnabled) {
    //   clearSaveTimeout();
    //   saveTimeoutRef.current = setTimeout(() => {
    //     handleSave();
    //     // toast('Enregistrement automatique réussi', {
    //     //   ...TOAST_CONFIG,
    //     //   description: MESSAGES.AUTO_SAVE_ENABLED(autoSaveDelay / 1000)
    //     // });
    //   }, autoSaveDelay);
    // }
  // }, [autoSaveEnabled, autoSaveDelay, handleSave, validatePrompt, clearSaveTimeout, updateCharacterCount]);

  // const handleAutoSaveToggle = (checked: boolean) => {
  //   setAutoSaveEnabled(checked);
  //   if (!checked && saveTimeoutRef.current) {
  //     clearSaveTimeout();
  //     toast.info(MESSAGES.AUTO_SAVE_DISABLED, TOAST_CONFIG);
  //   } else if (checked) {
  //     toast(MESSAGES.AUTO_SAVE_ENABLED(autoSaveDelay), TOAST_CONFIG);
  //   }
   }, []);

  const handleFocus = () => {
    setIsFocused(true);
  };

  const handleBlur = () => {
    setIsFocused(false);
    clearSaveTimeout();
  };

  const insertVariable = (variable: string) => {
    if (!textareaRef.current) return;
    
    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    
    setPrompt(
      prompt.substring(0, start) + 
      variable + 
      prompt.substring(end)
    );
    
    // Focus et positionnement du curseur
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(start + variable.length, start + variable.length);
    });
  };

  useEffect(() => {
    return () => {
      clearSaveTimeout();
    };
  }, [clearSaveTimeout]);
  useEffect(() => {
    console.log('Prompt Store Updated:', customPrompt);
  }, [customPrompt]);
  
  useEffect(() => {
    console.log('Local Prompt Updated:', prompt);
  }, [prompt]);
  return (
    <motion.div 
      className="space-y-6 mx-auto max-h-[85vh] overflow-y-auto"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card className="p-8 shadow-xl bg-bolt-elements-background-depth-1 border border-bolt-elements-border/50">
        <div className="flex items-center justify-between border-b border-bolt-elements-border/30 pb-6 mb-8">
          <div>
            <h2 className="text-2xl font-bold text-bolt-elements-textPrimary flex items-center gap-3">
              <div className="i-ph:terminal-window w-7 h-7 text-green-500" />
              Instructions personnalisées
            </h2>
            <p className="text-base text-bolt-elements-textSecondary/80 mt-2 max-w-2xl">
              Personnalisez les réponses de l'assistant pour ce projet. Définissez des instructions spécifiques pour guider l'assistant dans son analyse et ses réponses.
            </p>
          </div>
          {/* <Button 
            onClick={onClose}
            variant="ghost" 
            className="hover:bg-bolt-elements-background-depth-2"
            size="icon"
            aria-label="Fermer les paramètres d'instructions personnalisées"
          >
            <div className="i-ph:x w-6 h-6" />
          </Button> */}
        </div>

        <div className="space-y-8">
          <div className="space-y-4">
            <Label className="text-base font-medium text-bolt-elements-textPrimary flex items-center gap-2">
              <div className="i-ph:textbox w-5 h-5 text-green-500" />
              Instructions personnalisées
            </Label>
            <div className="relative">
              <Textarea
                ref={textareaRef}
                value={prompt}
                onChange={handleTextareaChange}
                onFocus={handleFocus}
                onBlur={handleBlur}
                placeholder="Entrez vos instructions personnalisées ici..."
                rows={12}
                className="text-bolt-elements-textPrimary min-h-[300px] w-full bg-bolt-elements-background-depth-2 border-bolt-elements-border/30 focus:ring-green-500 focus:border-green-500 placeholder:text-bolt-elements-textSecondary/50 text-base p-4"
                aria-label="Zone de texte pour les instructions personnalisées"
                aria-describedby="character-count"
              />
              <div 
                id="character-count"
                className={`absolute bottom-4 right-4 text-sm px-3 py-1.5 rounded-full backdrop-blur-sm ${
                  characterCount > MAX_CHARACTER_COUNT 
                    ? 'text-red-500 bg-red-500/10' 
                    : 'text-bolt-elements-textSecondary/80 bg-bolt-elements-background-depth-3/50'
                } transition-opacity duration-200 ${
                  isFocused || characterCount > 0 ? 'opacity-100' : 'opacity-0'
                }`}
                aria-live="polite"
              >
                {characterCount}/{MAX_CHARACTER_COUNT}
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-4 justify-end pt-6 border-t border-bolt-elements-border/30 mt-8">
          <Button 
            onClick={handleReset}
            variant="outline"
            size="lg"
            className="text-bolt-elements-textPrimary border-bolt-elements-border/30"
            aria-label="Réinitialiser les instructions personnalisées"
          >
            <div className="i-ph:arrow-counter-clockwise w-5 h-5 mr-2" />
            Réinitialiser
          </Button>
          <Button 
            onClick={() => {
              handleSave();
              onClose();
            }}
            disabled={!isModified}
            size="lg"
            className="bg-green-500 text-white min-w-[150px] hover:bg-green-600 transition-colors"
            aria-label="Enregistrer les instructions personnalisées"
          >
            <div className="i-ph:floppy-disk w-5 h-5 mr-2" />
            Enregistrer
          </Button>
        </div>
      </Card>
    </motion.div>
  );
};