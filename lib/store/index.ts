// Zustand Store - Part 2: Projects, Folders, Settings, UI
// Features 68-82, 95-117, 143-154

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { nanoid } from "nanoid";
import type { ModelId } from "../nvidia";

// Project Store (Features 68-82)
export interface Project {
  id: string;
  name: string;
  description?: string;
  color: string;
  icon?: string;
  customInstructions?: string;
  defaultModel: ModelId;
  isPinned: boolean;
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface ProjectState {
  projects: Project[];
  currentProjectId: string | null;
  
  createProject: (name: string) => string;
  updateProject: (id: string, updates: Partial<Project>) => void;
  deleteProject: (id: string) => void;
  setCurrentProject: (id: string | null) => void;
  pinProject: (id: string, isPinned: boolean) => void;
  archiveProject: (id: string, isArchived: boolean) => void;
  getCurrentProject: () => Project | null;
}

export const useProjectStore = create<ProjectState>()(
  persist(
    (set, get) => ({
      projects: [],
      currentProjectId: null,

      createProject: (name) => {
        const id = nanoid();
        const newProject: Project = {
          id,
          name,
          color: "#76B900",
          defaultModel: "nvidia/nemotron-3-nano-30b-a3b",  // Best for coding (SWE-Bench 38.8%)
          isPinned: false,
          isArchived: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        set((state) => ({
          projects: [...state.projects, newProject],
          currentProjectId: id,
        }));
        return id;
      },

      updateProject: (id, updates) => {
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === id ? { ...p, ...updates, updatedAt: new Date() } : p
          ),
        }));
      },

      deleteProject: (id) => {
        set((state) => ({
          projects: state.projects.filter((p) => p.id !== id),
          currentProjectId: state.currentProjectId === id ? null : state.currentProjectId,
        }));
      },

      setCurrentProject: (id) => set({ currentProjectId: id }),

      pinProject: (id, isPinned) => {
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === id ? { ...p, isPinned, updatedAt: new Date() } : p
          ),
        }));
      },

      archiveProject: (id, isArchived) => {
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === id ? { ...p, isArchived, updatedAt: new Date() } : p
          ),
        }));
      },

      getCurrentProject: () => {
        const { projects, currentProjectId } = get();
        return projects.find((p) => p.id === currentProjectId) ?? null;
      },
    }),
    {
      name: "nvidia-cli-projects",
      storage: createJSONStorage(() => localStorage),
    }
  )
);

// Folder Store (Features 54, 67, 209)
export interface Folder {
  id: string;
  name: string;
  color?: string;
  icon?: string;
  parentId?: string;
  isExpanded: boolean;
  sortOrder: number;
  createdAt: Date;
}

interface FolderState {
  folders: Folder[];
  
  createFolder: (name: string, parentId?: string) => string;
  updateFolder: (id: string, updates: Partial<Folder>) => void;
  deleteFolder: (id: string) => void;
  toggleFolderExpanded: (id: string) => void;
  reorderFolders: (folderId: string, newOrder: number) => void;
  getChildFolders: (parentId?: string) => Folder[];
}

export const useFolderStore = create<FolderState>()(
  persist(
    (set, get) => ({
      folders: [],

      createFolder: (name, parentId) => {
        const id = nanoid();
        const siblings = get().folders.filter((f) => f.parentId === parentId);
        const newFolder: Folder = {
          id,
          name,
          parentId,
          isExpanded: true,
          sortOrder: siblings.length,
          createdAt: new Date(),
        };
        set((state) => ({ folders: [...state.folders, newFolder] }));
        return id;
      },

      updateFolder: (id, updates) => {
        set((state) => ({
          folders: state.folders.map((f) => (f.id === id ? { ...f, ...updates } : f)),
        }));
      },

      deleteFolder: (id) => {
        set((state) => ({
          folders: state.folders.filter((f) => f.id !== id && f.parentId !== id),
        }));
      },

      toggleFolderExpanded: (id) => {
        set((state) => ({
          folders: state.folders.map((f) =>
            f.id === id ? { ...f, isExpanded: !f.isExpanded } : f
          ),
        }));
      },

      reorderFolders: (folderId, newOrder) => {
        set((state) => ({
          folders: state.folders.map((f) =>
            f.id === folderId ? { ...f, sortOrder: newOrder } : f
          ),
        }));
      },

      getChildFolders: (parentId) => {
        return get()
          .folders.filter((f) => f.parentId === parentId)
          .sort((a, b) => a.sortOrder - b.sortOrder);
      },
    }),
    {
      name: "nvidia-cli-folders",
      storage: createJSONStorage(() => localStorage),
    }
  )
);

// Settings Store (Features 95-117)
export interface Settings {
  // Theme (Features 103-105)
  theme: "light" | "dark" | "system";
  
  // Typography (Feature 106)
  fontSize: "small" | "medium" | "large";
  
  // Density (Features 107-109)
  messageDensity: "compact" | "comfortable" | "spacious";
  
  // Code (Feature 110)
  codeTheme: "oneDark" | "github" | "dracula";
  
  // Language (Feature 111)
  language: string;
  
  // Accessibility (Features 112, 177, 179)
  highContrast: boolean;
  reducedMotion: boolean;
  
  // Custom Instructions (Features 95-102)
  globalInstructions: string;
  
  // Default model
  defaultModel: ModelId;
  
  // API Key (Feature 116)
  apiKey: string;
  
  // Onboarding (Features 165-172)
  onboardingComplete: boolean;
  onboardingStep: number;
}

interface SettingsState extends Settings {
  setTheme: (theme: Settings["theme"]) => void;
  setFontSize: (size: Settings["fontSize"]) => void;
  setMessageDensity: (density: Settings["messageDensity"]) => void;
  setCodeTheme: (theme: Settings["codeTheme"]) => void;
  setHighContrast: (enabled: boolean) => void;
  setReducedMotion: (enabled: boolean) => void;
  setGlobalInstructions: (instructions: string) => void;
  setDefaultModel: (model: ModelId) => void;
  setApiKey: (key: string) => void;
  setOnboardingComplete: (complete: boolean) => void;
  updateSettings: (updates: Partial<Settings>) => void;
  resetSettings: () => void;
}

const defaultSettings: Settings = {
  theme: "system",
  fontSize: "medium",
  messageDensity: "comfortable",
  codeTheme: "oneDark",
  language: "en",
  highContrast: false,
  reducedMotion: false,
  globalInstructions: "",
  defaultModel: "nvidia/nemotron-3-nano-30b-a3b",  // Best for coding (SWE-Bench 38.8%)
  apiKey: "",
  onboardingComplete: false,
  onboardingStep: 0,
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...defaultSettings,

      setTheme: (theme) => set({ theme }),
      setFontSize: (fontSize) => set({ fontSize }),
      setMessageDensity: (messageDensity) => set({ messageDensity }),
      setCodeTheme: (codeTheme) => set({ codeTheme }),
      setHighContrast: (highContrast) => set({ highContrast }),
      setReducedMotion: (reducedMotion) => set({ reducedMotion }),
      setGlobalInstructions: (globalInstructions) => set({ globalInstructions }),
      setDefaultModel: (defaultModel) => set({ defaultModel }),
      setApiKey: (apiKey) => set({ apiKey }),
      setOnboardingComplete: (onboardingComplete) => set({ onboardingComplete }),
      updateSettings: (updates) => set((state) => ({ ...state, ...updates })),
      resetSettings: () => set(defaultSettings),
    }),
    {
      name: "nvidia-cli-settings",
      storage: createJSONStorage(() => localStorage),
    }
  )
);

// UI Store (Features 143-154, 195-214)
interface UIState {
  // Layout (Features 195-200)
  sidebarOpen: boolean;
  sidebarWidth: number;
  artifactPanelOpen: boolean;
  artifactPanelWidth: number;
  
  // Live logs mode for sidebar
  sidebarLiveLogsMode: boolean;
  
  // Coder project directory
  coderProjectDir: string;
  
  // Modals
  settingsModalOpen: boolean;
  commandPaletteOpen: boolean;
  keyboardShortcutsOpen: boolean;
  shareDialogOpen: boolean;
  projectSettingsOpen: boolean;
  exportModalOpen: boolean;
  usageDashboardOpen: boolean;
  modelComparisonOpen: boolean;
  templatesDialogOpen: boolean;
  
  // Search (Features 143-154)
  searchQuery: string;
  searchFilter: {
    project?: string;
    dateFrom?: Date;
    dateTo?: Date;
    model?: string;
  };
  
  // Active artifact
  activeArtifactId: string | null;
  
  // Actions
  toggleSidebar: () => void;
  setSidebarWidth: (width: number) => void;
  toggleArtifactPanel: () => void;
  setArtifactPanelWidth: (width: number) => void;
  openArtifactPanel: (artifactId: string) => void;
  closeArtifactPanel: () => void;
  
  setSettingsModalOpen: (open: boolean) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setKeyboardShortcutsOpen: (open: boolean) => void;
  setShareDialogOpen: (open: boolean) => void;
  setProjectSettingsOpen: (open: boolean) => void;
  setUsageDashboardOpen: (open: boolean) => void;
  setModelComparisonOpen: (open: boolean) => void;
  setTemplatesDialogOpen: (open: boolean) => void;
  setExportModalOpen: (open: boolean) => void;
  
  setSearchQuery: (query: string) => void;
  setSearchFilter: (filter: Partial<UIState["searchFilter"]>) => void;
  clearSearch: () => void;
  
  // Coder project dir action
  setCoderProjectDir: (dir: string) => void;
  
  // Live logs toggle
  toggleSidebarLiveLogsMode: () => void;
  setSidebarLiveLogsMode: (enabled: boolean) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarOpen: true,
      sidebarWidth: 280,
      artifactPanelOpen: false,
      artifactPanelWidth: 500,
      
      sidebarLiveLogsMode: false,
      
      coderProjectDir: "",
      
      settingsModalOpen: false,
      commandPaletteOpen: false,
      keyboardShortcutsOpen: false,
      shareDialogOpen: false,
      projectSettingsOpen: false,
      exportModalOpen: false,
      usageDashboardOpen: false,
      modelComparisonOpen: false,
      templatesDialogOpen: false,
      
      searchQuery: "",
      searchFilter: {},
      
      activeArtifactId: null,

      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      setSidebarWidth: (width) => set({ sidebarWidth: width }),
      toggleArtifactPanel: () => set((state) => ({ artifactPanelOpen: !state.artifactPanelOpen })),
      setArtifactPanelWidth: (width) => set({ artifactPanelWidth: width }),
      
      openArtifactPanel: (artifactId) => set({ artifactPanelOpen: true, activeArtifactId: artifactId }),
      closeArtifactPanel: () => set({ artifactPanelOpen: false, activeArtifactId: null }),
      
      setSettingsModalOpen: (open) => set({ settingsModalOpen: open }),
      setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
      setKeyboardShortcutsOpen: (open) => set({ keyboardShortcutsOpen: open }),
      setShareDialogOpen: (open) => set({ shareDialogOpen: open }),
      setProjectSettingsOpen: (open) => set({ projectSettingsOpen: open }),
      setUsageDashboardOpen: (open) => set({ usageDashboardOpen: open }),
      setModelComparisonOpen: (open) => set({ modelComparisonOpen: open }),
      setTemplatesDialogOpen: (open) => set({ templatesDialogOpen: open }),
      setExportModalOpen: (open) => set({ exportModalOpen: open }),
      
      setSearchQuery: (query) => set({ searchQuery: query }),
      setSearchFilter: (filter) => set((state) => ({ searchFilter: { ...state.searchFilter, ...filter } })),
      clearSearch: () => set({ searchQuery: "", searchFilter: {} }),
      
      setCoderProjectDir: (dir) => set({ coderProjectDir: dir }),
      
      toggleSidebarLiveLogsMode: () => set((state) => ({ sidebarLiveLogsMode: !state.sidebarLiveLogsMode })),
      setSidebarLiveLogsMode: (enabled) => set({ sidebarLiveLogsMode: enabled }),
    }),
    {
      name: "nvidia-cli-ui",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        sidebarOpen: state.sidebarOpen,
        sidebarWidth: state.sidebarWidth,
        artifactPanelWidth: state.artifactPanelWidth,
      }),
    }
  )
);

// Usage Tracking Store (Features 155-164)
export interface UsageRecord {
  id: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCost: number;
  conversationId?: string;
  messageId?: string;
  date: string; // YYYY-MM-DD
  createdAt: Date;
}

interface UsageState {
  records: UsageRecord[];
  
  addUsageRecord: (record: Omit<UsageRecord, "id" | "createdAt">) => void;
  getDailyUsage: (date: string) => UsageRecord[];
  getMonthlyUsage: (yearMonth: string) => UsageRecord[];
  getTotalUsage: () => { inputTokens: number; outputTokens: number; totalTokens: number };
  getUsageByModel: () => Record<string, { inputTokens: number; outputTokens: number; totalTokens: number }>;
  clearUsage: () => void;
}

export const useUsageStore = create<UsageState>()(
  persist(
    (set, get) => ({
      records: [],

      addUsageRecord: (record) => {
        const newRecord: UsageRecord = {
          ...record,
          id: nanoid(),
          createdAt: new Date(),
        };
        set((state) => ({ records: [...state.records, newRecord] }));
      },

      getDailyUsage: (date) => {
        return get().records.filter((r) => r.date === date);
      },

      getMonthlyUsage: (yearMonth) => {
        return get().records.filter((r) => r.date.startsWith(yearMonth));
      },

      getTotalUsage: () => {
        const records = get().records;
        return records.reduce(
          (acc, r) => ({
            inputTokens: acc.inputTokens + r.inputTokens,
            outputTokens: acc.outputTokens + r.outputTokens,
            totalTokens: acc.totalTokens + r.totalTokens,
          }),
          { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
        );
      },

      getUsageByModel: () => {
        const records = get().records;
        return records.reduce((acc, r) => {
          if (!acc[r.model]) {
            acc[r.model] = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
          }
          acc[r.model].inputTokens += r.inputTokens;
          acc[r.model].outputTokens += r.outputTokens;
          acc[r.model].totalTokens += r.totalTokens;
          return acc;
        }, {} as Record<string, { inputTokens: number; outputTokens: number; totalTokens: number }>);
      },

      clearUsage: () => set({ records: [] }),
    }),
    {
      name: "nvidia-cli-usage",
      storage: createJSONStorage(() => localStorage),
    }
  )
);

// Prompt Library Store (Features 138, 147-148)
export interface PromptTemplate {
  id: string;
  title: string;
  content: string;
  description?: string;
  category: string;
  tags: string[];
  useCount: number;
  isFavorite: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface PromptLibraryState {
  prompts: PromptTemplate[];
  
  addPrompt: (prompt: Omit<PromptTemplate, "id" | "useCount" | "createdAt" | "updatedAt">) => string;
  updatePrompt: (id: string, updates: Partial<PromptTemplate>) => void;
  deletePrompt: (id: string) => void;
  usePrompt: (id: string) => void;
  toggleFavorite: (id: string) => void;
  getPromptsByCategory: (category: string) => PromptTemplate[];
  searchPrompts: (query: string) => PromptTemplate[];
}

export const usePromptLibraryStore = create<PromptLibraryState>()(
  persist(
    (set, get) => ({
      prompts: [],

      addPrompt: (prompt) => {
        const id = nanoid();
        const newPrompt: PromptTemplate = {
          ...prompt,
          id,
          useCount: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        set((state) => ({ prompts: [...state.prompts, newPrompt] }));
        return id;
      },

      updatePrompt: (id, updates) => {
        set((state) => ({
          prompts: state.prompts.map((p) =>
            p.id === id ? { ...p, ...updates, updatedAt: new Date() } : p
          ),
        }));
      },

      deletePrompt: (id) => {
        set((state) => ({ prompts: state.prompts.filter((p) => p.id !== id) }));
      },

      usePrompt: (id) => {
        set((state) => ({
          prompts: state.prompts.map((p) =>
            p.id === id ? { ...p, useCount: p.useCount + 1 } : p
          ),
        }));
      },

      toggleFavorite: (id) => {
        set((state) => ({
          prompts: state.prompts.map((p) =>
            p.id === id ? { ...p, isFavorite: !p.isFavorite } : p
          ),
        }));
      },

      getPromptsByCategory: (category) => {
        return get().prompts.filter((p) => p.category === category);
      },

      searchPrompts: (query) => {
        const q = query.toLowerCase();
        return get().prompts.filter(
          (p) =>
            p.title.toLowerCase().includes(q) ||
            p.content.toLowerCase().includes(q) ||
            p.tags.some((t) => t.toLowerCase().includes(q))
        );
      },
    }),
    {
      name: "nvidia-cli-prompts",
      storage: createJSONStorage(() => localStorage),
    }
  )
);
