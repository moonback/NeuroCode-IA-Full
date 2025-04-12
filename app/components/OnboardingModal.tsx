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
  // 'demo',
  'completion',
] as const;

type Step = typeof STEPS[number];

const slideAnimation = {
  initial: { opacity: 0, x: 20, scale: 0.95 },
  animate: { opacity: 1, x: 0, scale: 1 },
  exit: { opacity: 0, x: -20, scale: 0.95 },
  transition: { type: 'spring', damping: 25, stiffness: 350 }
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

  // Calculate progress percentage
  const progress = ((STEPS.indexOf(currentStep) + 1) / STEPS.length) * 100;

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
            'w-[90vw] max-w-[1200px] max-h-[95vh] overflow-y-auto',
            'bg-gradient-to-br from-white/90 via-white/95 to-gray-50/90 dark:from-gray-900/90 dark:via-gray-900/95 dark:to-gray-800/90 rounded-xl shadow-2xl',
            'border border-white/20 dark:border-gray-700/30 backdrop-blur-xl',
            'focus:outline-none transform-gpu',
            'data-[state=open]:animate-content-show',
          )}
        >
          {/* Progress bar */}
          <div className="w-full h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full">
            <motion.div 
              className="h-full bg-gradient-to-r from-violet-500 to-violet-500 rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
            />
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial="initial"
              animate="animate"
              exit="exit"
              variants={slideAnimation}
              className="p-8" // Increased padding
            >
              {currentStep === 'welcome' && (
<div className="text-center space-y-8">
  <div className="relative">
    <h1 className="text-6xl font-black bg-gradient-to-r from-violet-600 via-purple-500 to-blue-500 bg-clip-text text-transparent animate-gradient transition-all duration-500 hover:scale-105">
      Créez, codez et innovez avec l'IA dès maintenant !
    </h1>
    <div className="absolute -inset-1 bg-gradient-to-r from-violet-600/20 via-purple-500/20 to-blue-500/20 blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
  </div>

  <p className="text-2xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto leading-relaxed font-medium">
    NeuroCode est votre assistant de développement intelligent qui révolutionne votre façon de coder. 
    <span className="text-violet-600 dark:text-violet-400"> Découvrez une nouvelle ère de productivité et d'innovation.</span>
  </p>

  <div className="flex justify-center gap-6 pt-4">
    <button
      onClick={handleNext}
      className="group relative px-10 py-4 bg-gradient-to-r from-violet-600 via-purple-500 to-blue-500 text-white rounded-full font-bold text-xl hover:shadow-2xl hover:scale-105 transform-gpu transition-all duration-300 ease-out overflow-hidden"
    >
      <div className="absolute inset-0 bg-white/20 transform scale-x-0 group-hover:scale-x-100 transition-transform origin-left duration-300" />
      <span className="flex items-center gap-3 relative z-10">
        Commencer l'aventure
        <div className="w-6 h-6 i-ph:arrow-right group-hover:translate-x-2 transition-transform duration-300" />
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
        className="w-24 h-24 mx-auto mb-6 rounded-full bg-gradient-to-r from-violet-600 to-blue-500 flex items-center justify-center"
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

    <div className="bg-gray-50 dark:bg-gray-800 p-6 rounded-lg">
      <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-3">
        Première chose à faire :
      </h3>
      <div className="space-y-4">
        <div>
          <h4 className="font-medium text-gray-800 dark:text-gray-200">
            Configuration des clés API et des fournisseurs
          </h4>
          <p className="text-gray-600 dark:text-gray-400">
            Ajout de vos clés API
          </p>
        </div>
        <div className="bg-white dark:bg-gray-700 p-4 rounded-md border border-gray-200 dark:border-gray-600">
          <p className="text-gray-700 dark:text-gray-300">
            La configuration de vos clés API dans NeuroCode est simple :
          </p>
          <ol className="list-decimal pl-5 mt-2 space-y-2 text-gray-700 dark:text-gray-300">
            <li>Ouvrir la page d'accueil (interface principale)</li>
            <li>Sélectionnez le fournisseur souhaité dans le menu déroulant</li>
            <li>Cliquez sur l'icône crayon (modifier)</li>
            <li>Saisissez votre clé API dans le champ de saisie sécurisé</li>
          </ol>
        </div>
      </div>
    </div>

    <button
      onClick={onClose}
      className="w-full px-6 py-3 bg-violet-600 text-white rounded-full font-medium hover:bg-violet-700 transition-colors"
    >
      Accéder à l'éditeur
    </button>
  </div>
)}
              

              {/* {currentStep === 'demo' && (
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
                      className="px-6 py-3 bg-violet-600 text-white rounded-full font-medium hover:bg-violet-700 transition-colors"
                    >
                      Je teste moi-même
                    </button>
                    
                  </div>
                </div>
              )} */}

              
              {currentStep === 'features' && (
<div className="space-y-12">
  <div className="text-center">
    <h2 className="text-4xl font-extrabold bg-gradient-to-r from-violet-600 to-blue-500 bg-clip-text text-transparent mb-4">
      Découvrez la puissance de NeuroCode
    </h2>
    <p className="text-xl text-gray-600 dark:text-gray-400 max-w-3xl mx-auto leading-relaxed">
      Une suite complète d'outils intelligents pour transformer votre workflow de développement
    </p>
  </div>
  
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
    {[
      {
        icon: 'i-ph:code',
        color: 'violet',
        title: 'Éditeur de code avancé',
        description: 'Syntaxe intelligente, auto-complétion et refactoring assisté pour une productivité maximale.'
      },
      {
        icon: 'i-ph:brain',
        color: 'violet',
        title: 'LLM Intégré',
        description: 'Générez, corrigez et optimisez votre code avec l\'IA directement dans l\'éditeur.'
      },
      {
        icon: 'i-ph:play',
        color: 'violet',
        title: 'Exécution en direct',
        description: 'Testez votre code directement dans le navigateur avec un environnement d\'exécution intégré.'
      },
      {
        icon: 'i-ph:triangle',
        color: 'violet',
        title: 'Déploiement Vercel',
        description: 'Déployez vos applications en un clic sur Vercel avec une configuration automatisée.'
      },
      {
        icon: 'i-ph:cloud-arrow-up',
        color: 'violet',
        title: 'Déploiement Netlify',
        description: 'Publiez directement sur Netlify avec une intégration continue et des aperçus de déploiement.'
      },
      {
        icon: 'i-ph:database',
        color: 'violet',
        title: 'Intégration Supabase',
        description: 'Stockez et gérez vos données en toute sécurité avec une intégration complète de Supabase.'
      },
    ].map((feature, index) => (
      <motion.div
        key={feature.title}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.1, duration: 0.4 }}
        className="group relative p-8 rounded-2xl bg-white/90 dark:bg-gray-800/90 shadow-xl hover:shadow-2xl hover:scale-[1.03] backdrop-blur-lg transition-all duration-300"
      >
        <div className="absolute inset-0 bg-gradient-to-br from-white/50 to-transparent dark:from-gray-700/50 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        <div className="relative">
          <div className={`p-4 rounded-xl bg-${feature.color}-100 dark:bg-${feature.color}-900/30 w-fit mb-6 group-hover:scale-110 transition-transform duration-300`}>
            <div className={`w-8 h-8 text-${feature.color}-600 dark:text-${feature.color}-400 ${feature.icon}`} />
          </div>
          <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3 group-hover:text-violet-600 dark:group-hover:text-violet-400 transition-colors">
            {feature.title}
          </h3>
          <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
            {feature.description}
          </p>
        </div>
      </motion.div>
    ))}
  </div>

  <div className="flex justify-center mt-12">
    <button
      onClick={handleNext}
      className="group relative px-10 py-4 bg-gradient-to-r from-violet-600 to-blue-500 text-white rounded-full font-bold text-lg hover:shadow-2xl hover:scale-105 transform-gpu transition-all duration-300"
    >
      <div className="absolute inset-0 bg-white/20 rounded-full transform scale-x-0 group-hover:scale-x-100 transition-transform origin-left duration-300" />
      <span className="flex items-center gap-3 relative z-10">
        Continuer
        <div className="w-6 h-6 i-ph:arrow-right group-hover:translate-x-2 transition-transform duration-300" />
      </span>
    </button>
  </div>
</div>
              )}



              {/* Navigation buttons - updated style */}
              <div className="mt-12 flex justify-between items-center">
                {currentStep !== 'welcome' ? (
                  <button
                    onClick={handleBack}
                    className="flex items-center bg-bolt-elements-background-depth-2 gap-2 px-5 py-2.5 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
                  >
                    <div className="w-5 h-5 i-ph:arrow-left" />
                    Retour
                  </button>
                ) : (
                  <div />
                )}
                
                <button
                  onClick={handleSkip}
                  className="px-5 py-2.5 bg-white/10 dark:bg-gray-800/30 backdrop-blur-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-lg hover:bg-white/20 dark:hover:bg-gray-700/40 transition-all duration-300"
                >
                  Passer le tutoriel
                </button>
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Close button - updated position */}
          <Dialog.Close
            className={classNames(
              'absolute top-6 right-6',
              'w-10 h-10 rounded-full flex items-center justify-center',
              'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200',
              'bg-white/80 dark:bg-gray-800/80 hover:bg-gray-100 dark:hover:bg-gray-700',
              'transition-all shadow-md hover:shadow-lg',
              'border border-gray-200 dark:border-gray-700',
              'focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-opacity-50',
            )}
            aria-label="Fermer"
            onClick={() => {
              savePreferences();
              onClose();
            }}
          >
            <div className="w-5 h-5 i-ph:x" />
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}



