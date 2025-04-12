import React, { memo, useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Switch } from '~/components/ui/Switch';
import { useSettings } from '~/lib/hooks/useSettings';
import { classNames } from '~/utils/classNames';
import { toast } from 'react-toastify';
import { PromptLibrary } from '~/lib/common/prompt-library';

interface FeatureToggle {
  id: string;
  title: string;
  description: string;
  icon: string;
  enabled: boolean;
  beta?: boolean;
  experimental?: boolean;
  tooltip?: string;
}

const FeatureCard = memo(
  ({
    feature,
    index,
    onToggle,
  }: {
    feature: FeatureToggle;
    index: number;
    onToggle: (id: string, enabled: boolean) => void;
  }) => {
    const [isHovered, setIsHovered] = useState(false);
    
    return (
      <motion.div
        key={feature.id}
        layoutId={feature.id}
        className={classNames(
          'relative group',
          'bg-bolt-elements-background-depth-1',
          'hover:bg-bolt-elements-background-depth-2',
          'transition-all duration-300 ease-out',
          'rounded-xl overflow-hidden',
          'shadow-md hover:shadow-lg',
          'border border-bolt-elements-borderColor/20 hover:border-bolt-elements-borderColor/50',
        )}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        whileHover={{ y: -4 }}
        transition={{ delay: index * 0.05, type: 'spring', stiffness: 100 }}
        onHoverStart={() => setIsHovered(true)}
        onHoverEnd={() => setIsHovered(false)}
      >
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={classNames(
                feature.icon, 
                'w-10 h-10 p-2 rounded-xl',
                'text-white',
                'bg-gradient-to-br from-violet-400 to-violet-600',
                'shadow-md'
              )} />
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <h4 className="font-semibold text-lg text-bolt-elements-textPrimary group-hover:text-violet-500 transition-colors">
                    {feature.title}
                  </h4>
                  {feature.beta && (
                    <span className="px-3 py-1 text-xs rounded-full bg-blue-500/10 text-blue-500 font-semibold shadow-sm">
                      Bêta
                    </span>
                  )}
                  {feature.experimental && (
                    <span className="px-3 py-1 text-xs rounded-full bg-orange-500/10 text-orange-500 font-semibold shadow-sm">
                      Expérimental
                    </span>
                  )}
                </div>
              </div>
            </div>
            <Switch 
              checked={feature.enabled} 
              onCheckedChange={(checked) => onToggle(feature.id, checked)}
              className="data-[state=checked]:bg-violet-500 data-[state=unchecked]:bg-bolt-elements-borderColor/50"
            />
          </div>
          <p className="text-sm text-bolt-elements-textSecondary leading-relaxed group-hover:text-bolt-elements-textPrimary transition-colors">
            {feature.description}
          </p>
          
          <AnimatePresence>
            {feature.tooltip && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: isHovered ? 1 : 0, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="flex items-start gap-2 mt-2 p-3 rounded-lg bg-bolt-elements-background-depth-3">
                  <div className="i-ph:info text-violet-400 w-4 h-4 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-bolt-elements-textSecondary/90">
                    {feature.tooltip}
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    );
  }
);

const FeatureSection = memo(
  ({
    title,
    features,
    icon,
    description,
    onToggleFeature,
  }: {
    title: string;
    features: FeatureToggle[];
    icon: string;
    description: string;
    onToggleFeature: (id: string, enabled: boolean) => void;
  }) => (
    <motion.div
      layout
      className="flex flex-col gap-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, type: 'spring' }}
    >
      <div className="flex items-start gap-4 border-b border-bolt-elements-borderColor/10 pb-4">
        <div className={classNames(
          icon, 
          'text-2xl p-3 rounded-lg',
          'bg-bolt-elements-background-depth-2',
          'text-violet-500 shadow-sm'
        )} />
        <div>
          <h3 className="text-xl font-bold text-bolt-elements-textPrimary">{title}</h3>
          <p className="text-sm text-bolt-elements-textSecondary/90 mt-1 max-w-2xl">{description}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {features.map((feature, index) => (
          <FeatureCard key={feature.id} feature={feature} index={index} onToggle={onToggleFeature} />
        ))}
      </div>
    </motion.div>
  ),
);

const PromptCard = memo(({ 
  prompt, 
  isSelected, 
  onClick 
}: { 
  prompt: any; 
  isSelected: boolean; 
  onClick: () => void 
}) => {
  return (
    <motion.div
      className={classNames(
        'p-5 rounded-xl cursor-pointer',
        'border-2',
        'transition-all duration-300 ease-out',
        isSelected
          ? 'bg-violet-500/10 border-violet-500/50 shadow-lg'
          : 'hover:bg-bolt-elements-background-depth-3 border-bolt-elements-borderColor/20 hover:border-bolt-elements-borderColor/40'
      )}
      whileHover={{ scale: 1.02, y: -2 }}
      onClick={onClick}
    >
      <div className="flex items-start gap-4">
        <div className={classNames(
          'p-3 rounded-xl shrink-0',
          'shadow-sm',
          'transition-all duration-300 ease-out',
          isSelected ? 'text-violet-500 bg-violet-500/10' : 'text-bolt-elements-textSecondary bg-bolt-elements-background-depth-2'
        )}>
          <div className="i-ph:file-text text-2xl" />
        </div>
        <div className="space-y-2 flex-1">
          <div className="flex items-center justify-between">
            <h5 className={classNames(
              'font-semibold text-lg leading-tight',
              isSelected ? 'text-violet-500' : 'text-bolt-elements-textPrimary'
            )}>
              {prompt.label}
            </h5>
            {isSelected && (
              <div className="i-ph:check-circle-fill text-violet-500 w-5 h-5" />
            )}
          </div>
          <p className="text-sm text-bolt-elements-textSecondary/80 line-clamp-3">
            {prompt.description}
          </p>
        </div>
      </div>
    </motion.div>
  );
});

export default function FeaturesTab() {
  const {
    autoSelectTemplate,
    isLatestBranch,
    contextOptimizationEnabled,
    eventLogs,
    setAutoSelectTemplate,
    enableLatestBranch,
    enableContextOptimization,
    setEventLogs,
    setPromptId,
    promptId,
  } = useSettings();

  const [isInitialized, setIsInitialized] = useState(false);

  // Enable features by default on first load
  useEffect(() => {
    // Only set defaults if values are undefined
    if (isLatestBranch === undefined) {
      enableLatestBranch(false); // Default: OFF
    }

    if (contextOptimizationEnabled === undefined) {
      enableContextOptimization(false); // Default: OFF
    }

    if (autoSelectTemplate === undefined) {
      setAutoSelectTemplate(false); // Default: OFF
    }

    if (promptId === undefined) {
      setPromptId('default'); // Default: 'default'
    }

    if (eventLogs === undefined) {
      setEventLogs(false); // Default: OFF
    }
    
    setIsInitialized(true);
  }, []); // Only run once on component mount

  const handleToggleFeature = useCallback(
    (id: string, enabled: boolean) => {
      switch (id) {
        case 'latestBranch': {
          enableLatestBranch(enabled);
          toast.success(`Mise à jour de la branche principale ${enabled ? 'activée' : 'désactivée'}`);
          break;
        }

        case 'autoSelectTemplate': {
          setAutoSelectTemplate(enabled);
          toast.success(`Sélection automatique du modèle ${enabled ? 'activée' : 'désactivée'}`);
          break;
        }

        case 'contextOptimization': {
          enableContextOptimization(enabled);
          toast.success(`Optimisation du contexte ${enabled ? 'activée' : 'désactivée'}`);
          break;
        }

        case 'eventLogs': {
          setEventLogs(enabled);
          toast.success(`Journalisation des événements ${enabled ? 'activée' : 'désactivée'}`);
          break;
        }

        default:
          break;
      }
    },
    [enableLatestBranch, setAutoSelectTemplate, enableContextOptimization, setEventLogs],
  );

  const features = {
    stable: [
      {
        id: 'latestBranch',
        title: 'Mise à jour de la branche principale',
        description: 'Recevoir les dernières mises à jour de la branche principale',
        icon: 'i-ph:git-branch',
        enabled: isLatestBranch,
        tooltip: 'Désactivé par défaut. Activez cette fonctionnalité pour recevoir les mises à jour de la branche de développement principale. Attention : les mises à jour peuvent introduire des changements non testés.',
      },
      {
        id: 'autoSelectTemplate',
        title: 'Sélection automatique du modèle',
        description: 'Sélectionner automatiquement le modèle de départ le plus approprié',
        icon: 'i-ph:selection',
        enabled: autoSelectTemplate,
        tooltip: 'Désactivé par défaut. Activez cette fonctionnalité pour que le système sélectionne automatiquement le modèle de départ le plus approprié en fonction du contexte. Recommandé pour les utilisateurs expérimentés.',
      },
      {
        id: 'contextOptimization',
        title: 'Optimisation du contexte',
        description: 'Optimiser le contexte pour des réponses plus précises',
        icon: 'i-ph:brain',
        enabled: contextOptimizationEnabled,
        tooltip: 'Désactivé par défaut. Activez cette fonctionnalité pour optimiser le contexte des réponses IA. Cela peut augmenter la précision mais aussi la consommation de ressources.',
      },
      {
        id: 'eventLogs',
        title: 'Journalisation des événements',
        description: 'Activer la journalisation détaillée des événements et des actions de l\'utilisateur',
        icon: 'i-ph:list-bullets',
        enabled: eventLogs,
        tooltip: 'Activé par défaut. Fonctionnalité pour enregistrer les logs détaillés des événements du système et des actions de l\'utilisateur. Utile pour le débogage mais peut affecter les performances.',
      },
    ],
    beta: [],
  };

  if (!isInitialized) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="i-ph:circle-notch text-4xl text-violet-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto pb-12">
      {/* Header */}
      <motion.div 
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <h1 className="text-2xl font-bold text-bolt-elements-textPrimary mb-2">Fonctionnalités</h1>
        <p className="text-bolt-elements-textSecondary">Personnalisez votre expérience en activant les fonctionnalités qui vous intéressent</p>
      </motion.div>
      
      <div className="flex flex-col gap-12">
        <FeatureSection
          title="Fonctionnalités essentielles"
          features={features.stable}
          icon="i-ph:check-circle"
          description="Fonctionnalités essentielles pour une performance optimale. Activez ou désactivez-les selon vos besoins."
          onToggleFeature={handleToggleFeature}
        />

        {features.beta.length > 0 && (
          <FeatureSection
            title="Fonctionnalités bêta"
            features={features.beta}
            icon="i-ph:test-tube"
            description="Nouvelles fonctionnalités prêtes à être testées mais qui peuvent avoir des bords rugueux"
            onToggleFeature={handleToggleFeature}
          />
        )}

        <motion.div
          layout
          className={classNames(
            'bg-bolt-elements-background-depth-1',
            'hover:bg-bolt-elements-background-depth-2',
            'transition-all duration-300 ease-out',
            'rounded-2xl',
            'group',
            'flex flex-col gap-8',
            'shadow-md hover:shadow-lg',
            'border border-bolt-elements-borderColor/20',
            'p-8'
          )}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, type: 'spring', stiffness: 100 }}
        >
          <div className="flex items-start gap-6">
            <div
              className={classNames(
                'p-4 rounded-2xl text-3xl',
                'bg-gradient-to-br from-violet-400/10 to-violet-600/10',
                'group-hover:from-violet-400/20 group-hover:to-violet-600/20',
                'transition-all duration-300 ease-out',
                'text-violet-500 shadow-md'
              )}
            >
              <div className="i-ph:book" />
            </div>
            <div className="flex flex-col">
              <h4 className="text-2xl font-bold bg-gradient-to-r from-violet-500 to-violet-700 bg-clip-text text-transparent group-hover:from-violet-400 group-hover:to-violet-600 transition-all duration-300">
                Bibliothèque de prompts
              </h4>
              <p className="text-sm text-bolt-elements-textSecondary/90 mt-3 max-w-lg leading-relaxed">
                Sélectionnez un prompt système prédéfini pour optimiser vos interactions et obtenir des résultats personnalisés
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {PromptLibrary.getList().map((prompt) => (
              <motion.div
                key={prompt.id}
                whileHover={{ scale: 1.02, y: -4 }}
                transition={{ type: "spring", stiffness: 400, damping: 10 }}
              >
                <PromptCard 
                  prompt={prompt}
                  isSelected={promptId === prompt.id}
                  onClick={() => {
                    setPromptId(prompt.id);
                    toast.success(`Prompt sélectionné : ${prompt.label}`);
                  }}
                />
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
