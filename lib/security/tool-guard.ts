
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
    // Default safe permissions
    this.setPermission("google_search", { toolName: "google_search", allowed: true, requiresConfirmation: false });
    this.setPermission("think", { toolName: "think", allowed: true, requiresConfirmation: false });
    
    // Default sensitive permissions
    this.setPermission("bash", { toolName: "bash", allowed: true, requiresConfirmation: true });
    this.setPermission("file_write", { toolName: "file_write", allowed: true, requiresConfirmation: true });
  }

  setPermission(toolName: string, permission: ToolPermission) {
    this.permissions.set(toolName, permission);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  check(toolName: string, _args: unknown): { allowed: boolean; requiresConfirmation: boolean; reason?: string } {
    const perm = this.permissions.get(toolName);
    
    if (!perm) {
      // Unknown tool - block by default in strict mode, or allow with caution
      return { allowed: true, requiresConfirmation: true, reason: "Unknown tool" };
    }

    if (!perm.allowed) {
      return { allowed: false, requiresConfirmation: false, reason: "Tool explicitly blocked" };
    }

    // Argument checks could go here (e.g. whitelist specific shell commands)

    return { allowed: true, requiresConfirmation: perm.requiresConfirmation };
  }
}
