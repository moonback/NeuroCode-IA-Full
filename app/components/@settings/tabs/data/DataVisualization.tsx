import { useState, useEffect } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  PointElement,
  LineElement,
} from 'chart.js';
import { Bar, Pie } from 'react-chartjs-2';
import type { Chat } from '~/lib/persistence/chats';

// Register ChartJS components
ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement, PointElement, LineElement);

type DataVisualizationProps = {
  chats: Chat[];
};

export function DataVisualization({ chats }: DataVisualizationProps) {
  const [chatsByDate, setChatsByDate] = useState<Record<string, number>>({});
  const [messagesByRole, setMessagesByRole] = useState<Record<string, number>>({});
  const [apiKeyUsage, setApiKeyUsage] = useState<Array<{ provider: string; count: number }>>([]);
  const [averageMessagesPerChat, setAverageMessagesPerChat] = useState<number>(0);

  // Detect dark mode

  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    // Check if dark mode is enabled
    const isDark = document.documentElement.classList.contains('dark');
    setIsDarkMode(isDark);

    // Listen for theme changes
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === 'class') {
          const isDark = document.documentElement.classList.contains('dark');
          setIsDarkMode(isDark);
        }
      });
    });

    observer.observe(document.documentElement, { attributes: true });

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!chats || chats.length === 0) {
      return;
    }

    // Process chat data
    const chatDates: Record<string, number> = {};
    const roleCounts: Record<string, number> = {};
    const apiUsage: Record<string, number> = {};
    let totalMessages = 0;

    chats.forEach((chat) => {
      // Count chats by date
      const date = new Date(chat.timestamp).toLocaleDateString();
      chatDates[date] = (chatDates[date] || 0) + 1;

      // Count messages by role
      chat.messages.forEach((message) => {
        roleCounts[message.role] = (roleCounts[message.role] || 0) + 1;
        totalMessages++;

        // Estimate API usage by assistant messages (simplified)
        if (message.role === 'assistant') {
          // Extract provider from message content if available
          const providerMatch = message.content.match(/provider:\s*([\w-]+)/i);
          const provider = providerMatch ? providerMatch[1] : 'unknown';
          apiUsage[provider] = (apiUsage[provider] || 0) + 1;
        }
      });
    });

    // Sort dates chronologically
    const sortedDates = Object.keys(chatDates).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

    // Create sorted data objects
    const sortedChatsByDate: Record<string, number> = {};
    sortedDates.forEach((date) => {
      sortedChatsByDate[date] = chatDates[date];
    });

    // Calculate average messages per chat
    const avgMessages = totalMessages / chats.length;

    // Convert API usage to array format
    const apiUsageArray = Object.entries(apiUsage).map(([provider, count]) => ({
      provider,
      count,
    }));

    // Update state
    setChatsByDate(sortedChatsByDate);
    setMessagesByRole(roleCounts);
    setApiKeyUsage(apiUsageArray);
    setAverageMessagesPerChat(avgMessages);
  }, [chats]);

  // Get theme-appropriate colors
  const getThemeColors = () => {
    return {
      gridColor: isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
      textColor: isDarkMode ? 'rgba(255, 255, 255, 0.8)' : 'rgba(0, 0, 0, 0.8)',
      barColor: isDarkMode ? 'rgba(79, 70, 229, 0.7)' : 'rgba(79, 70, 229, 0.5)',
      barBorderColor: isDarkMode ? 'rgba(79, 70, 229, 0.9)' : 'rgba(79, 70, 229, 0.8)',
    };
  };

  const { gridColor, textColor, barColor, barBorderColor } = getThemeColors();

  // Prepare data for charts
  const chatHistoryData = {
    labels: Object.keys(chatsByDate),
    datasets: [
      {
        label: 'Chats créés',
        data: Object.values(chatsByDate),
        backgroundColor: barColor,
        borderColor: barBorderColor,
        borderWidth: 1,
      },
    ],
  };

  const messageRoleData = {
    labels: Object.keys(messagesByRole),
    datasets: [
      {
        label: 'Messages par rôle',
        data: Object.values(messagesByRole),
        backgroundColor: [
          'rgba(255, 99, 132, 0.7)',
          'rgba(54, 162, 235, 0.7)',
          'rgba(255, 206, 86, 0.7)',
          'rgba(75, 192, 192, 0.7)',
        ],
        borderColor: [
          'rgba(255, 99, 132, 1)',
          'rgba(54, 162, 235, 1)',
          'rgba(255, 206, 86, 1)',
          'rgba(75, 192, 192, 1)',
        ],
        borderWidth: 1,
      },
    ],
  };

  const apiUsageData = {
    labels: apiKeyUsage.map((item) => item.provider),
    datasets: [
      {
        label: 'Utilisation de l\'API',
        data: apiKeyUsage.map((item) => item.count),
        backgroundColor: [
          'rgba(153, 102, 255, 0.7)',
          'rgba(255, 159, 64, 0.7)',
          'rgba(255, 99, 132, 0.7)',
          'rgba(54, 162, 235, 0.7)',
          'rgba(255, 206, 86, 0.7)',
        ],
        borderColor: [
          'rgba(153, 102, 255, 1)',
          'rgba(255, 159, 64, 1)',
          'rgba(255, 99, 132, 1)',
          'rgba(54, 162, 235, 1)',
          'rgba(255, 206, 86, 1)',
        ],
        borderWidth: 1,
      },
    ],
  };

  // Chart options with theme-aware styling
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          color: textColor,
        },
      },
      title: {
        display: true,
        text: 'Historique des discussions',
        color: textColor,
      },
    },
    scales: {
      x: {
        grid: {
          color: gridColor,
        },
        ticks: {
          color: textColor,
        },
      },
      y: {
        grid: {
          color: gridColor,
        },
        ticks: {
          color: textColor,
        },
      },
    },
  };

  const pieOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          color: textColor,
        },
      },
      title: {
        display: true,
        text: 'Distribution des messages',
        color: textColor,
      },
    },
  };

  if (chats.length === 0) {
    return (
      <div className="text-center py-8">
        <div className="i-ph-chart-line-duotone w-12 h-12 mx-auto mb-4 text-gray-400 dark:text-gray-600" />
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Aucune donnée disponible</h3>
        <p className="text-gray-600 dark:text-gray-400">
        Commencez à créer des chats pour voir vos statistiques d'utilisation et la visualisation des données.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Total Conversations</h3>
          <div className="flex items-center">
            <div className="i-ph-chats-duotone w-8 h-8 text-purple-500 mr-3" />
            <span className="text-3xl font-bold text-gray-900 dark:text-white">{chats.length}</span>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Nombre total de messages
          </h3>
          <div className="flex items-center">
            <div className="i-ph-chat-text-duotone w-8 h-8 text-blue-500 mr-3" />
            <span className="text-3xl font-bold text-gray-900 dark:text-white">
              {Object.values(messagesByRole).reduce((sum, count) => sum + count, 0)}
            </span>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Moyenne des messages/discussions
          </h3>
          <div className="flex items-center">
            <div className="i-ph-chart-bar-duotone w-8 h-8 text-green-500 mr-3" />
            <span className="text-3xl font-bold text-gray-900 dark:text-white">
              {averageMessagesPerChat.toFixed(1)}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Historique des discussions</h3>
          <div className="h-64">
            <Bar data={chatHistoryData} options={chartOptions} />
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Distribution des messages</h3>
          <div className="h-64">
            <Pie data={messageRoleData} options={pieOptions} />
          </div>
        </div>
      </div>

      {apiKeyUsage.length > 0 && (
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Utilisation de l'API par le fournisseur</h3>
          <div className="h-64">
            <Pie data={apiUsageData} options={pieOptions} />
          </div>
        </div>
      )}
    </div>
  );
}
