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
  }) => (
    <motion.div
      key={feature.id}
      layoutId={feature.id}
      className={classNames(
        'relative group cursor-pointer',
        'bg-gradient-to-br from-bolt-elements-background-depth-1 to-bolt-elements-background-depth-2',
        'hover:from-bolt-elements-background-depth-2 hover:to-bolt-elements-background-depth-3',
        'transition-all duration-500 ease-out',
        'rounded-2xl overflow-hidden',
        'shadow-lg hover:shadow-2xl',
        'border border-bolt-elements-borderColor/20 hover:border-violet-500/30',
        'transform hover:-translate-y-1'
      )}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.02 }}
      transition={{ delay: index * 0.05, type: 'spring', stiffness: 100, damping: 20 }}
    >
      <div className="p-8 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={classNames(
              feature.icon, 
              'w-12 h-12 p-2.5 rounded-2xl',
              'text-white',
              'bg-gradient-to-br from-violet-400 to-violet-600',
              'shadow-xl group-hover:shadow-2xl group-hover:from-violet-500 group-hover:to-violet-700',
              'transform group-hover:scale-110 transition-all duration-500'
            )} />
            <div className="flex items-center gap-3">
              <h4 className="font-bold text-xl text-bolt-elements-textPrimary group-hover:text-violet-500 transition-colors">{feature.title}</h4>
              {feature.beta && (
                <span className="px-3 py-1 text-xs font-semibold rounded-full bg-blue-500/15 text-blue-400 shadow-lg ring-1 ring-blue-500/30 group-hover:bg-blue-500/25 group-hover:ring-blue-500/40 transition-all duration-500">Bêta</span>
              )}
              {feature.experimental && (
                <span className="px-3 py-1 text-xs font-semibold rounded-full bg-orange-500/15 text-orange-400 shadow-lg ring-1 ring-orange-500/30 group-hover:bg-orange-500/25 group-hover:ring-orange-500/40 transition-all duration-500">
                  Expérimental
                </span>
              )}
            </div>
          </div>
          <Switch 
            checked={feature.enabled} 
            onCheckedChange={(checked) => onToggle(feature.id, checked)}
            className="data-[state=checked]:bg-violet-500 data-[state=unchecked]:bg-bolt-elements-borderColor/50 h-6 w-11"
          />
        </div>
        <p className="text-base text-bolt-elements-textSecondary/90 leading-relaxed group-hover:text-bolt-elements-textPrimary/90 transition-colors duration-500">{feature.description}</p>
        {feature.tooltip && (
          <p className="text-sm text-bolt-elements-textTertiary/70 italic group-hover:text-bolt-elements-textSecondary/70 transition-colors duration-500">
            {feature.tooltip}
          </p>
        )}
      </div>
    </motion.div>
  ),
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
    setAutoSelectTemplate,
    enableLatestBranch,
    enableContextOptimization,
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

  return (
    <div className="flex flex-col gap-8">
      <FeatureSection
        title="Fonctionnalités essentielles"
        features={features.stable}
        icon="i-ph:check-circle"
        description="Fonctionnalités essentielles activées par défaut pour un performance optimale"
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
          'bg-bolt-elements-background-depth-2',
          'hover:bg-bolt-elements-background-depth-3',
          'transition-all duration-300 ease-out',
          'rounded-2xl p-8',
          'group',
          'flex flex-col gap-8',
          'shadow-lg hover:shadow-xl'
        )}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, type: 'spring', stiffness: 100 }}
      >
        <div className="flex items-center gap-6">
          <div
            className={classNames(
              'p-4 rounded-2xl text-3xl',
              'bg-gradient-to-br from-violet-400/10 to-violet-600/10',
              'group-hover:from-violet-400/20 group-hover:to-violet-600/20',
              'transition-all duration-300 ease-out',
              'text-violet-500 shadow-inner'
            )}
          >
            <div className="i-ph:book transform group-hover:scale-110 transition-transform duration-300" />
          </div>
          <div>
            <h4 className="text-xl font-bold text-bolt-elements-textPrimary group-hover:text-violet-500 transition-colors duration-300">
              Bibliothèque de prompts
            </h4>
            <p className="text-sm text-bolt-elements-textSecondary/90 mt-2 max-w-lg">
              Sélectionnez un prompt système prédéfini pour optimiser vos interactions
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {PromptLibrary.getList().map((prompt) => (
            <motion.div
              key={prompt.id}
              className={classNames(
                'p-5 rounded-xl cursor-pointer',
                'border-2',
                'transition-all duration-300 ease-out',
                promptId === prompt.id
                  ? 'bg-violet-500/10 border-violet-500/30 shadow-violet-500/5'
                  : 'hover:bg-bolt-elements-background-depth-3 border-bolt-elements-borderColor/20 hover:border-bolt-elements-borderColor/40'
              )}
              whileHover={{ scale: 1.03, y: -4 }}
              onClick={() => {
                setPromptId(prompt.id);
                toast(`Prompt sélectionné : ${prompt.label}`);
              }}
            >
              <div className="flex items-start gap-4">
                <div className={classNames(
                  'p-3 rounded-xl shrink-0',
                  'bg-bolt-elements-background-depth-3 shadow-inner',
                  'transition-all duration-300 ease-out',
                  promptId === prompt.id ? 'text-violet-500 bg-violet-500/10' : 'text-bolt-elements-textSecondary'
                )}>
                  <div className="i-ph:file-text text-2xl transform group-hover:scale-110 transition-transform duration-300" />
                </div>
                <div className="space-y-2 flex-1">
                  <h5 className={classNames(
                    'font-semibold text-lg leading-tight',
                    promptId === prompt.id ? 'text-violet-500' : 'text-bolt-elements-textPrimary'
                  )}>
                    {prompt.label}
                  </h5>
                  <p className="text-sm text-bolt-elements-textSecondary/80 line-clamp-3">
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
