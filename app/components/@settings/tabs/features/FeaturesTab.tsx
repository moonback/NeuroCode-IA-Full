// Remove unused imports
import React, { memo, useCallback } from 'react';
import { motion } from 'framer-motion';
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
  disabled?: boolean; // Add disabled property
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
    const isDisabled = feature.disabled ?? false; // Check if feature is disabled

    return (
      <motion.div
        key={feature.id}
        layoutId={feature.id}
        className={classNames(
          'relative group', // Base class
          'bg-bolt-elements-background-depth-1',
          // Use object syntax for conditional classes
          { 'hover:bg-bolt-elements-background-depth-2': !isDisabled },
          'transition-all duration-300 ease-out',
          'rounded-xl overflow-hidden',
          // Apply base shadow always, and hover shadow conditionally
          'shadow-sm',
          { 'hover:shadow-md': !isDisabled },
          'border border-bolt-elements-borderColor/10',
           // Conditional transform
          { 'transform hover:scale-[1.02]': !isDisabled },
          // Opacity and cursor styling when disabled
          isDisabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
        )}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        // Only apply motion hover effect if not disabled
        whileHover={!isDisabled ? { scale: 1.02 } : {}}
        transition={{ delay: index * 0.03, type: 'spring', stiffness: 120, damping: 20 }}
      >
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            {/* Icon and Title */}
            <div className="flex items-center gap-3">
              <div className={classNames(
                feature.icon, 
                'w-10 h-10 p-2 rounded-xl',
                'text-white',
                'bg-gradient-to-br from-violet-500 to-violet-600',
                'shadow-sm group-hover:shadow-md'
              )} />
              <div className="flex items-center gap-2">
                <h4 className="font-semibold text-lg text-bolt-elements-textPrimary">{feature.title}</h4>
                {feature.beta && (
                  <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-blue-500/10 text-blue-400">Bêta</span>
                )}
                {feature.experimental && (
                  <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-orange-500/10 text-orange-400">
                    Expérimental
                  </span>
                )}
              </div>
            </div>
             {/* Switch component */}
             <Switch
                checked={feature.enabled}
                // Only call onToggle if not disabled
                onCheckedChange={(checked) => !isDisabled && onToggle(feature.id, checked)}
                className="data-[state=checked]:bg-violet-500 data-[state=unchecked]:bg-bolt-elements-borderColor/30 h-5 w-9"
                disabled={isDisabled} // Pass disabled state to the Switch
             />
          </div>
          <p className="text-sm text-bolt-elements-textSecondary/90 leading-relaxed">{feature.description}</p>
          
          {/* Conditionally render development message if disabled */}
          {isDisabled && (
            <p className="text-xs text-yellow-500/90 font-medium mt-2">
              (Fonctionnalité en cours de développement)
            </p>
          )}

          {feature.tooltip && (
            <p className="text-xs text-bolt-elements-textTertiary/70 italic mt-1">
              {feature.tooltip}
            </p>
          )}
        </div>
      </motion.div>
    );
  },
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
      <div className="flex items-center gap-4">
        <div className={classNames(
          icon, 
          'text-2xl p-2 rounded-lg',
          'bg-bolt-elements-background-depth-3',
          'text-violet-500'
        )} />
        <div>
          <h3 className="text-xl font-semibold text-bolt-elements-textPrimary">{title}</h3>
          <p className="text-sm text-bolt-elements-textSecondary/90 mt-1">{description}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {features.map((feature, index) => (
          <FeatureCard key={feature.id} feature={feature} index={index} onToggle={onToggleFeature} />
        ))}
      </div>
    </motion.div>
  ),
);

export default function FeaturesTab() {
  const {
    autoSelectTemplate,
    isLatestBranch,
    contextOptimizationEnabled,
    eventLogs,
    uiAnalysisEnabled,
    setAutoSelectTemplate,
    enableLatestBranch,
    enableContextOptimization,
    enableUIAnalysis,
    setEventLogs,
    setPromptId,
    promptId,
  } = useSettings();

  // Enable features by default on first load
  React.useEffect(() => {
    // Only set defaults if values are undefined
    if (isLatestBranch === undefined) {
      enableLatestBranch(false); // Default: OFF - Ne pas mettre à jour automatiquement depuis la branche principale
    }

    if (contextOptimizationEnabled === undefined) {
      enableContextOptimization(false); // Default: OFF - Optimisation du contexte désactivée
    }

    if (autoSelectTemplate === undefined) {
      setAutoSelectTemplate(false); // Default: OFF - Sélection automatique des modèles désactivée
    }

    if (promptId === undefined) {
      setPromptId('default'); // Default: 'default'
    }

    if (eventLogs === undefined) {
      setEventLogs(false); // Default: OFF - Journalisation des événements désactivée
    }

    if (uiAnalysisEnabled === undefined) {
      enableUIAnalysis(true); // Default: ON - Analyse UI/UX activée par défaut
    }
  }, []); // Only run once on component mount

  const handleToggleFeature = useCallback(
    (id: string, enabled: boolean) => {
      switch (id) {
        case 'latestBranch': {
          enableLatestBranch(enabled);
          toast(`Mise à jour de la branche principale ${enabled ? 'activée' : 'désactivée'}`);
          break;
        }

        case 'autoSelectTemplate': {
          setAutoSelectTemplate(enabled);
          toast(`Sélection automatique du modèle ${enabled ? 'activée' : 'désactivée'}`);
          break;
        }

        case 'contextOptimization': {
          enableContextOptimization(enabled);
          toast(`Optimisation du contexte ${enabled ? 'activée' : 'désactivée'}`);
          break;
        }

        case 'eventLogs': {
          setEventLogs(enabled);
          toast(`Journalisation des événements ${enabled ? 'activée' : 'désactivée'}`);
          break;
        }

        case 'uiAnalysis': {
          enableUIAnalysis(enabled);
          toast(`Analyse UI/UX ${enabled ? 'activée' : 'désactivée'}`);
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
        id: 'eventLogs',
        title: 'Journalisation des événements',
        description: 'Activer la journalisation détaillée des événements et des actions de l\'utilisateur',
        icon: 'i-ph:list-bullets',
        enabled: eventLogs,
        tooltip: 'Activé par défaut. Fonctionnalité pour enregistrer les logs détaillés des événements du système et des actions de l\'utilisateur. Utile pour le débogage mais peut affecter les performances.',
      },
      
    ],
    beta: [
      {
        id: 'uiAnalysis',
        title: 'Analyse UI/UX',
        description: 'Activer le bouton d\'analyse intelligente des interfaces utilisateur',
        icon: 'i-ph:magic-wand',
        enabled: uiAnalysisEnabled, // Keep existing state logic
        // Update tooltip and add disabled flag
        tooltip: 'Cette fonctionnalité est temporairement désactivée et sera bientôt disponible.',
        disabled: true, // Disable this feature
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
    ],
  };

  return (
    <div className="flex flex-col gap-8">
      <FeatureSection
        title="Fonctionnalités essentielles"
        features={features.stable}
        icon="i-ph:check-circle"
        description="Fonctionnalités principales pour une expérience optimale"
        onToggleFeature={handleToggleFeature}
      />

      {features.beta.length > 0 && (
        <FeatureSection
          title="Fonctionnalités bêta"
          features={features.beta}
          icon="i-ph:test-tube"
          description="Nouvelles fonctionnalités en phase de test"
          onToggleFeature={handleToggleFeature}
        />
      )}

      <motion.div
        layout
        className={classNames(
          'bg-bolt-elements-background-depth-1',
          'rounded-xl p-6',
          'shadow-sm'
        )}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, type: 'spring', stiffness: 120 }}
      >
        <div className="flex items-center gap-4 mb-6">
          <div className={classNames(
            'p-3 rounded-lg text-2xl',
            'bg-bolt-elements-background-depth-2',
            'text-violet-500'
          )}>
            <div className="i-ph:book" />
          </div>
          <div>
            <h4 className="text-lg font-semibold text-bolt-elements-textPrimary">
              Bibliothèque de prompts
            </h4>
            <p className="text-sm text-bolt-elements-textSecondary/90 mt-1 max-w-lg">
              Sélectionnez un prompt système prédéfini
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {PromptLibrary.getList().map((prompt) => (
            <motion.div
              key={prompt.id}
              className={classNames(
                'p-4 rounded-lg cursor-pointer',
                'bg-bolt-elements-background-depth-1',
                'hover:bg-bolt-elements-background-depth-2',
                'border border-bolt-elements-borderColor/10',
                'shadow-sm hover:shadow-md',
                promptId === prompt.id
                  ? 'border-violet-500/40'
                  : 'border-transparent'
              )}
              whileHover={{ scale: 1.02 }}
              onClick={() => {
                setPromptId(prompt.id);
                toast(`Prompt sélectionné : ${prompt.label}`);
              }}
            >
              <div className="flex items-start gap-3">
                <div className={classNames(
                  'p-2 rounded-lg',
                  'bg-bolt-elements-background-depth-2',
                  promptId === prompt.id 
                    ? 'text-violet-500' 
                    : 'text-bolt-elements-textSecondary'
                )}>
                  <div className="i-ph:file-text text-xl" />
                </div>
                <div className="space-y-1 flex-1">
                  <h5 className={classNames(
                    'font-medium text-base',
                    promptId === prompt.id 
                      ? 'text-violet-500' 
                      : 'text-bolt-elements-textPrimary'
                  )}>
                    {prompt.label}
                  </h5>
                  <p className={classNames(
                    'text-xs leading-relaxed line-clamp-3',
                    promptId === prompt.id
                      ? 'text-violet-500/90'
                      : 'text-bolt-elements-textSecondary/80'
                  )}>
                    {prompt.description}
                  </p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
