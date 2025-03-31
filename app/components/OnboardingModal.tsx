import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as Dialog from '@radix-ui/react-dialog';
import { classNames } from '~/utils/classNames';
import { Switch } from '@radix-ui/react-switch';

interface OnboardingModalProps {
  open: boolean;
  onClose: () => void;
}

interface UserPreferences {
  integrations: string[];
}

const STEPS = [
  'welcome',
  'features',
  'demo',
  'completion',
] as const;

type Step = typeof STEPS[number];

const slideAnimation = {
  initial: { opacity: 0, x: 20 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -20 },
};

export function OnboardingModal({ open, onClose }: OnboardingModalProps) {
  const [currentStep, setCurrentStep] = useState<Step>('welcome');
  const [preferences, setPreferences] = useState<UserPreferences>(() => {
    // Récupérer les préférences sauvegardées si elles existent
    if (typeof window !== 'undefined') {
      const savedPrefs = localStorage.getItem('neurocode_preferences');
      return savedPrefs ? JSON.parse(savedPrefs) : { integrations: [] };
    }
    return { integrations: [] };
  });

  const handleNext = () => {
    const currentIndex = STEPS.indexOf(currentStep);
    if (currentIndex < STEPS.length - 1) {
      setCurrentStep(STEPS[currentIndex + 1]);
    } else {
      // Sauvegarder les préférences avant de fermer
      savePreferences();
      onClose();
    }
  };
  
  // Effet pour sauvegarder les préférences lorsqu'elles sont modifiées
  useEffect(() => {
    if (open) {
      savePreferences();
    }
  }, [preferences, open]);

  const handleBack = () => {
    const currentIndex = STEPS.indexOf(currentStep);
    if (currentIndex > 0) {
      setCurrentStep(STEPS[currentIndex - 1]);
    }
  };

  const handleSkip = () => {
    // Sauvegarder les préférences avant de fermer
    savePreferences();
    onClose();
  };
  
  // Fonction pour sauvegarder les préférences utilisateur
  const savePreferences = () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('neurocode_preferences', JSON.stringify(preferences));
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onClose}>
      <Dialog.Portal>
        <Dialog.Overlay
          className={classNames(
            'fixed inset-0 bg-black/50 backdrop-blur-sm z-[9999]',
            'data-[state=open]:animate-overlay-show',
          )}
        />
        <Dialog.Content
          className={classNames(
            'fixed top-[50%] left-[50%] translate-x-[-50%] translate-y-[-50%] z-[9999]',
            'w-[90vw] max-w-[800px] max-h-[85vh] overflow-y-auto',
            'bg-white dark:bg-gray-900 rounded-xl shadow-xl',
            'focus:outline-none',
            'data-[state=open]:animate-content-show',
          )}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial="initial"
              animate="animate"
              exit="exit"
              variants={slideAnimation}
              transition={{ duration: 0.2 }}
              className="p-6"
            >
              {currentStep === 'welcome' && (
                <div className="text-center space-y-6">
                  <h1 className="text-5xl font-extrabold bg-gradient-to-r from-purple-600 via-pink-500 to-blue-500 bg-clip-text text-transparent animate-gradient transition-all duration-500 hover:scale-105 hover:shadow-lg">
                    Créez, codez et innovez avec l'IA dès maintenant !
                  </h1>
                  <p className="text-xl text-gray-600 dark:text-gray-300 max-w-2xl mx-auto leading-relaxed">
                    NeuroCode est votre assistant de développement intelligent qui révolutionne votre façon de coder. Découvrez une nouvelle ère de productivité et d'innovation.
                  </p>
                  <div className="flex justify-center gap-4">
                    <button
                      onClick={handleNext}
                      className="group px-8 py-4 bg-gradient-to-r from-purple-600 to-blue-500 text-white rounded-full font-semibold text-lg hover:shadow-lg hover:scale-105 transition-all duration-300"
                    >
                      <span className="flex items-center gap-2">
                        Commencer
                        <div className="w-5 h-5 i-ph:arrow-right group-hover:translate-x-1 transition-transform" />
                      </span>
                    </button>
                  </div>
                </div>
              )}

              {currentStep === 'completion' && (
                <div className="space-y-8">
                  <div className="text-center">
                    <motion.div
                      initial={{ scale: 0.5, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ duration: 0.5 }}
                      className="w-24 h-24 mx-auto mb-6 rounded-full bg-gradient-to-r from-purple-600 to-blue-500 flex items-center justify-center"
                    >
                      <div className="w-12 h-12 text-white i-ph:check-bold" />
                    </motion.div>
                    
                    <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
                      Bienvenue dans NeuroCode
                    </h2>
                    <p className="text-lg text-gray-600 dark:text-gray-300">
                      L'IA est prête à vous accompagner dans votre code !
                    </p>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
                          <div className="w-6 h-6 text-purple-600 dark:text-purple-400 i-ph:keyboard" />
                        </div>
                        <div>
                          <h3 className="font-medium text-gray-900 dark:text-white">Raccourcis clavier</h3>
                          <p className="text-sm text-gray-600 dark:text-gray-300">Activez les raccourcis pour coder plus rapidement</p>
                        </div>
                      </div>
                      <Switch
                        checked={preferences.integrations.includes('shortcuts')}
                        onCheckedChange={(checked) => {
                          setPreferences(prev => ({
                            ...prev,
                            integrations: checked
                              ? [...prev.integrations, 'shortcuts']
                              : prev.integrations.filter(i => i !== 'shortcuts')
                          }));
                        }}
                      />
                    </div>

                    <div className="flex items-center justify-between p-4 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                          <div className="w-6 h-6 text-blue-600 dark:text-blue-400 i-ph:info" />
                        </div>
                        <div>
                          <h3 className="font-medium text-gray-900 dark:text-white">Astuces en direct</h3>
                          <p className="text-sm text-gray-600 dark:text-gray-300">Afficher des conseils contextuels pendant le codage</p>
                        </div>
                      </div>
                      <Switch
                        checked={preferences.integrations.includes('tips')}
                        onCheckedChange={(checked) => {
                          setPreferences(prev => ({
                            ...prev,
                            integrations: checked
                              ? [...prev.integrations, 'tips']
                              : prev.integrations.filter(i => i !== 'tips')
                          }));
                        }}
                      />
                    </div>
                  </div>

                  <button
                    onClick={onClose}
                    className="w-full px-6 py-3 bg-purple-600 text-white rounded-full font-medium hover:bg-purple-700 transition-colors"
                  >
                    Accéder à l'éditeur
                  </button>
                </div>
              )}

              {currentStep === 'demo' && (
                <div className="space-y-8">
                  <h2 className="text-2xl font-semibold text-center text-gray-900 dark:text-white">
                    Voyez NeuroCode en action
                  </h2>
                  
                  <div className="relative aspect-video rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800">
                    <video
                      className="w-full h-full object-cover"
                      autoPlay
                      loop
                      muted
                      playsInline
                    >
                      <source src="/demo.mp4" type="video/mp4" />
                    </video>
                  </div>

                  <div className="flex justify-center gap-4">
                    <button
                      onClick={handleNext}
                      className="px-6 py-3 bg-purple-600 text-white rounded-full font-medium hover:bg-purple-700 transition-colors"
                    >
                      Je teste moi-même
                    </button>
                    <button
                      onClick={handleSkip}
                      className="px-6 py-3 border border-gray-200 dark:border-gray-700 rounded-full font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    >
                      Passer
                    </button>
                  </div>
                </div>
              )}

              
              {currentStep === 'features' && (
                <div className="space-y-8">
                  <h2 className="text-2xl font-semibold text-center text-gray-900 dark:text-white">
                    Découvrez la puissance de NeuroCode
                  </h2>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Éditeur de code avancé */}
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 }}
                      className="p-6 rounded-xl bg-white dark:bg-gray-800 shadow-lg hover:shadow-xl transition-shadow"
                    >
                      <div className="flex items-center gap-4 mb-4">
                        <div className="p-3 rounded-lg bg-purple-100 dark:bg-purple-900/30">
                          <div className="w-6 h-6 text-purple-600 dark:text-purple-400 i-ph:code" />
                        </div>
                        <h3 className="text-lg font-medium text-gray-900 dark:text-white">Éditeur de code avancé</h3>
                      </div>
                      <p className="text-gray-600 dark:text-gray-300">
                        Syntaxe intelligente, auto-complétion et refactoring assisté pour une productivité maximale.
                      </p>
                    </motion.div>

                    {/* LLM Intégré */}
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 }}
                      className="p-6 rounded-xl bg-white dark:bg-gray-800 shadow-lg hover:shadow-xl transition-shadow"
                    >
                      <div className="flex items-center gap-4 mb-4">
                        <div className="p-3 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                          <div className="w-6 h-6 text-blue-600 dark:text-blue-400 i-ph:brain" />
                        </div>
                        <h3 className="text-lg font-medium text-gray-900 dark:text-white">LLM Intégré</h3>
                      </div>
                      <p className="text-gray-600 dark:text-gray-300">
                        Générez, corrigez et optimisez votre code avec l'IA directement dans l'éditeur.
                      </p>
                    </motion.div>

                    {/* Exécution en direct */}
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3 }}
                      className="p-6 rounded-xl bg-white dark:bg-gray-800 shadow-lg hover:shadow-xl transition-shadow"
                    >
                      <div className="flex items-center gap-4 mb-4">
                        <div className="p-3 rounded-lg bg-green-100 dark:bg-green-900/30">
                          <div className="w-6 h-6 text-green-600 dark:text-green-400 i-ph:play" />
                        </div>
                        <h3 className="text-lg font-medium text-gray-900 dark:text-white">Exécution en direct</h3>
                      </div>
                      <p className="text-gray-600 dark:text-gray-300">
                        Testez votre code directement dans le navigateur avec un environnement d'exécution intégré.
                      </p>
                    </motion.div>

                    {/* Gestion de projets et Git */}
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.4 }}
                      className="p-6 rounded-xl bg-white dark:bg-gray-800 shadow-lg hover:shadow-xl transition-shadow"
                    >
                      <div className="flex items-center gap-4 mb-4">
                        <div className="p-3 rounded-lg bg-orange-100 dark:bg-orange-900/30">
                          <div className="w-6 h-6 text-orange-600 dark:text-orange-400 i-ph:git-branch" />
                        </div>
                        <h3 className="text-lg font-medium text-gray-900 dark:text-white">Gestion de projets et Git</h3>
                      </div>
                      <p className="text-gray-600 dark:text-gray-300">
                        Importation, versioning et restauration rapide de vos projets avec intégration Git native.
                      </p>
                    </motion.div>
                  </div>

                  <div className="flex justify-center mt-8">
                    <button
                      onClick={handleNext}
                      className="px-6 py-3 bg-purple-600 text-white rounded-full font-medium hover:bg-purple-700 transition-colors"
                    >
                      Continuer
                    </button>
                  </div>
                </div>
              )}



              {/* Navigation buttons */}
              <div className="mt-8 flex justify-between items-center">
                {currentStep !== 'welcome' && (
                  <button
                    onClick={handleBack}
                    className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
                  >
                    Retour
                  </button>
                )}
                <button
                  onClick={handleSkip}
                  className="px-4 py-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
                >
                  Passer
                </button>
              </div>

              {/* Close button */}
              <Dialog.Close
                className={classNames(
                  'absolute top-4 right-4',
                  'w-8 h-8 rounded-full flex items-center justify-center',
                  'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200',
                  'bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700',
                  'transition-all shadow-sm hover:shadow',
                  'focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-opacity-50',
                )}
                aria-label="Fermer"
                onClick={() => {
                  savePreferences();
                  onClose();
                }}
              >
                ×
              </Dialog.Close>
            </motion.div>
          </AnimatePresence>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
