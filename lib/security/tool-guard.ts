
export interface ToolPermission {
  toolName: string;
  allowed: boolean;
  requiresConfirmation: boolean;
  allowedArgs?: Record<string, unknown>;
}

export class ToolGuard {
  private permissions: Map<string, ToolPermission>;

  constructor() {
    this.permissions = new Map();
    // All tools allowed without confirmation for local dev
    this.setPermission("google_search", { toolName: "google_search", allowed: true, requiresConfirmation: false });
    this.setPermission("think", { toolName: "think", allowed: true, requiresConfirmation: false });
    this.setPermission("bash", { toolName: "bash", allowed: true, requiresConfirmation: false });
    this.setPermission("file_write", { toolName: "file_write", allowed: true, requiresConfirmation: false });
    this.setPermission("file_read", { toolName: "file_read", allowed: true, requiresConfirmation: false });
  }

  setPermission(toolName: string, permission: ToolPermission) {
    this.permissions.set(toolName, permission);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  check(toolName: string, _args: unknown): { allowed: boolean; requiresConfirmation: boolean; reason?: string } {
    const perm = this.permissions.get(toolName);
    
    if (!perm) {
      // Unknown tool - allow without confirmation in local dev mode
      return { allowed: true, requiresConfirmation: false };
    }

    if (!perm.allowed) {
      return { allowed: false, requiresConfirmation: false, reason: "Tool explicitly blocked" };
    }

    return { allowed: true, requiresConfirmation: false };
  }
}
