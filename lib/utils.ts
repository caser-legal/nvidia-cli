// Utility functions
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Date formatting utilities (Features 59-65)
export function formatDate(date: Date | string): string {
  const d = new Date(date);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatTime(date: Date | string): string {
  const d = new Date(date);
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatRelativeDate(date: Date | string): string {
  const d = new Date(date);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)} years ago`;
}

// Group conversations by date (Features 62-65)
export function groupByDate<T extends { lastMessageAt: Date | string }>(
  items: T[]
): { label: string; items: T[] }[] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

  const groups: { label: string; items: T[] }[] = [
    { label: "Today", items: [] },
    { label: "Yesterday", items: [] },
    { label: "Previous 7 days", items: [] },
    { label: "Older", items: [] },
  ];

  items.forEach((item) => {
    const date = new Date(item.lastMessageAt);
    if (date >= today) {
      groups[0].items.push(item);
    } else if (date >= yesterday) {
      groups[1].items.push(item);
    } else if (date >= weekAgo) {
      groups[2].items.push(item);
    } else {
      groups[3].items.push(item);
    }
  });

  return groups.filter((g) => g.items.length > 0);
}

// Token estimation (Feature 15)
export function estimateTokens(text: string): number {
  // Rough estimation: ~4 characters per token for English
  return Math.ceil(text.length / 4);
}

// Character count (Feature 14)
export function formatCharacterCount(count: number, max?: number): string {
  if (max) {
    return `${count.toLocaleString()} / ${max.toLocaleString()}`;
  }
  return count.toLocaleString();
}

// Export formats (Features 56-58)
export function exportToJSON(data: unknown, filename: string): void {
  const json = JSON.stringify(data, null, 2);
  downloadFile(json, `${filename}.json`, "application/json");
}

export function exportToMarkdown(content: string, filename: string): void {
  downloadFile(content, `${filename}.md`, "text/markdown");
}

function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Keyboard shortcuts (Features 16-17, 150)
export const KEYBOARD_SHORTCUTS = {
  send: { key: "Enter", description: "Send message" },
  newline: { key: "Shift+Enter", description: "New line" },
  newChat: { key: "Cmd+N", description: "New conversation" },
  search: { key: "Cmd+K", description: "Command palette" },
  toggleSidebar: { key: "Cmd+B", description: "Toggle sidebar" },
  settings: { key: "Cmd+,", description: "Open settings" },
  escape: { key: "Escape", description: "Close modal/panel" },
} as const;

// Debounce utility
export function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

// Throttle utility
export function throttle<T extends (...args: unknown[]) => unknown>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false;
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

// Copy to clipboard (Feature 5, 44)
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for older browsers
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const success = document.execCommand("copy");
    document.body.removeChild(textarea);
    return success;
  }
}

// Generate share token (Feature 133)
export function generateShareToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Artifact detection (Feature 26)
export function detectArtifacts(content: string): {
  type: "code" | "html" | "svg" | "react" | "mermaid" | "text";
  language?: string;
  content: string;
  title: string;
}[] {
  const artifacts: {
    type: "code" | "html" | "svg" | "react" | "mermaid" | "text";
    language?: string;
    content: string;
    title: string;
  }[] = [];

  // Match code blocks with language
  const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
  let match;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    const language = match[1]?.toLowerCase() || "text";
    const code = match[2].trim();

    let type: "code" | "html" | "svg" | "react" | "mermaid" | "text" = "code";
    let title = `${language} code`;

    if (language === "html") {
      type = "html";
      title = "HTML Document";
    } else if (language === "svg") {
      type = "svg";
      title = "SVG Image";
    } else if (language === "jsx" || language === "tsx") {
      type = "react";
      title = "React Component";
    } else if (language === "mermaid") {
      type = "mermaid";
      title = "Mermaid Diagram";
    }

    artifacts.push({ type, language, content: code, title });
  }

  return artifacts;
}

// Sanitize HTML for preview (Feature 29)
export function sanitizeHTML(html: string): string {
  // Basic sanitization - in production, use DOMPurify
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/on\w+="[^"]*"/gi, "")
    .replace(/javascript:/gi, "");
}
