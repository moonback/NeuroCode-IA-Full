import React, { useState } from 'react';
import { toast } from 'react-toastify';
import { Button } from '~/components/ui/Button';
import { Badge } from '~/components/ui/Badge';
import { classNames } from '~/utils/classNames';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '~/components/ui/Collapsible';
import { CodeBracketIcon, ChevronDownIcon } from '@heroicons/react/24/outline';

/**
 * A diagnostics component to help troubleshoot connection issues
 */
export default function ConnectionDiagnostics() {
  const [diagnosticResults, setDiagnosticResults] = useState<any>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  // Run diagnostics when requested
  const runDiagnostics = async () => {
    try {
      setIsRunning(true);
      setDiagnosticResults(null);

      // Check browser-side storage
      const localStorageChecks = {
        githubConnection: localStorage.getItem('github_connection'),
        netlifyConnection: localStorage.getItem('netlify_connection'),
        vercelConnection: localStorage.getItem('vercel_connection'),
      };

      // Get diagnostic data from server
      const response = await fetch('/api/system/diagnostics');

      if (!response.ok) {
        throw new Error(`Diagnostics API error: ${response.status}`);
      }

      const serverDiagnostics = await response.json();

      // Get GitHub token if available
      const githubToken = localStorageChecks.githubConnection
        ? JSON.parse(localStorageChecks.githubConnection)?.token
        : null;

      const authHeaders = {
        ...(githubToken ? { Authorization: `Bearer ${githubToken}` } : {}),
        'Content-Type': 'application/json',
      };

      console.log('Testing GitHub endpoints with token:', githubToken ? 'present' : 'missing');

      // Test GitHub API endpoints
      const githubEndpoints = [
        { name: 'User', url: '/api/system/git-info?action=getUser' },
        { name: 'Repos', url: '/api/system/git-info?action=getRepos' },
        { name: 'Default', url: '/api/system/git-info' },
      ];

      const githubResults = await Promise.all(
        githubEndpoints.map(async (endpoint) => {
          try {
            const resp = await fetch(endpoint.url, {
              headers: authHeaders,
            });
            return {
              endpoint: endpoint.name,
              status: resp.status,
              ok: resp.ok,
            };
          } catch (error) {
            return {
              endpoint: endpoint.name,
              error: error instanceof Error ? error.message : String(error),
              ok: false,
            };
          }
        }),
      );

      // Check if Netlify token works
      let netlifyUserCheck = null;
      const netlifyToken = localStorageChecks.netlifyConnection
        ? JSON.parse(localStorageChecks.netlifyConnection || '{"token":""}').token
        : '';

      if (netlifyToken) {
        try {
          const netlifyResp = await fetch('https://api.netlify.com/api/v1/user', {
            headers: {
              Authorization: `Bearer ${netlifyToken}`,
            },
          });
          netlifyUserCheck = {
            status: netlifyResp.status,
            ok: netlifyResp.ok,
          };
        } catch (error) {
          netlifyUserCheck = {
            error: error instanceof Error ? error.message : String(error),
            ok: false,
          };
        }
      }

      // Compile results
      // Check if Vercel token works
      let vercelUserCheck = null;
      const vercelToken = localStorageChecks.vercelConnection
        ? JSON.parse(localStorageChecks.vercelConnection || '{"token":""}').token
        : '';

      if (vercelToken) {
        try {
          const vercelResp = await fetch('https://api.vercel.com/v2/user', {
            headers: {
              Authorization: `Bearer ${vercelToken}`,
              'Content-Type': 'application/json',
            },
          });
          vercelUserCheck = {
            status: vercelResp.status,
            ok: vercelResp.ok,
          };
        } catch (error) {
          vercelUserCheck = {
            error: error instanceof Error ? error.message : String(error),
            ok: false,
          };
        }
      }

      const results = {
        timestamp: new Date().toISOString(),
        localStorage: {
          hasGithubConnection: Boolean(localStorageChecks.githubConnection),
          hasNetlifyConnection: Boolean(localStorageChecks.netlifyConnection),
          hasVercelConnection: Boolean(localStorageChecks.vercelConnection),
          githubConnectionParsed: localStorageChecks.githubConnection
            ? JSON.parse(localStorageChecks.githubConnection)
            : null,
          netlifyConnectionParsed: localStorageChecks.netlifyConnection
            ? JSON.parse(localStorageChecks.netlifyConnection)
            : null,
          vercelConnectionParsed: localStorageChecks.vercelConnection
            ? JSON.parse(localStorageChecks.vercelConnection)
            : null,
        },
        apiEndpoints: {
          github: githubResults,
          netlify: netlifyUserCheck,
          vercel: vercelUserCheck,
        },
        serverDiagnostics,
      };

      setDiagnosticResults(results);

      // Display simple results
      if (results.localStorage.hasGithubConnection && results.apiEndpoints.github.some((r: { ok: boolean }) => !r.ok)) {
        toast.error('Les connexions à l\'API GitHub échouent. Essayez de vous reconnecter.');
      }

      if (results.localStorage.hasNetlifyConnection && netlifyUserCheck && !netlifyUserCheck.ok) {
        toast.error('La connexion à l\'API Netlify échoue. Essayez de vous reconnecter.');
      }

      if (results.localStorage.hasVercelConnection && vercelUserCheck && !vercelUserCheck.ok) {
        toast.error('La connexion à l\'API Vercel échoue. Essayez de vous reconnecter.');
      }

      if (!results.localStorage.hasGithubConnection && !results.localStorage.hasNetlifyConnection && !results.localStorage.hasVercelConnection) {
        toast.info('Aucune donnée de connexion trouvée dans le stockage du navigateur.');
      }
    } catch (error) {
      console.error('Erreur de diagnostic:', error);
      toast.error('Erreur lors de l\'exécution des diagnostics');
      setDiagnosticResults({ error: error instanceof Error ? error.message : String(error) });
    } finally {
      setIsRunning(false);
    }
  };

  // Helper to reset GitHub connection
  const resetGitHubConnection = () => {
    try {
      localStorage.removeItem('github_connection');
      document.cookie = 'githubToken=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
      document.cookie = 'githubUsername=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
      document.cookie = 'git:github.com=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
      toast.success('GitHub connection data cleared. Please refresh the page and reconnect.');
    } catch (error) {
      console.error('Error clearing GitHub data:', error);
      toast.error('Failed to clear GitHub connection data');
    }
  };

  // Helper to reset Netlify connection
  const resetNetlifyConnection = () => {
    try {
      localStorage.removeItem('netlify_connection');
      document.cookie = 'netlifyToken=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
      toast.success('Les données de connexion Netlify ont été effacées. Veuillez actualiser la page et vous reconnecter.');
    } catch (error) {
      console.error('Erreur lors de l\'effacement des données Netlify:', error);
      toast.error('Échec de l\'effacement des données de connexion Netlify');
    }
  };

  // Helper to reset Vercel connection
  const resetVercelConnection = () => {
    try {
      localStorage.removeItem('vercel_connection');
      document.cookie = 'vercelToken=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
      toast.success('Les données de connexion Vercel ont été effacées. Veuillez actualiser la page et vous reconnecter.');
    } catch (error) {
      console.error('Erreur lors de l\'effacement des données Vercel:', error);
      toast.error('Échec de l\'effacement des données de connexion Vercel');
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Connection Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* GitHub Connection Card */}
        <div className="p-4 rounded-lg bg-bolt-elements-background dark:bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor dark:border-bolt-elements-borderColor hover:border-bolt-elements-borderColorActive/70 dark:hover:border-bolt-elements-borderColorActive/70 transition-all duration-200 h-[180px] flex flex-col">
          <div className="flex items-center gap-2">
            <div className="i-ph:github-logo text-bolt-elements-item-contentAccent dark:text-bolt-elements-item-contentAccent w-4 h-4" />
            <div className="text-sm font-medium text-bolt-elements-textPrimary dark:text-bolt-elements-textPrimary">
            Connexion GitHub
            </div>
          </div>
          {diagnosticResults ? (
            <>
              <div className="flex items-center gap-2 mt-2">
                <span
                  className={classNames(
                    'text-xl font-semibold',
                    diagnosticResults.localStorage.hasGithubConnection
                      ? 'text-green-500 dark:text-green-400'
                      : 'text-red-500 dark:text-red-400',
                  )}
                >
                  {diagnosticResults.localStorage.hasGithubConnection ? 'Connecté' : 'Non Connecté'}
                </span>
              </div>
              {diagnosticResults.localStorage.hasGithubConnection && (
                <>
                  <div className="text-xs text-bolt-elements-textSecondary dark:text-bolt-elements-textSecondary mt-2 flex items-center gap-1.5">
                    <div className="i-ph:user w-3.5 h-3.5 text-bolt-elements-item-contentAccent dark:text-bolt-elements-item-contentAccent" />
                    User: {diagnosticResults.localStorage.githubConnectionParsed?.user?.login || 'N/A'}
                  </div>
                  <div className="text-xs text-bolt-elements-textSecondary dark:text-bolt-elements-textSecondary mt-2 flex items-center gap-1.5">
                    <div className="i-ph:check-circle w-3.5 h-3.5 text-bolt-elements-item-contentAccent dark:text-bolt-elements-item-contentAccent" />
                    API Status:{' '}
                    <Badge
                      variant={
                        diagnosticResults.apiEndpoints.github.every((r: { ok: boolean }) => r.ok)
                          ? 'default'
                          : 'destructive'
                      }
                      className="ml-1"
                    >
                      {diagnosticResults.apiEndpoints.github.every((r: { ok: boolean }) => r.ok) ? 'OK' : 'Failed'}
                    </Badge>
                  </div>
                </>
              )}
              {!diagnosticResults.localStorage.hasGithubConnection && (
                <Button
                  onClick={() => window.location.reload()}
                  variant="outline"
                  size="sm"
                  className="mt-auto self-start hover:bg-bolt-elements-item-backgroundActive/10 hover:text-bolt-elements-textPrimary dark:hover:bg-bolt-elements-item-backgroundActive/10 dark:hover:text-bolt-elements-textPrimary transition-colors"
                >
                  <div className="i-ph:plug w-3.5 h-3.5 mr-1" />
                  Connectez-vous maintenant
                </Button>
              )}
            </>
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-sm text-bolt-elements-textSecondary dark:text-bolt-elements-textSecondary flex items-center gap-2">
                <div className="i-ph:info w-4 h-4" />
                Exécutez des diagnostics pour vérifier l'état de la connexion
              </div>
            </div>
          )}
        </div>

        {/* Netlify Connection Card */}
        <div className="p-4 rounded-lg bg-bolt-elements-background dark:bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor dark:border-bolt-elements-borderColor hover:border-bolt-elements-borderColorActive/70 dark:hover:border-bolt-elements-borderColorActive/70 transition-all duration-200 h-[180px] flex flex-col">
          <div className="flex items-center gap-2">
            <div className="i-si:netlify text-bolt-elements-item-contentAccent dark:text-bolt-elements-item-contentAccent w-4 h-4" />
            <div className="text-sm font-medium text-bolt-elements-textPrimary dark:text-bolt-elements-textPrimary">
            Connexion Netlify
            </div>
          </div>
          {diagnosticResults ? (
            <>
              <div className="flex items-center gap-2 mt-2">
                <span
                  className={classNames(
                    'text-xl font-semibold',
                    diagnosticResults.localStorage.hasNetlifyConnection
                      ? 'text-green-500 dark:text-green-400'
                      : 'text-red-500 dark:text-red-400',
                  )}
                >
                  {diagnosticResults.localStorage.hasNetlifyConnection ? 'Connecté' : 'Non Connecté'}
                </span>
              </div>
              {diagnosticResults.localStorage.hasNetlifyConnection && (
                <>
                  <div className="text-xs text-bolt-elements-textSecondary dark:text-bolt-elements-textSecondary mt-2 flex items-center gap-1.5">
                    <div className="i-ph:user w-3.5 h-3.5 text-bolt-elements-item-contentAccent dark:text-bolt-elements-item-contentAccent" />
                    User:{' '}
                    {diagnosticResults.localStorage.netlifyConnectionParsed?.user?.full_name ||
                      diagnosticResults.localStorage.netlifyConnectionParsed?.user?.email ||
                      'N/A'}
                  </div>
                  <div className="text-xs text-bolt-elements-textSecondary dark:text-bolt-elements-textSecondary mt-2 flex items-center gap-1.5">
                    <div className="i-ph:check-circle w-3.5 h-3.5 text-bolt-elements-item-contentAccent dark:text-bolt-elements-item-contentAccent" />
                    API Status:{' '}
                    <Badge
                      variant={diagnosticResults.apiEndpoints.netlify?.ok ? 'default' : 'destructive'}
                      className="ml-1"
                    >
                      {diagnosticResults.apiEndpoints.netlify?.ok ? 'OK' : 'Failed'}
                    </Badge>
                  </div>
                </>
              )}
              {!diagnosticResults.localStorage.hasNetlifyConnection && (
                <Button
                  onClick={() => window.location.reload()}
                  variant="outline"
                  size="sm"
                  className="mt-auto self-start hover:bg-bolt-elements-item-backgroundActive/10 hover:text-bolt-elements-textPrimary dark:hover:bg-bolt-elements-item-backgroundActive/10 dark:hover:text-bolt-elements-textPrimary transition-colors"
                >
                  <div className="i-ph:plug w-3.5 h-3.5 mr-1" />
                  Connectez-vous maintenant
                </Button>
              )}
            </>
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-sm text-bolt-elements-textSecondary dark:text-bolt-elements-textSecondary flex items-center gap-2">
                <div className="i-ph:info w-4 h-4" />
                Exécutez des diagnostics pour vérifier l'état de la connexion
              </div>
            </div>
          )}
        </div>

        {/* Vercel Connection Card */}
        <div className="p-4 rounded-lg bg-bolt-elements-background dark:bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor dark:border-bolt-elements-borderColor hover:border-bolt-elements-borderColorActive/70 dark:hover:border-bolt-elements-borderColorActive/70 transition-all duration-200 h-[180px] flex flex-col">
          <div className="flex items-center gap-2">
            <div className="i-si:vercel text-bolt-elements-item-contentAccent dark:text-bolt-elements-item-contentAccent w-4 h-4" />
            <div className="text-sm font-medium text-bolt-elements-textPrimary dark:text-bolt-elements-textPrimary">
            Connexion Vercel
            </div>
          </div>
          {diagnosticResults ? (
            <>
              <div className="flex items-center gap-2 mt-2">
                <span
                  className={classNames(
                    'text-xl font-semibold',
                    diagnosticResults.localStorage.hasVercelConnection
                      ? 'text-green-500 dark:text-green-400'
                      : 'text-red-500 dark:text-red-400',
                  )}
                >
                  {diagnosticResults.localStorage.hasVercelConnection ? 'Connecté' : 'Non Connecté'}
                </span>
              </div>
              {diagnosticResults.localStorage.hasVercelConnection && (
                <>
                  <div className="text-xs text-bolt-elements-textSecondary dark:text-bolt-elements-textSecondary mt-2 flex items-center gap-1.5">
                    <div className="i-ph:user w-3.5 h-3.5 text-bolt-elements-item-contentAccent dark:text-bolt-elements-item-contentAccent" />
                    User:{' '}
                    {diagnosticResults.localStorage.vercelConnectionParsed?.user?.name ||
                      diagnosticResults.localStorage.vercelConnectionParsed?.user?.email ||
                      'N/A'}
                  </div>
                  <div className="text-xs text-bolt-elements-textSecondary dark:text-bolt-elements-textSecondary mt-2 flex items-center gap-1.5">
                    <div className="i-ph:check-circle w-3.5 h-3.5 text-bolt-elements-item-contentAccent dark:text-bolt-elements-item-contentAccent" />
                    API Status:{' '}
                    <Badge
                      variant={diagnosticResults.apiEndpoints.vercel?.ok ? 'default' : 'destructive'}
                      className="ml-1"
                    >
                      {diagnosticResults.apiEndpoints.vercel?.ok ? 'OK' : 'Failed'}
                    </Badge>
                  </div>
                </>
              )}
              {!diagnosticResults.localStorage.hasVercelConnection && (
                <Button
                  onClick={() => window.location.reload()}
                  variant="outline"
                  size="sm"
                  className="mt-auto self-start hover:bg-bolt-elements-item-backgroundActive/10 hover:text-bolt-elements-textPrimary dark:hover:bg-bolt-elements-item-backgroundActive/10 dark:hover:text-bolt-elements-textPrimary transition-colors"
                >
                  <div className="i-ph:plug w-3.5 h-3.5 mr-1" />
                  Connectez-vous maintenant
                </Button>
              )}
            </>
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-sm text-bolt-elements-textSecondary dark:text-bolt-elements-textSecondary flex items-center gap-2">
                <div className="i-ph:info w-4 h-4" />
                Exécutez des diagnostics pour vérifier l'état de la connexion
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-4">
        <Button
          onClick={runDiagnostics}
          disabled={isRunning}
          variant="outline"
          className="flex items-center gap-2 hover:bg-bolt-elements-item-backgroundActive/10 hover:text-bolt-elements-textPrimary dark:hover:bg-bolt-elements-item-backgroundActive/10 dark:hover:text-bolt-elements-textPrimary transition-colors"
        >
          {isRunning ? (
            <div className="i-ph:spinner-gap w-4 h-4 animate-spin" />
          ) : (
            <div className="i-ph:activity w-4 h-4" />
          )}
          {isRunning ? 'Exécution des diagnostics...' : 'Exécuter les diagnostics'}
        </Button>

        <Button
          onClick={resetGitHubConnection}
          disabled={isRunning}
          variant="outline"
          className="flex items-center gap-2 hover:bg-bolt-elements-item-backgroundActive/10 hover:text-bolt-elements-textPrimary dark:hover:bg-bolt-elements-item-backgroundActive/10 dark:hover:text-bolt-elements-textPrimary transition-colors"
        >
          <div className="i-ph:github-logo w-4 h-4" />
          Réinitialiser la connexion GitHub
        </Button>

        <Button
          onClick={resetNetlifyConnection}
          disabled={isRunning}
          variant="outline"
          className="flex items-center gap-2 hover:bg-bolt-elements-item-backgroundActive/10 hover:text-bolt-elements-textPrimary dark:hover:bg-bolt-elements-item-backgroundActive/10 dark:hover:text-bolt-elements-textPrimary transition-colors"
        >
          <div className="i-si:netlify w-4 h-4" />
          Réinitialiser la connexion Netlify
        </Button>

        <Button
          onClick={resetVercelConnection}
          disabled={isRunning}
          variant="outline"
          className="flex items-center gap-2 hover:bg-bolt-elements-item-backgroundActive/10 hover:text-bolt-elements-textPrimary dark:hover:bg-bolt-elements-item-backgroundActive/10 dark:hover:text-bolt-elements-textPrimary transition-colors"
        >
          <div className="i-si:vercel w-4 h-4" />
          Réinitialiser la connexion Vercel
        </Button>
      </div>

      {/* Details Panel */}
      {diagnosticResults && (
        <div className="mt-4">
          <Collapsible open={showDetails} onOpenChange={setShowDetails} className="w-full">
            <CollapsibleTrigger className="w-full">
              <div className="flex items-center justify-between p-4 rounded-lg bg-bolt-elements-background dark:bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor dark:border-bolt-elements-borderColor hover:border-bolt-elements-borderColorActive/70 dark:hover:border-bolt-elements-borderColorActive/70 transition-all duration-200">
                <div className="flex items-center gap-2">
                  <CodeBracketIcon className="w-4 h-4 text-blue-500" />
                  <span className="text-sm font-medium text-bolt-elements-textPrimary dark:text-bolt-elements-textPrimary">
                  Détails du diagnostic
                  </span>
                </div>
                <ChevronDownIcon
                  className={classNames(
                    'w-4 h-4 transform transition-transform duration-200 text-bolt-elements-textSecondary dark:text-bolt-elements-textSecondary',
                    showDetails ? 'rotate-180' : '',
                  )}
                />
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent className="overflow-hidden">
              <div className="p-4 mt-2 rounded-lg bg-bolt-elements-background-depth-2 dark:bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor dark:border-bolt-elements-borderColor">
                <pre className="text-xs overflow-auto max-h-96 text-bolt-elements-textSecondary dark:text-bolt-elements-textSecondary">
                  {JSON.stringify(diagnosticResults, null, 2)}
                </pre>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      )}
    </div>
  );
}
