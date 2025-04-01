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

export const ProjectList = ({ onClose, onImportToChat }: { onClose: () => void; onImportToChat?: (project: Project) => void }) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [githubUrl, setGithubUrl] = useState('');
  const [importing, setImporting] = useState(false);

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
      className="bg-white dark:bg-gray-900 rounded-lg shadow-lg border border-gray-200 dark:border-gray-800 p-4 w-full max-w-md"
    >
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white">Projets GitHub</h2>
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
        >
          <span className="i-ph:x h-5 w-5" />
        </button>
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
          {projects.map((project) => (
            <a
              key={project.name}
              onClick={(e) => {
                e.preventDefault();
                const gitUrl = `http://localhost:5173/git?url=${project.url}`;
                window.open(gitUrl, '_blank');
              }}
              className="block p-4 rounded-lg bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all duration-300 transform hover:-translate-y-1 hover:shadow-lg relative group"
            >
              <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 flex gap-2 transition-opacity">
                {onImportToChat && (
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onImportToChat(project);
                      toast.success('Projet importé dans le chat');
                    }}
                    className="p-1.5 rounded-lg bg-purple-500 text-white hover:bg-purple-600 transition-colors"
                    title="Importer dans le chat"
                  >
                    <span className="i-ph:chat-circle-dots w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const gitUrl = `http://localhost:5173/git?url=${project.url}`;
                    window.open(gitUrl, '_blank');
                  }}
                  className="p-1.5 rounded-lg bg-green-500 text-white hover:bg-green-600 transition-colors"
                  title="Ouvrir dans Git"
                >
                  <span className="i-ph:git-branch w-4 h-4" />
                </button>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const gitUrl = `http://localhost:5173/git?url=${project.url}`;
                    window.open(gitUrl, '_blank');
                  }}
                  className="p-1.5 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors"
                  title="Supprimer le projet"
                >
                  <span className="i-ph:trash w-4 h-4" />
                </button>
              </div>
              <h3 className="text-base font-medium text-gray-900 dark:text-white mb-1 flex items-center gap-2">
                <span className="i-ph:git-repository" />
                {project.name}
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                {project.description}
              </p>
              <div className="flex items-center gap-4 mb-3 text-sm text-gray-600 dark:text-gray-400">
                {project.stars !== undefined && (
                  <div className="flex items-center gap-1">
                    <span className="i-ph:star" />
                    {project.stars}
                  </div>
                )}
                {project.forks !== undefined && (
                  <div className="flex items-center gap-1">
                    <span className="i-ph:git-fork" />
                    {project.forks}
                  </div>
                )}
                {project.updatedAt && (
                  <div className="flex items-center gap-1">
                    <span className="i-ph:clock" />
                    {new Date(project.updatedAt).toLocaleDateString()}
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {project.languages.map((lang) => (
                  <span
                    key={lang}
                    className="px-2 py-1 text-xs rounded-full bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300 flex items-center gap-1"
                  >
                    <span className="i-ph:code" />
                    {lang}
                  </span>
                ))}
              </div>
            </a>
          ))}
        </div>
      )}
    </motion.div>
  );
};