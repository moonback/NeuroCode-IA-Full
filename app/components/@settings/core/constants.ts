import type { TabType } from './types';

export const TAB_ICONS: Record<TabType, string> = {
  profile: 'i-ph:user-circle-fill',
  settings: 'i-ph:gear-six-fill',
  notifications: 'i-ph:bell-fill',
  features: 'i-ph:star-fill',
  data: 'i-ph:database-fill',
  'cloud-providers': 'i-ph:cloud-fill',
  'local-providers': 'i-ph:desktop-fill',
  'service-status': 'i-ph:activity-bold',
  connection: 'i-ph:wifi-high-fill',
  debug: 'i-ph:bug-fill',
  'event-logs': 'i-ph:list-bullets-fill',
  update: 'i-ph:arrow-clockwise-fill',
  'task-manager': 'i-ph:chart-line-fill',
  'tab-management': 'i-ph:squares-four-fill',
};

export const TAB_LABELS: Record<TabType, string> = {
  profile: 'Profil',
  settings: 'Paramètres',
  notifications: 'Notifications',
  features: 'Fonctionnalités',
  data: 'Gestion des données',
  'cloud-providers': 'Fournisseurs Cloud',
  'local-providers': 'Fournisseurs Locaux',
  'service-status': 'État du Service',
  connection: 'Connexion',
  debug: 'Débogage',
  'event-logs': 'Journaux d\'événements',
  update: 'Mises à jour',
  'task-manager': 'Gestionnaire de tâches',
  'tab-management': 'Gestion des onglets',
};

export const TAB_DESCRIPTIONS: Record<TabType, string> = {
  profile: 'Gérez votre profil et les paramètres de votre compte',
  settings: 'Configurez les préférences de l\'application',
  notifications: 'Consultez et gérez vos notifications',
  features: 'Découvrez les nouvelles fonctionnalités et celles à venir',
  data: 'Gérez vos données et votre stockage',
  'cloud-providers': 'Configurez les fournisseurs et modèles d\'IA Cloud',
  'local-providers': 'Configurez les fournisseurs et modèles d\'IA locaux',
  'service-status': 'Surveillez l\'état des services LLM Cloud',
  connection: 'Vérifiez l\'état de la connexion et les paramètres',
  debug: 'Outils de débogage et informations système',
  'event-logs': 'Consultez les événements et journaux système',
  update: 'Vérifiez les mises à jour et les notes de version',
  'task-manager': 'Surveillez les ressources système et les processus',
  'tab-management': 'Configurez les onglets visibles et leur ordre',
};

export const DEFAULT_TAB_CONFIG = [
  // User Window Tabs (Always visible by default)
  { id: 'features', visible: true, window: 'user' as const, order: 0 },
  { id: 'data', visible: true, window: 'user' as const, order: 1 },
  { id: 'cloud-providers', visible: true, window: 'user' as const, order: 2 },
  { id: 'local-providers', visible: true, window: 'user' as const, order: 3 },
  { id: 'connection', visible: true, window: 'user' as const, order: 4 },
  { id: 'notifications', visible: true, window: 'user' as const, order: 5 },
  { id: 'event-logs', visible: true, window: 'user' as const, order: 6 },

  // User Window Tabs (In dropdown, initially hidden)
  { id: 'profile', visible: false, window: 'user' as const, order: 7 },
  { id: 'settings', visible: false, window: 'user' as const, order: 8 },
  { id: 'task-manager', visible: false, window: 'user' as const, order: 9 },
  { id: 'service-status', visible: false, window: 'user' as const, order: 10 },

  // User Window Tabs (Hidden, controlled by TaskManagerTab)
  { id: 'debug', visible: false, window: 'user' as const, order: 11 },
  { id: 'update', visible: false, window: 'user' as const, order: 12 },

  // Developer Window Tabs (All visible by default)
  { id: 'features', visible: true, window: 'developer' as const, order: 0 },
  { id: 'data', visible: true, window: 'developer' as const, order: 1 },
  { id: 'cloud-providers', visible: true, window: 'developer' as const, order: 2 },
  { id: 'local-providers', visible: true, window: 'developer' as const, order: 3 },
  { id: 'connection', visible: true, window: 'developer' as const, order: 4 },
  { id: 'notifications', visible: true, window: 'developer' as const, order: 5 },
  { id: 'event-logs', visible: true, window: 'developer' as const, order: 6 },
  { id: 'profile', visible: true, window: 'developer' as const, order: 7 },
  { id: 'settings', visible: true, window: 'developer' as const, order: 8 },
  { id: 'task-manager', visible: true, window: 'developer' as const, order: 9 },
  { id: 'service-status', visible: true, window: 'developer' as const, order: 10 },
  { id: 'debug', visible: true, window: 'developer' as const, order: 11 },
  { id: 'update', visible: true, window: 'developer' as const, order: 12 },
];
