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
  favorite?: boolean;
}

interface Filters {
  language: string;
  dateRange: 'all' | 'week' | 'month' | 'year';
  minStars: number;
  sortBy: 'updated' | 'stars' | 'name';
  showFavorites: boolean;
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
    sortBy: 'updated',
    showFavorites: false
  });
  
  const allLanguages = [...new Set(projects.flatMap(p => p.languages))].sort();

  const toggleFavorite = (projectToUpdate: Project) => {
    const updatedProjects = projects.map(project => 
      project.name === projectToUpdate.name 
        ? { ...project, favorite: !project.favorite }
        : project
    );
    setProjects(updatedProjects);
    setLocalStorage('github_projects', updatedProjects);
    toast.success(projectToUpdate.favorite ? 'Projet retiré des favoris' : 'Projet ajouté aux favoris');
  };

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
      const initializedProjects = savedProjects.map((project: { favorite: undefined; }) => ({
        ...project,
        favorite: project.favorite === undefined ? false : project.favorite
      }));
      setProjects(initializedProjects);
      setLocalStorage('github_projects', initializedProjects);
    }
    setLoading(false);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="bg-white dark:bg-gray-900 rounded-lg shadow-lg border border-gray-200 dark:border-gray-800 p-6 w-full max-w-[90vw] h-[90vh] overflow-hidden flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Bibliotheque Projets GitHub</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Gérez et importez vos projets GitHub favoris
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => window.open('https://github.com', '_blank')}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            title="Ouvrir GitHub"
          >
            <span className="i-ph:github-logo h-5 w-5" />
          </button>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            title="Fermer"
          >
            <span className="i-ph:x h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Import URL input */}
      <div className="mb-6 flex gap-2">
        <input
          type="text"
          value={githubUrl}
          onChange={(e) => setGithubUrl(e.target.value)}
          placeholder="Entrez l'URL du dépôt GitHub"
          className="flex-1 px-4 py-3 rounded-lg text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all outline-none text-gray-900 dark:text-white"
        />
        <button
          onClick={importGithubProject}
          disabled={importing || !githubUrl}
          className="px-5 py-3 rounded-lg text-sm bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 font-medium shadow-sm hover:shadow-md transition-all"
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

      {/* Filters */}
      <div className="mb-6 space-y-4 p-5 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-medium text-gray-900 dark:text-white">Filtres</h3>
          <button
            onClick={() => setFilters(prev => ({ ...prev, showFavorites: !prev.showFavorites }))}
            className={`p-2 rounded-lg ${filters.showFavorites ? 'bg-yellow-400 text-yellow-900' : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'} hover:opacity-90 transition-all flex items-center gap-2`}
            title="Afficher uniquement les favoris"
          >
            <span className={`h-5 w-5 ${filters.showFavorites ? 'i-ph:star-fill' : 'i-ph:star'}`} />
            {filters.showFavorites ? 'Favoris uniquement' : 'Tous les projets'}
          </button>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Langage</label>
            <select
              value={filters.language}
              onChange={(e) => setFilters(prev => ({ ...prev, language: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all outline-none text-gray-900 dark:text-white"
            >
              <option value="">Tous les langages</option>
              {allLanguages.map(lang => (
                <option key={lang} value={lang}>{lang}</option>
              ))}
            </select>
          </div>
          
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Période</label>
            <select
              value={filters.dateRange}
              onChange={(e) => setFilters(prev => ({ ...prev, dateRange: e.target.value as Filters['dateRange'] }))}
              className="w-full px-3 py-2 rounded-lg text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all outline-none text-gray-900 dark:text-white"
            >
              <option value="all">Toutes les dates</option>
              <option value="week">Cette semaine</option>
              <option value="month">Ce mois</option>
              <option value="year">Cette année</option>
            </select>
          </div>
          
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Tri</label>
            <select
              value={filters.sortBy}
              onChange={(e) => setFilters(prev => ({ ...prev, sortBy: e.target.value as Filters['sortBy'] }))}
              className="w-full px-3 py-2 rounded-lg text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all outline-none text-gray-900 dark:text-white"
            >
              <option value="updated">Trié par date de mise à jour</option>
              <option value="stars">Trié par étoiles</option>
              <option value="name">Trié par nom</option>
            </select>
          </div>
          
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Étoiles minimum</label>
            <input
              type="number"
              value={filters.minStars}
              onChange={(e) => setFilters(prev => ({ ...prev, minStars: parseInt(e.target.value) || 0 }))}
              placeholder="Min étoiles"
              className="w-full px-3 py-2 rounded-lg text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all outline-none text-gray-900 dark:text-white"
            />
          </div>
        </div>
      </div>

      {/* Project List */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="animate-spin h-10 w-10 text-purple-500">
              <span className="i-ph:spinner" />
            </div>
            <p className="text-gray-500 dark:text-gray-400">Chargement des projets...</p>
          </div>
        </div>
      ) : error ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-red-500 dark:text-red-400 text-center py-4 max-w-md">
            <span className="i-ph:warning-circle text-5xl mb-3 mx-auto block" />
            <h3 className="text-lg font-medium mb-2">Une erreur est survenue</h3>
            <p>{error}</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
          {projects.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-10">
              <span className="i-ph:folder-open text-6xl text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-700 dark:text-gray-300 mb-2">Aucun projet trouvé</h3>
              <p className="text-gray-500 dark:text-gray-400 max-w-md mb-6">
                Importez votre premier projet GitHub en collant l'URL du dépôt dans le champ ci-dessus.
              </p>
              <a 
                href="https://github.com" 
                target="_blank" 
                rel="noopener noreferrer"
                className="px-4 py-2 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-lg flex items-center gap-2 hover:bg-purple-200 dark:hover:bg-purple-900/50 transition-colors"
              >
                <span className="i-ph:github-logo" />
                Explorer GitHub
              </a>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {projects
                .filter(project => {
                  if (filters.showFavorites && !project.favorite) return false;
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
                    initial={{ opacity: 0, y: 20, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -20, scale: 0.95 }}
                    transition={{ 
                      duration: 0.3,
                      ease: [0.4, 0, 0.2, 1],
                      scale: { duration: 0.2 }
                    }}
                    whileHover={{ 
                      scale: 1.02,
                      boxShadow: '0 8px 30px rgba(0, 0, 0, 0.12)',
                      y: -2
                    }}
                    className={`group relative p-4 rounded-xl h-full flex flex-col ${project.favorite ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800' : 'bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700'} hover:bg-gray-50 dark:hover:bg-gray-700 transition-all duration-300 border shadow-sm hover:shadow-md`}                
                  >
                    {project.favorite && (
                      <div className="absolute top-3 right-3">
                        <span className="i-ph:star-fill text-yellow-400 h-5 w-5" />
                      </div>
                    )}
                    
                    <div className="flex justify-between items-start mb-3">
                      <a
                        href={`/git?url=${encodeURIComponent(project.url)}`}
                        className="text-lg font-bold text-gray-900 dark:text-white hover:text-purple-600 dark:hover:text-purple-400 transition-colors group-hover:text-purple-600 dark:group-hover:text-purple-400 line-clamp-1"
                      >
                        {project.name}
                      </a>
                      <div className="flex gap-1">
                      <button
  onClick={() => onImportToChat?.(project)}
  className="opacity-0 group-hover:opacity-100 transition-all duration-300 p-2 rounded-full bg-purple-50 dark:bg-purple-900/20 hover:bg-purple-100 dark:hover:bg-purple-800/30 hover:scale-105 transform flex items-center justify-center"
  title="Importer dans le chat"
  aria-label="Importer dans le chat"
>
  <span className="i-ph:chat-circle-text h-5 w-5 text-purple-600 dark:text-purple-400" />
</button>

<button
  onClick={() => toggleFavorite(project)}
  className="opacity-0 group-hover:opacity-100 transition-all duration-300 p-2 rounded-full bg-yellow-50 dark:bg-yellow-900/20 hover:bg-yellow-100 dark:hover:bg-yellow-800/30 hover:scale-105 transform flex items-center justify-center"
  title={project.favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
  aria-label={project.favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
>
  <span className={`h-5 w-5 ${project.favorite ? 'text-yellow-500 i-ph:star-fill' : 'text-yellow-500 dark:text-yellow-400 i-ph:star'}`} />
</button>

<button
  onClick={() => deleteProject(project)}
  className="opacity-0 group-hover:opacity-100 transition-all duration-300 p-2 rounded-full bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-800/30 hover:scale-105 transform flex items-center justify-center"
  title="Supprimer"
  aria-label="Supprimer"
>
  <span className="i-ph:trash h-5 w-5 text-red-500 dark:text-red-400" />
</button>
                      </div>
                    </div>

                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-3 line-clamp-2 group-hover:line-clamp-3 transition-all duration-300 flex-grow">{project.description}</p>

                    <div className="flex flex-wrap gap-1 mb-3">
                      {project.languages.slice(0, 3).map(lang => (
                        <motion.span
                          key={lang}
                          whileHover={{ scale: 1.1 }}
                          className="px-2 py-1 text-xs font-medium rounded-full bg-purple-50 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 border border-purple-100 dark:border-purple-800 shadow-sm"
                        >
                          {lang}
                        </motion.span>
                      ))}
                      {project.languages.length > 3 && (
                        <span className="px-2 py-1 text-xs font-medium rounded-full bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                          +{project.languages.length - 3}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3 text-xs text-gray-600 dark:text-gray-400 border-t dark:border-gray-700 pt-3 mt-auto">
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
                          className="flex items-center gap-1 ml-auto"
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
        </div>
      )}
    </motion.div>
  );
};
