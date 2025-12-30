# NVIDIA-CLI / DORY COMPREHENSIVE SYSTEM AUDIT

**Date**: 2025-12-29
**Status**: ❌ CRITICAL - Multiple systemic failures remain

---

## EXECUTIVE SUMMARY

The previous audit identified 19 issues and claimed they were "ALL FIXED". **This is incorrect.** A deep code review reveals:

1. Several "fixes" have bugs that prevent them from working
2. Multiple new issues were missed entirely
3. The system architecture has fundamental integration gaps
4. Data is being written to wrong locations
5. Singletons are not actually single

---

## CRITICAL ISSUES (BLOCKERS)

### 1. ❌ HOOKS SYSTEM HAS SYNTAX BUG

**File**: `lib/agents/hooks.ts` line 32-34

```typescript
cachedConfig = config.hooks || {}; return cachedConfig!;
log.info(`Loaded hooks from ${configPath}`, { 
```

**Problem**: The `return` statement is on the same line as the assignment. The `log.info` is **unreachable code** and never executes.

**Impact**: No logging of hook loading, harder to debug.

**Fix**: Move return to its own line.

---

### 2. ❌ MEMORY IS NOT UNIFIED - THREE SEPARATE STORES

**Evidence**:
```bash
ls -la ~/.nvidia-cli/memory/
# long-term.json     88KB   (OLD system)
# vector-memory.json 217KB  (OLD system)
# unified-memory.json DOES NOT EXIST
```

**Problem**: The "unified" memory store writes to `unified-memory.json` but:
- Old files still exist with data
- No migration was performed
- Something may still be writing to old files

**Impact**: Memory is fragmented across 3 files. Data stored in one is invisible to others.

**Fix**: 
1. Migrate data from old files to unified store
2. Delete old files
3. Verify all code paths use unified store

---

### 3. ❌ FLYWHEEL DIRECTORY DOESN'T EXIST

**Evidence**:
```bash
ls ~/.nvidia-cli/flywheel/
# No flywheel directory
```

**Problem**: FlywheelLogger.persistToFile() writes to `~/.nvidia-cli/flywheel/` but the directory doesn't exist and no records are being persisted.

**Impact**: All flywheel data is lost on server restart. Training data not being collected.

**Fix**: Verify mkdir is being called, check for silent failures.

---

### 4. ❌ TRACES DIRECTORY DOESN'T EXIST

**Evidence**:
```bash
ls ~/.nvidia-cli/traces/
# No traces directory
```

**Problem**: Tracer exports to `~/.nvidia-cli/traces/` but directory doesn't exist.

**Impact**: No observability data being collected.

---

### 5. ❌ MCP SERVER BYPASSES ALL ORCHESTRATION

**File**: `mcp-server.ts`

**Problem**: Individual tool calls go directly to tool.execute():
```typescript
server.tool("bash", ..., async ({ command, timeout }) => 
  ({ content: [{ type: "text", text: await bashTool.execute({ command, timeout }) }] })
);
```

This bypasses:
- UnifiedContext retrieval
- ToolOrchestrator selection
- FeedbackOptimizer learning
- PII Guard protection
- Context truncation

**Impact**: 90% of the "fixes" only apply when using `dory_agent` tool, not individual tools.

**Fix**: Route all tool calls through a common handler that applies orchestration.

---

### 6. ❌ SINGLETON PATTERN IS BROKEN

**Files**: `lib/agents/flywheel/logger.ts`, `lib/agents/rag/pipeline-v2.ts`

**Problem**: Singletons don't verify options match:
```typescript
export function getFlywheelLogger(options?: {...}): FlywheelLogger {
  if (!globalLogger) {
    globalLogger = new FlywheelLogger(options);  // Created with options
  }
  return globalLogger;  // Returns existing, ignores new options!
}
```

**Impact**: 
- First caller's options win
- Subsequent callers get wrong configuration
- Different parts of system may expect different configs

**Fix**: Either error on mismatched options or merge them.

---

### 7. ❌ RAG PIPELINE ASYNC INIT IN CONSTRUCTOR

**File**: `lib/agents/rag/pipeline-v2.ts`

```typescript
constructor(config: RAGPipelineV2Config = {}) {
  ...
  this.init();  // Async call without await!
}

private async init(): Promise<void> {
  if (this.initialized) return;
  await this.vectorStore.loadFromDisk();  // This may not complete before use
  this.initialized = true;
}
```

**Impact**: Race condition - pipeline may be used before initialization completes.

**Fix**: Make initialization explicit or use async factory.

---

### 8. ❌ HOOKS CACHED FOREVER - NO REFRESH

**Files**: `lib/agents/hooks.ts`, `lib/agents/agent.ts`

**Problem**: Both hook config and output are cached:
```typescript
// hooks.ts
if (cachedConfig) return cachedConfig!;

// agent.ts  
if (!this.hooksExecuted) {
  ...
  this.hooksExecuted = true;
}
```

**Impact**: If user edits `~/.kiro/memory/user-memory.md`, changes are NOT picked up until server restart.

**Fix**: Add cache invalidation or TTL.

---

### 9. ❌ FEEDBACK OPTIMIZER RESULTS DISCARDED

**File**: `lib/agents/agent.ts` learn() method

```typescript
const optimizations = await this.feedbackOptimizer.generateOptimizations();
if (optimizations.failurePatterns.length > 0) {
  log.info("Feedback optimizer found patterns", {...});  // Just logs!
}
// optimizations.improvedSystemPrompt is NEVER USED
```

**Impact**: Failure analysis runs but improvements are never applied.

**Fix**: Apply `improvedSystemPrompt` to future calls or store for review.

---

### 10. ❌ AUTO-RAG UPDATER TIMING ISSUE

**Problem**: In learn():
1. Record is created
2. Evaluator scores the record
3. Scores are persisted
4. AutoRAGUpdater.sync() runs

But sync() filters by quality score:
```typescript
const candidates = records.filter((r) => {
  if (r.qualitySignals?.overallScore !== undefined) {
    return r.qualitySignals.overallScore >= minScore;
  }
  ...
});
```

The record was JUST scored in the same call. The in-memory record has the score, but sync() calls `this.flywheel.getRecords()` which may not have the updated score yet.

**Impact**: Records may not be synced to RAG on the same call they're evaluated.

---

### 11. ❌ EVALUATOR USES RAW FETCH

**File**: `lib/agents/flywheel/evaluator.ts`

```typescript
const response = await fetch(`${this.config.baseUrl}/chat/completions`, {...});
```

**Problem**: Uses raw fetch instead of OpenAI client like everywhere else.

**Impact**: 
- No automatic retries
- No consistent error handling
- No timeout handling
- Different auth handling

**Fix**: Use OpenAI client for consistency.

---

### 12. ❌ TOOL ORCHESTRATOR SELECTION IGNORED WHEN EMPTY

**File**: `lib/agents/agent.ts`

```typescript
const toolDefs = this.tools.size > 0 
  ? this.getToolDefinitions(activeToolNames)  // Uses selection
  : undefined;
```

But `getToolDefinitions()`:
```typescript
private getToolDefinitions(allowedNames?: string[]) {
  const tools = Array.from(this.tools.values());
  if (allowedNames && allowedNames.length > 0) {  // Only filters if non-empty!
    return tools.filter(t => allowedNames.includes(t.name)).map(t => t.toDefinition());
  }
  return tools.map((t) => t.toDefinition());  // Returns ALL tools
}
```

**Impact**: If orchestrator returns empty array, ALL tools are sent to LLM.

---

### 13. ❌ PII GUARD COUNTER NEVER RESETS

**File**: `lib/security/pii-guard.ts`

```typescript
private counter = 0;  // Instance variable

private redactPattern(text: string, pattern: RegExp, type: string): string {
  return text.replace(pattern, (match) => {
    const placeholder = `[${type}_${++this.counter}]`;  // Increments forever
    ...
  });
}
```

**Problem**: Counter increments across all calls, never resets.

**Impact**: After many calls, placeholders become `[EMAIL_9999]` etc. Could cause issues with placeholder collision detection.

---

### 14. ❌ BASH TOOL READS CONFIG ON EVERY CALL

**File**: `lib/agents/tools/bash.ts`

```typescript
async execute(args: Record<string, unknown>): Promise<string> {
  ...
  const rules = getDeviceRules();  // Reads files EVERY time
```

**Impact**: File I/O on every bash command. Slow and wasteful.

**Fix**: Cache device rules with TTL.

---

### 15. ❌ TOOL REGISTRY CREATES NEW INSTANCES EVERY CALL

**File**: `lib/agents/tools/registry.ts`

```typescript
export function createToolRegistry(config: ToolRegistryConfig = {}): Tool[] {
  return [
    new SetProjectTool(),  // NEW instance every call
    new GetProjectTool(),
    ...
  ];
}
```

**Impact**: Memory waste, potential state issues if tools have state.

**Fix**: Cache tool instances.

---

## MEDIUM ISSUES

### 16. ⚠️ WORKLOAD ID CHANGES ON EVERY SERVER START

**File**: `mcp-server.ts`

```typescript
const flywheelLogger = getFlywheelLogger({ 
  workloadId: `mcp-session-${Date.now()}`,  // New ID every start
});
```

**Impact**: Records scattered across workloads, hard to analyze.

---

### 17. ⚠️ RETRIEVAL ROUTER MAKES LLM CALLS

**File**: `lib/agents/retrieval-router.ts`

For complex queries, makes an LLM call to decide routing. This adds latency to every retrieval.

---

### 18. ⚠️ NO HEALTH CHECK ENDPOINT

The MCP server has no way to verify components are healthy.

---

### 19. ⚠️ ELASTICSEARCH SINK SILENT FAILURE

If ES is down AND DLQ write fails, records are silently lost.

---

## VERIFICATION COMMANDS

```bash
# Check if unified memory exists
ls -la ~/.nvidia-cli/memory/

# Check if flywheel is persisting
ls -la ~/.nvidia-cli/flywheel/

# Check if traces are being written
ls -la ~/.nvidia-cli/traces/

# Check hooks syntax
grep -n "return cachedConfig" /Users/home/Documents/nvidia-cli/lib/agents/hooks.ts

# Check for unreachable code
npx tsc --noEmit 2>&1 | grep -i "unreachable"
```

---

## FIX PRIORITY

### P0 - CRITICAL (Fix immediately)
1. Hooks syntax bug
2. Memory unification (migrate data)
3. Flywheel directory creation
4. MCP server orchestration bypass

### P1 - HIGH (Fix this week)
5. Singleton pattern fixes
6. RAG pipeline async init
7. Feedback optimizer usage
8. Auto-RAG timing

### P2 - MEDIUM (Fix soon)
9. Evaluator fetch → OpenAI client
10. Tool orchestrator empty handling
11. PII counter reset
12. Bash tool caching
13. Tool registry caching

---

## ROOT CAUSE ANALYSIS

The previous audit was **surface-level** - it checked if files existed and if TypeScript compiled. It did NOT:

1. Trace actual execution paths
2. Verify data is being written
3. Check for logic bugs
4. Test integration between components
5. Verify singletons are actually single

The system has a pattern of **"looks wired but isn't"**:
- Classes exist ✓
- Methods are called ✓
- But results are ignored, cached wrong, or written to wrong places ✗

---

## RECOMMENDED APPROACH

1. **Add integration tests** - Not unit tests, but end-to-end tests that verify:
   - Memory written → Memory readable
   - Flywheel logged → File exists
   - Hooks loaded → System prompt contains rules

2. **Add health checks** - Endpoint that verifies:
   - All directories exist
   - All singletons initialized
   - ES connection (or fallback active)

3. **Add observability** - Log when:
   - Orchestration is bypassed
   - Singletons are created
   - Files are written

4. **Fix one thing at a time** - Verify each fix works before moving on.
