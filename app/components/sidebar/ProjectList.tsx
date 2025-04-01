import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { classNames } from '~/utils/classNames';
import { toast } from 'react-toastify';
import { getLocalStorage, setLocalStorage } from '~/lib/persistence';

interface Project {
  name: string;
  description: string;
  languages: string[];
  url: string;
  content?: string;
  stars?: number;
  forks?: number;
  updatedAt?: string;
}

interface Filters {
  language: string;
  dateRange: 'all' | 'week' | 'month' | 'year';
  minStars: number;
  sortBy: 'updated' | 'stars' | 'name';
}

export const ProjectList = ({ onClose, onImportToChat }: { onClose: () => void; onImportToChat?: (project: Project) => void }) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [githubUrl, setGithubUrl] = useState('');
  const [importing, setImporting] = useState(false);
  const [filters, setFilters] = useState<Filters>({
    language: '',
    dateRange: 'all',
    minStars: 0,
    sortBy: 'updated'
  });
  
  const allLanguages = [...new Set(projects.flatMap(p => p.languages))].sort();

  const deleteProject = (projectToDelete: Project) => {
    const updatedProjects = projects.filter(project => project.name !== projectToDelete.name);
    setProjects(updatedProjects);
    setLocalStorage('github_projects', updatedProjects);
    toast.success('Projet supprimé avec succès');
  };

  const importGithubProject = async () => {
    if (!githubUrl) {
      toast.error('Veuillez entrer une URL GitHub valide');
      return;
    }

    setImporting(true);
    try {
      const url = new URL(githubUrl);
      const [, owner, repo] = url.pathname.split('/');
      
      const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`);
      const data = await response.json() as {
          forks_count: number | undefined;
          updated_at: string | undefined;
          stargazers_count: number | undefined; name: string; description: string | null; languages_url: string; html_url: string; message?: string 
};
      
      if (!response.ok) {
        throw new Error(data.message || 'Erreur lors de l\'importation du projet');
      }

      const languagesResponse = await fetch(data.languages_url);
      const languagesData = await languagesResponse.json() as Record<string, number>;
      
      const newProject: Project = {
        name: data.name,
        description: data.description || 'Aucune description disponible',
        languages: Object.keys(languagesData),
        url: data.html_url,
        stars: data.stargazers_count,
        forks: data.forks_count,
        updatedAt: data.updated_at
      };

      const updatedProjects = [newProject, ...projects];
      setProjects(updatedProjects);
      setLocalStorage('github_projects', updatedProjects);
      setGithubUrl('');
      toast.success('Projet importé avec succès');
    } catch (err) {
      toast.error('Erreur lors de l\'importation du projet');
      console.error('Import error:', err);
    } finally {
      setImporting(false);
    }
  };

  useEffect(() => {
    const savedProjects = getLocalStorage('github_projects');
    if (savedProjects) {
      setProjects(savedProjects);
    }
    setLoading(false);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="bg-white dark:bg-gray-900 rounded-lg shadow-lg border border-gray-200 dark:border-gray-800 p-4 w-full max-w-md"
    >
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-medium text-gray-900 dark:text-white">Bibliotheque Projets GitHub</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Gérez et importez vos projets GitHub favoris
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => window.open('https://github.com', '_blank')}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
            title="Ouvrir GitHub"
          >
            <span className="i-ph:github-logo h-5 w-5" />
          </button>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
            title="Fermer"
          >
            <span className="i-ph:x h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="mb-4 flex gap-2">
        <input
          type="text"
          value={githubUrl}
          onChange={(e) => setGithubUrl(e.target.value)}
          placeholder="Entrez l'URL du dépôt GitHub"
          className="flex-1 px-3 py-2 rounded-lg text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
        />
        <button
          onClick={importGithubProject}
          disabled={importing || !githubUrl}
          className="px-4 py-2 rounded-lg text-sm bg-purple-500 text-white hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {importing ? (
            <>
              <span className="i-ph:spinner animate-spin" />
              Importation...
            </>
          ) : (
            <>
              <span className="i-ph:plus" />
              Importer
            </>
          )}
        </button>
      </div>

      <div className="mb-4 text-white space-y-3 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
        <div className="flex items-center gap-2">
          <select
            value={filters.language}
            onChange={(e) => setFilters(prev => ({ ...prev, language: e.target.value }))}
            className="flex-1 px-3 py-2 rounded-lg text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700"
          >
            <option value="">Tous les langages</option>
            {allLanguages.map(lang => (
              <option key={lang} value={lang}>{lang}</option>
            ))}
          </select>
          <select
            value={filters.dateRange}
            onChange={(e) => setFilters(prev => ({ ...prev, dateRange: e.target.value as Filters['dateRange'] }))}
            className="flex-1 px-3 py-2 rounded-lg text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700"
          >
            <option value="all">Toutes les dates</option>
            <option value="week">Cette semaine</option>
            <option value="month">Ce mois</option>
            <option value="year">Cette année</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={filters.sortBy}
            onChange={(e) => setFilters(prev => ({ ...prev, sortBy: e.target.value as Filters['sortBy'] }))}
            className="flex-1 px-3 py-2 rounded-lg text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700"
          >
            <option value="updated">Trié par date de mise à jour</option>
            <option value="stars">Trié par étoiles</option>
            <option value="name">Trié par nom</option>
          </select>
          <input
            type="number"
            value={filters.minStars}
            onChange={(e) => setFilters(prev => ({ ...prev, minStars: parseInt(e.target.value) || 0 }))}
            placeholder="Min étoiles"
            className="w-32 px-3 py-2 rounded-lg text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin h-6 w-6 text-purple-500">
            <span className="i-ph:spinner" />
          </div>
        </div>
      ) : error ? (
        <div className="text-red-500 dark:text-red-400 text-center py-4">{error}</div>
      ) : (
        <div className="space-y-3">
          {projects
            .filter(project => {
              if (filters.language && !project.languages.includes(filters.language)) return false;
              if (filters.minStars && (project.stars || 0) < filters.minStars) return false;
              if (filters.dateRange !== 'all' && project.updatedAt) {
                const date = new Date(project.updatedAt);
                const now = new Date();
                switch (filters.dateRange) {
                  case 'week':
                    return now.getTime() - date.getTime() <= 7 * 24 * 60 * 60 * 1000;
                  case 'month':
                    return now.getTime() - date.getTime() <= 30 * 24 * 60 * 60 * 1000;
                  case 'year':
                    return now.getTime() - date.getTime() <= 365 * 24 * 60 * 60 * 1000;
                }
              }
              return true;
            })
            .sort((a, b) => {
              switch (filters.sortBy) {
                case 'stars':
                  return (b.stars || 0) - (a.stars || 0);
                case 'name':
                  return a.name.localeCompare(b.name);
                default:
                  return new Date(b.updatedAt || '').getTime() - new Date(a.updatedAt || '').getTime();
              }
            })
            .map(project => (
              <motion.div
                key={project.name}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
                whileHover={{ scale: 1.02 }}
                className="group relative p-4 rounded-lg bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all duration-300"
              >
                <div className="flex justify-between items-start mb-2">
                  <a
                    href={`/git?url=${encodeURIComponent(project.url)}`}
                    className="text-lg font-semibold text-gray-900 dark:text-white hover:text-purple-600 dark:hover:text-purple-400 transition-colors"
                  >
                    {project.name}
                  </a>
                  <div className="flex gap-2">
                    <button
                      onClick={() => onImportToChat?.(project)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600"
                      title="Importer dans le chat"
                    >
                      <span className="i-ph:chat-circle-text h-5 w-5 text-gray-600 dark:text-gray-400" />
                    </button>
                    <button
                      onClick={() => deleteProject(project)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600"
                      title="Supprimer"
                    >
                      <span className="i-ph:trash h-5 w-5 text-red-500" />
                    </button>
                  </div>
                </div>

                <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">{project.description}</p>

                <div className="flex flex-wrap gap-2 mb-3">
                  {project.languages.map(lang => (
                    <motion.span
                      key={lang}
                      whileHover={{ scale: 1.1 }}
                      className="px-2 py-1 text-xs font-medium rounded-full bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300"
                    >
                      {lang}
                    </motion.span>
                  ))}
                </div>

                <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                  {project.stars !== undefined && (
                    <motion.div 
                      className="flex items-center gap-1"
                      whileHover={{ scale: 1.1 }}
                      title="Stars"
                    >
                      <span className="i-ph:star text-yellow-500" />
                      {project.stars}
                    </motion.div>
                  )}
                  {project.forks !== undefined && (
                    <motion.div 
                      className="flex items-center gap-1"
                      whileHover={{ scale: 1.1 }}
                      title="Forks"
                    >
                      <span className="i-ph:git-fork text-blue-500" />
                      {project.forks}
                    </motion.div>
                  )}
                  {project.updatedAt && (
                    <motion.div 
                      className="flex items-center gap-1"
                      whileHover={{ scale: 1.1 }}
                      title="Dernière mise à jour"
                    >
                      <span className="i-ph:clock text-green-500" />
                      {new Date(project.updatedAt).toLocaleDateString()}
                    </motion.div>
                  )}
                </div>
              </motion.div>
            ))}
        </div>
      )}
    </motion.div>
  );
};
