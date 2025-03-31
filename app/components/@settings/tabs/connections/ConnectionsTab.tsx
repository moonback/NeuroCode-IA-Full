import { motion } from 'framer-motion';
import React, { Suspense, useState } from 'react';
import { classNames } from '~/utils/classNames';
import ConnectionDiagnostics from './ConnectionDiagnostics';
import { Button } from '~/components/ui/Button';

// Use React.lazy for dynamic imports
const GitHubConnection = React.lazy(() => import('./GithubConnection'));
const NetlifyConnection = React.lazy(() => import('./NetlifyConnection'));
const VercelConnection = React.lazy(() => import('./VercelConnection'));
// Loading fallback component
const LoadingFallback = () => (
  <div className="p-4 bg-bolt-elements-background-depth-1 dark:bg-bolt-elements-background-depth-1 rounded-lg border border-bolt-elements-borderColor dark:border-bolt-elements-borderColor">
    <div className="flex items-center justify-center gap-2 text-bolt-elements-textSecondary dark:text-bolt-elements-textSecondary">
      <div className="i-ph:spinner-gap w-4 h-4 animate-spin" />
      <span>Loading connection...</span>
    </div>
  </div>
);

export default function ConnectionsTab() {
  const [isEnvVarsExpanded, setIsEnvVarsExpanded] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        className="flex items-center justify-between gap-2"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <div className="flex items-center gap-2">
          <div className="i-ph:plugs-connected w-5 h-5 text-bolt-elements-item-contentAccent dark:text-bolt-elements-item-contentAccent" />
          <h2 className="text-lg font-medium text-bolt-elements-textPrimary dark:text-bolt-elements-textPrimary">
          Paramètres de connexion
          </h2>
        </div>
        <Button
          onClick={() => setShowDiagnostics(!showDiagnostics)}
          variant="outline"
          className="flex items-center gap-2 hover:bg-bolt-elements-item-backgroundActive/10 hover:text-bolt-elements-textPrimary dark:hover:bg-bolt-elements-item-backgroundActive/10 dark:hover:text-bolt-elements-textPrimary transition-colors"
        >
          {showDiagnostics ? (
            <>
              <div className="i-ph:eye-slash w-4 h-4" />
              Masquer les diagnostics
            </>
          ) : (
            <>
              <div className="i-ph:wrench w-4 h-4" />
              Dépanner les connexions
            </>
          )}
        </Button>
      </motion.div>
      <p className="text-sm text-bolt-elements-textSecondary dark:text-bolt-elements-textSecondary">
        Gérez vos connexions et intégrations de services externes
      </p>

      {/* Diagnostics Tool - Conditionally rendered */}
      {showDiagnostics && <ConnectionDiagnostics />}
      {/* Note de déploiement Cloudflare - Très visible */}
      <motion.div
        className="bg-gradient-to-r from-blue-50 to-blue-100 dark:from-blue-950/40 dark:to-blue-900/30 border border-blue-200 dark:border-blue-800/50 rounded-lg shadow-sm p-4 mb-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <div className="flex items-center gap-2 mb-2 text-blue-700 dark:text-blue-400">
          <div className="i-ph:cloud-bold w-5 h-5" />
          <h3 className="text-base font-medium">Vous utilisez Cloudflare Pages ?</h3>
        </div>
        <p className="text-sm text-blue-700 dark:text-blue-300 mb-2">
          Si vous rencontrez des problèmes de connexion à GitHub (erreurs 500) sur vos déploiements Cloudflare Pages,
          vous devez configurer les variables d'environnement dans votre tableau de bord Cloudflare :
        </p>
        <div className="bg-white/80 dark:bg-slate-900/60 rounded-md p-3 text-sm border border-blue-200 dark:border-blue-800/50">
          <ol className="list-decimal list-inside pl-2 text-blue-700 dark:text-blue-300 space-y-2">
            <li>
              Allez dans <strong>Tableau de bord Cloudflare Pages → Votre projet → Paramètres → Variables d'environnement</strong>
            </li>
            <li>
              Ajoutez <strong>les deux</strong> secrets suivants (environnement de Production) :
              <ul className="list-disc list-inside pl-4 mt-1 mb-1">
                <li>
                  <code className="px-1 py-0.5 bg-blue-100 dark:bg-blue-800/40 rounded">GITHUB_ACCESS_TOKEN</code>{' '}
                  (appels API côté serveur)
                </li>
                <li>
                  <code className="px-1 py-0.5 bg-blue-100 dark:bg-blue-800/40 rounded">VITE_GITHUB_ACCESS_TOKEN</code>{' '}
                  (accès côté client)
                </li>
              </ul>
            </li>
            <li>
              Ajoutez <code className="px-1 py-0.5 bg-blue-100 dark:bg-blue-800/40 rounded">VITE_GITHUB_TOKEN_TYPE</code> si
              vous utilisez des tokens à granularité fine
            </li>
            <li>Déployez une nouvelle version après avoir ajouté ces variables</li>
          </ol>
        </div>
      </motion.div>
      {/* Environment Variables Info - Collapsible */}
      <motion.div
        className="bg-bolt-elements-background dark:bg-bolt-elements-background rounded-lg border border-bolt-elements-borderColor dark:border-bolt-elements-borderColor"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <div className="p-6">
          <button
            onClick={() => setIsEnvVarsExpanded(!isEnvVarsExpanded)}
            className={classNames(
              'w-full bg-transparent flex items-center justify-between',
              'hover:bg-bolt-elements-item-backgroundActive/10 hover:text-bolt-elements-textPrimary',
              'dark:hover:bg-bolt-elements-item-backgroundActive/10 dark:hover:text-bolt-elements-textPrimary',
              'rounded-md p-2 -m-2 transition-colors',
            )}
          >
            <div className="flex items-center gap-2">
              <div className="i-ph:info w-5 h-5 text-bolt-elements-item-contentAccent dark:text-bolt-elements-item-contentAccent" />
              <h3 className="text-base font-medium text-bolt-elements-textPrimary dark:text-bolt-elements-textPrimary">
                Environment Variables
              </h3>
            </div>
            <div
              className={classNames(
                'i-ph:caret-down w-4 h-4 text-bolt-elements-textSecondary dark:text-bolt-elements-textSecondary transition-transform',
                isEnvVarsExpanded ? 'rotate-180' : '',
              )}
            />
          </button>

          {isEnvVarsExpanded && (
            <div className="mt-4">
              <p className="text-sm text-bolt-elements-textSecondary dark:text-bolt-elements-textSecondary mb-2">
                Vous pouvez configurer les connexions en utilisant les variables d'environnement dans votre fichier{' '}
                <code className="px-1 py-0.5 bg-bolt-elements-background-depth-2 dark:bg-bolt-elements-background-depth-2 rounded">
                  .env.local
                </code>{' '}
                :
              </p>
              <div className="bg-bolt-elements-background-depth-2 dark:bg-bolt-elements-background-depth-2 p-3 rounded-md text-xs font-mono overflow-x-auto">
                <div className="text-bolt-elements-textSecondary dark:text-bolt-elements-textSecondary">
                  # Authentification GitHub
                </div>
                <div className="text-bolt-elements-textPrimary dark:text-bolt-elements-textPrimary">
                  VITE_GITHUB_ACCESS_TOKEN=votre_token_ici
                </div>
                <div className="text-bolt-elements-textSecondary dark:text-bolt-elements-textSecondary">
                  # Optionnel: Spécifiez le type de token (par défaut 'classic' si non spécifié)
                </div>
                <div className="text-bolt-elements-textPrimary dark:text-bolt-elements-textPrimary">
                  VITE_GITHUB_TOKEN_TYPE=classic|fine-grained
                </div>
                <div className="text-bolt-elements-textSecondary dark:text-bolt-elements-textSecondary mt-2">
                  # Authentification Netlify
                </div>
                <div className="text-bolt-elements-textPrimary dark:text-bolt-elements-textPrimary">
                  VITE_NETLIFY_ACCESS_TOKEN=votre_token_ici
                </div>
                <div className="text-bolt-elements-textSecondary dark:text-bolt-elements-textSecondary mt-2">
                  # Authentification Vercel
                </div>
                <div className="text-bolt-elements-textPrimary dark:text-bolt-elements-textPrimary">
                  VITE_VERCEL_ACCESS_TOKEN=votre_token_ici
                </div>
              </div>
              
              <div className="mt-3 text-xs text-bolt-elements-textSecondary dark:text-bolt-elements-textSecondary space-y-1">
                <p>
                  <span className="font-medium">Types de tokens:</span>
                </p>
                <ul className="list-disc list-inside pl-2 space-y-1">
                  <li>
                    <span className="font-medium">classic</span> - Token d'accès personnel avec les portées{' '}
                    <code className="px-1 py-0.5 bg-bolt-elements-background-depth-2 dark:bg-bolt-elements-background-depth-2 rounded">
                      repo, read:org, read:user
                    </code>
                  </li>
                  <li>
                    <span className="font-medium">fine-grained</span> - Token à granularité fine avec accès aux dépôts et
                    à l'organisation
                  </li>
                </ul>
                <p className="mt-2">
                  Une fois définies, ces variables seront utilisées automatiquement sans nécessiter de connexion manuelle.
                </p>
              </div>
            </div>
          )}
        </div>
      </motion.div>

      <div className="grid grid-cols-1 gap-6">
        <Suspense fallback={<LoadingFallback />}>
          <GitHubConnection />
        </Suspense>
        <Suspense fallback={<LoadingFallback />}>
          <NetlifyConnection />
        </Suspense>
        <Suspense fallback={<LoadingFallback />}>
          <VercelConnection />
        </Suspense>
      </div>

      {/* Additional help text */}
      <div className="text-sm text-bolt-elements-textSecondary dark:text-bolt-elements-textSecondary bg-bolt-elements-background-depth-2 dark:bg-bolt-elements-background-depth-2 p-4 rounded-lg">
        <p className="flex items-center gap-1 mb-2">
          <span className="i-ph:lightbulb w-4 h-4 text-bolt-elements-icon-success dark:text-bolt-elements-icon-success" />
          <span className="font-medium">Conseil de dépannage:</span>
        </p>
        <p className="mb-2">
          Si vous rencontrez des problèmes avec les connexions, essayez d'utiliser l'outil de dépannage en haut de cette page. Il peut
          vous aider à diagnostiquer et résoudre les problèmes de connexion courants.
        </p>
        <p>Pour les problèmes persistants:</p>
        <ol className="list-decimal list-inside pl-4 mt-1">
          <li>Vérifiez la console de votre navigateur pour les erreurs</li>
          <li>Vérifiez que vos jetons ont les permissions correctes</li>
          <li>Essayez de vider le cache et les cookies de votre navigateur</li>
          <li>Assurez-vous que votre navigateur autorise les cookies tiers si vous utilisez des intégrations</li>
        </ol>
      </div>
    </div>
  );
}
