import type { WebContainer } from '@webcontainer/api';
import { atom } from 'nanostores';

// Extend Window interface to include our custom property
declare global {
  interface Window {
    _tabId?: string;
  }
}

export interface PreviewInfo {
  port: number;
  ready: boolean;
  baseUrl: string;
}

// Create a broadcast channel for preview updates
const PREVIEW_CHANNEL = 'preview-updates';

export class PreviewsStore {
  #availablePreviews = new Map<number, PreviewInfo>();
  #webcontainer: Promise<WebContainer>;
  #broadcastChannel: BroadcastChannel;
  #lastUpdate = new Map<string, number>();
  #watchedFiles = new Set<string>();
  #refreshTimeouts = new Map<string, NodeJS.Timeout>();
  #REFRESH_DELAY = 300;
  #storageChannel: BroadcastChannel;
  #MAX_STORAGE_SIZE = 5 * 1024 * 1024; // 5MB limite par défaut
  #STORAGE_CLEANUP_THRESHOLD = 0.9; // 90% de la limite

  previews = atom<PreviewInfo[]>([]);

  constructor(webcontainerPromise: Promise<WebContainer>) {
    this.#webcontainer = webcontainerPromise;
    this.#broadcastChannel = new BroadcastChannel(PREVIEW_CHANNEL);
    this.#storageChannel = new BroadcastChannel('storage-sync-channel');

    // Listen for preview updates from other tabs
    this.#broadcastChannel.onmessage = (event) => {
      const { type, previewId } = event.data;

      if (type === 'file-change') {
        const timestamp = event.data.timestamp;
        const lastUpdate = this.#lastUpdate.get(previewId) || 0;

        if (timestamp > lastUpdate) {
          this.#lastUpdate.set(previewId, timestamp);
          this.refreshPreview(previewId);
        }
      }
    };

    // Listen for storage sync messages
    this.#storageChannel.onmessage = (event) => {
      const { storage, source } = event.data;

      if (storage && source !== this._getTabId()) {
        this._syncStorage(storage);
      }
    };

    // Override localStorage setItem to catch all changes
    if (typeof window !== 'undefined') {
      const originalSetItem = localStorage.setItem;

      localStorage.setItem = (...args) => {
        originalSetItem.apply(localStorage, args);
        this._broadcastStorageSync();
      };
    }

    this.#init();
  }

  // Generate a unique ID for this tab
  private _getTabId(): string {
    if (typeof window !== 'undefined') {
      if (!window._tabId) {
        window._tabId = Math.random().toString(36).substring(2, 15);
      }

      return window._tabId;
    }

    return '';
  }

  // Sync storage data between tabs
  private async _syncStorage(storage: Record<string, string>) {
    if (typeof window !== 'undefined') {
      // Vérifier l'espace disponible avant la synchronisation
      const totalSize = this._calculateStorageSize(storage);
      if (totalSize > this.#MAX_STORAGE_SIZE) {
        await this._cleanupStorage();
      }

      Object.entries(storage).forEach(([key, value]) => {
        try {
          // Compression des données si nécessaire
          const compressedValue = this._shouldCompress(value) ? this._compress(value) : value;
          const originalSetItem = Object.getPrototypeOf(localStorage).setItem;
          originalSetItem.call(localStorage, key, compressedValue);
        } catch (error) {
          if (error instanceof Error && error.name === 'QuotaExceededError') {
            this._cleanupStorage().then(() => {
              // Réessayer après le nettoyage
              const originalSetItem = Object.getPrototypeOf(localStorage).setItem;
              originalSetItem.call(localStorage, key, value);
            });
          } else {
            console.error('[Preview] Error syncing storage:', error);
          }
        }
      });

      // Force a refresh after syncing storage
      const previews = this.previews.get();
      previews.forEach((preview) => {
        const previewId = this.getPreviewId(preview.baseUrl);

        if (previewId) {
          this.refreshPreview(previewId);
        }
      });

      // Reload the page content
      if (typeof window !== 'undefined' && window.location) {
        const iframe = document.querySelector('iframe');

        if (iframe) {
          iframe.src = iframe.src;
        }
      }
    }
  }

  // Broadcast storage state to other tabs
  private _calculateStorageSize(storage: Record<string, string>): number {
    return Object.entries(storage).reduce((size, [key, value]) => {
      return size + (key.length + value.length) * 2; // Approximation de la taille en bytes
    }, 0);
  }

  private _shouldCompress(value: string): boolean {
    return value.length > 1024; // Compresser si plus de 1KB
  }

  private _compress(value: string): string {
    try {
      return btoa(encodeURIComponent(value));
    } catch (e) {
      console.warn('[Preview] Compression failed:', e);
      return value;
    }
  }

  private _decompress(value: string): string {
    try {
      return decodeURIComponent(atob(value));
    } catch (e) {
      console.warn('[Preview] Decompression failed:', e);
      return value;
    }
  }

  private async _cleanupStorage(): Promise<void> {
    const snapshotKeys = Object.keys(localStorage)
      .filter(key => key.startsWith('snapshot:'))
      .sort((a, b) => {
        const timeA = JSON.parse(localStorage.getItem(a) || '{}').timestamp || 0;
        const timeB = JSON.parse(localStorage.getItem(b) || '{}').timestamp || 0;
        return timeA - timeB;
      });

    // Supprimer les snapshots les plus anciens jusqu'à libérer assez d'espace
    while (this._calculateStorageSize(Object.fromEntries(Object.entries(localStorage))) > this.#MAX_STORAGE_SIZE * this.#STORAGE_CLEANUP_THRESHOLD
      && snapshotKeys.length > 0) {
      const oldestKey = snapshotKeys.shift();
      if (oldestKey) {
        localStorage.removeItem(oldestKey);
      }
    }
  }

  private _broadcastStorageSync() {
    if (typeof window !== 'undefined') {
      const storage: Record<string, string> = {};

      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);

        if (key) {
          const value = localStorage.getItem(key) || '';
          storage[key] = this._shouldCompress(value) ? this._compress(value) : value;
        }
      }

      this.#storageChannel.postMessage({
        type: 'storage-sync',
        storage,
        source: this._getTabId(),
        timestamp: Date.now(),
      });
    }
  }

  async #init() {
    const webcontainer = await this.#webcontainer;

    // Listen for server ready events
    webcontainer.on('server-ready', (port, url) => {
      console.log('[Preview] Server ready on port:', port, url);
      this.broadcastUpdate(url);

      // Initial storage sync when preview is ready
      this._broadcastStorageSync();
    });

    try {
      // Watch for file changes
      const watcher = await webcontainer.fs.watch('**/*', { persistent: true });

      // Use the native watch events
      (watcher as any).addEventListener('change', async () => {
        const previews = this.previews.get();

        for (const preview of previews) {
          const previewId = this.getPreviewId(preview.baseUrl);

          if (previewId) {
            this.broadcastFileChange(previewId);
          }
        }
      });

      // Watch for DOM changes that might affect storage
      if (typeof window !== 'undefined') {
        const observer = new MutationObserver((_mutations) => {
          // Broadcast storage changes when DOM changes
          this._broadcastStorageSync();
        });

        observer.observe(document.body, {
          childList: true,
          subtree: true,
          characterData: true,
          attributes: true,
        });
      }
    } catch (error) {
      console.error('[Preview] Error setting up watchers:', error);
    }

    // Listen for port events
    webcontainer.on('port', (port, type, url) => {
      let previewInfo = this.#availablePreviews.get(port);

      if (type === 'close' && previewInfo) {
        this.#availablePreviews.delete(port);
        this.previews.set(this.previews.get().filter((preview) => preview.port !== port));

        return;
      }

      const previews = this.previews.get();

      if (!previewInfo) {
        previewInfo = { port, ready: type === 'open', baseUrl: url };
        this.#availablePreviews.set(port, previewInfo);
        previews.push(previewInfo);
      }

      previewInfo.ready = type === 'open';
      previewInfo.baseUrl = url;

      this.previews.set([...previews]);

      if (type === 'open') {
        this.broadcastUpdate(url);
      }
    });
  }

  // Helper to extract preview ID from URL
  getPreviewId(url: string): string | null {
    const match = url.match(/^https?:\/\/([^.]+)\.local-credentialless\.webcontainer-api\.io/);
    return match ? match[1] : null;
  }

  // Broadcast state change to all tabs
  broadcastStateChange(previewId: string) {
    const timestamp = Date.now();
    this.#lastUpdate.set(previewId, timestamp);

    this.#broadcastChannel.postMessage({
      type: 'state-change',
      previewId,
      timestamp,
    });
  }

  // Broadcast file change to all tabs
  broadcastFileChange(previewId: string) {
    const timestamp = Date.now();
    this.#lastUpdate.set(previewId, timestamp);

    this.#broadcastChannel.postMessage({
      type: 'file-change',
      previewId,
      timestamp,
    });
  }

  // Broadcast update to all tabs
  broadcastUpdate(url: string) {
    const previewId = this.getPreviewId(url);

    if (previewId) {
      const timestamp = Date.now();
      this.#lastUpdate.set(previewId, timestamp);

      this.#broadcastChannel.postMessage({
        type: 'file-change',
        previewId,
        timestamp,
      });
    }
  }

  // Method to refresh a specific preview
  refreshPreview(previewId: string) {
    // Clear any pending refresh for this preview
    const existingTimeout = this.#refreshTimeouts.get(previewId);

    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    // Set a new timeout for this refresh
    const timeout = setTimeout(() => {
      const previews = this.previews.get();
      const preview = previews.find((p) => this.getPreviewId(p.baseUrl) === previewId);

      if (preview) {
        preview.ready = false;
        this.previews.set([...previews]);

        requestAnimationFrame(() => {
          preview.ready = true;
          this.previews.set([...previews]);
        });
      }

      this.#refreshTimeouts.delete(previewId);
    }, this.#REFRESH_DELAY);

    this.#refreshTimeouts.set(previewId, timeout);
  }
  // Add this method to refresh all active previews
  refreshAllPreviews() {
    const previews = this.previews.get();

    for (const preview of previews) {
      const previewId = this.getPreviewId(preview.baseUrl);

      if (previewId) {
        this.broadcastFileChange(previewId);
      }
    }
  }
}

// Create a singleton instance
let previewsStore: PreviewsStore | null = null;

export function usePreviewStore() {
  if (!previewsStore) {
    /*
     * Initialize with a Promise that resolves to WebContainer
     * This should match how you're initializing WebContainer elsewhere
     */
    previewsStore = new PreviewsStore(Promise.resolve({} as WebContainer));
  }

  return previewsStore;
}
