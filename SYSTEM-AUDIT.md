# NVIDIA-CLI / DORY SYSTEM AUDIT

**Date**: 2025-12-29
**Status**: CRITICAL - Multiple systemic failures identified

---

## EXECUTIVE SUMMARY

The Dory/nvidia-cli system has **fundamental architectural failures** where components are defined but never wired together. The system gives the *appearance* of functionality through configuration files and class definitions, but the actual execution paths bypass most of these components.

---

## CRITICAL ISSUES (BLOCKERS)

### 1. ❌ HOOKS SYSTEM IS COMPLETELY FAKE

**Location**: `~/.kiro/agents/dory.json`

**Problem**: The `hooks` configuration in dory.json defines:
- `agentSpawn` - supposed to load user-memory.md before every agent run
- `postToolUse` - supposed to auto-update memory after memory tool calls
- `stop` - supposed to log to flywheel

**Reality**: **ZERO code in nvidia-cli processes these hooks.**

```bash
grep -r "agentSpawn\|postToolUse\|preToolUse" /Users/home/Documents/nvidia-cli/lib --include="*.ts"
# Returns: NOTHING
```

The hooks are defined in JSON but:
- `mcp-server.ts` - doesn't read or execute hooks
- `mcp-agent.ts` - doesn't read or execute hooks  
- `agent.ts` - doesn't read or execute hooks
- `mcp-agent-runner.ts` - doesn't read or execute hooks

**Impact**: User rules in `user-memory.md` are NEVER automatically loaded. The AI must manually call memory tools, which it often forgets to do.

**Fix Required**: Implement hook execution in the agent initialization path.

---

### 2. ❌ TWO SEPARATE MEMORY SYSTEMS - NOT UNIFIED

**Locations**:
- `lib/agents/tools/memory.ts` → Uses `~/.nvidia-cli/memory/long-term.json`
- `lib/agents/memory/vector-memory.ts` → Uses `~/.nvidia-cli/memory/vector-memory.json`

**Problem**: There are TWO completely separate memory implementations:

1. **UnifiedMemory** (in tools/memory.ts):
   - Simple JSON file storage
   - Keyword-based search
   - Used by `MemoryTool` and `EntityMemoryTool`

2. **VectorMemoryStore** (in memory/vector-memory.ts):
   - Vector embeddings via NVIDIA API
   - Semantic search
   - Used by `UnifiedContext` class

**These don't share data.** When you call `memory remember`, it goes to one store. When `UnifiedContext` retrieves memories, it reads from a different store.

**Impact**: Memories stored via the memory tool are invisible to the UnifiedContext system, and vice versa.

**Fix Required**: Consolidate to single memory backend.

---

### 3. ❌ UNIFIED CONTEXT IS OPTIONAL AND OFTEN BYPASSED

**Location**: `lib/agents/agent.ts`, `lib/agents/mcp-agent.ts`

**Problem**: The `UnifiedContext` class exists and is well-designed, but:

1. In `Agent` class: `unifiedContext` is an optional constructor parameter
2. In `MCPAgent` class: `UnifiedContext` is **never instantiated or used**
3. In `mcp-server.ts`: Individual tools are called directly, bypassing all orchestration

When Kiro calls tools via MCP, it goes:
```
Kiro → MCP Server → Tool.execute() directly
```

NOT:
```
Kiro → MCP Server → UnifiedContext.retrieve() → Tool.execute()
```

**Impact**: RAG, memory, and flywheel context is not automatically injected before tool calls.

**Fix Required**: Make UnifiedContext mandatory in the execution path.

---

### 4. ❌ TOOL ORCHESTRATOR IS DEAD CODE

**Location**: `lib/agents/tool-orchestrator.ts`

**Problem**: The `ToolOrchestrator` class exists to intelligently select tools based on the task. It's:
- Instantiated in `mcp-agent-runner.ts`
- Passed to `Agent` constructor
- **Never actually used for tool selection**

In `agent.ts`:
```typescript
// This code exists but is only in runStream(), not run()
if (this.toolOrchestrator) {
  activeToolNames = await this.toolOrchestrator.selectTools(sanitizedUserMessage);
}
// But activeToolNames is never used to filter tools!
```

The selected tools are computed but then ignored - all tools are still sent to the LLM.

**Impact**: No intelligent tool filtering. LLM sees all 44 tools every time.

**Fix Required**: Actually use the orchestrator's output to filter tool definitions.

---

### 5. ❌ FEEDBACK OPTIMIZER NEVER RUNS

**Location**: `lib/agents/feedback-optimizer.ts`

**Problem**: The `FeedbackOptimizer` class analyzes failures and generates improvement suggestions. It's:
- Instantiated in `mcp-agent-runner.ts`
- Passed to `Agent` constructor
- Called in `learn()` method... but with broken code:

```typescript
await Promise.all([
  (this.feedbackOptimizer as any)?.generateOptimizations?.(),  // Optional chaining + any cast
  (this.autoRAGUpdater as any)?.sync?.(),
].filter(Boolean));
```

The `as any` cast and optional chaining means TypeScript can't verify this works. And `generateOptimizations()` returns a Promise that's awaited but the result is **discarded**.

**Impact**: Failure analysis happens but results are thrown away.

**Fix Required**: Actually use the optimization results.

---

### 6. ❌ AUTO-RAG UPDATER NEVER SYNCS

**Location**: `lib/agents/rag/auto-updater.ts`

**Problem**: Same issue as FeedbackOptimizer. The `sync()` method is called but:
1. It's called with optional chaining that may silently fail
2. The return value (count of ingested records) is discarded
3. No logging indicates whether it ran

**Impact**: High-quality interactions are never automatically added to RAG.

**Fix Required**: Proper invocation with result handling.

---

### 7. ❌ FLYWHEEL EVALUATOR RUNS BUT SCORES ARE LOST

**Location**: `lib/agents/flywheel/evaluator.ts`, `lib/agents/agent.ts`

**Problem**: In `agent.ts` `learn()` method:

```typescript
if (this.evaluator && this.flywheelLogger) {
  const scores = await this.evaluator.evaluateRecord(lastRecord);
  lastRecord.qualitySignals = { ... };  // Scores assigned to local variable
}
```

The scores are assigned to `lastRecord.qualitySignals`, but:
1. `lastRecord` is a reference from `flywheelLogger.getRecords()`
2. The flywheel logger's `addEvaluationScores()` method is **never called**
3. The record is never re-persisted to Elasticsearch

**Impact**: LLM-as-Judge evaluation runs but scores aren't saved.

**Fix Required**: Call `flywheelLogger.addEvaluationScores(recordId, scores)`.

---

### 8. ❌ ELASTICSEARCH SINK SILENTLY FAILS

**Location**: `lib/agents/flywheel/elasticsearch-sink.ts`

**Problem**: The Elasticsearch integration is designed for a local ES instance at `localhost:9200`. If ES isn't running:
- Errors are caught and logged
- Records go to DLQ (dead letter queue)
- **No alert or indication to the user**

The `elasticsearch-8.11.0/` directory exists in the project but there's no startup script or documentation for running it.

**Impact**: Flywheel data is silently lost if ES isn't running.

**Fix Required**: Either make ES optional with clear fallback, or add startup automation.

---

### 9. ❌ DORY_AGENT TOOL CREATES NEW INSTANCES EVERY CALL

**Location**: `lib/agents/mcp-agent-runner.ts`

**Problem**: Every call to `dory_agent` tool:
1. Creates new tool instances
2. Creates new FlywheelLogger (with new workloadId)
3. Creates new RAGPipeline
4. Creates new UnifiedContext
5. Creates new Evaluator

```typescript
export async function runDoryAgent(message: string, config: AgentRunnerConfig): Promise<AgentRunResult> {
  // All of these are created fresh every call:
  const tools: Tool[] = [ new SetProjectTool(), new GetProjectTool(), ... ];
  const flywheelLogger = getFlywheelLogger({ workloadId: sessionId, ... });
  const ragPipeline = getRAGPipeline({ profile: IOS_DEVELOPMENT_PROFILE });
  // etc.
}
```

**Impact**: 
- No state persistence between calls
- RAG index rebuilt every time
- Memory not shared between calls
- Flywheel records scattered across workloads

**Fix Required**: Use singletons or session-scoped instances.

---

### 10. ❌ BASH TOOL ENFORCEMENT IS INCOMPLETE

**Location**: `lib/agents/tools/bash.ts`

**Problem**: The bash tool now has iOS device enforcement (from earlier fix), but:
1. Only checks `xcodebuild` commands
2. Doesn't check `xcrun devicectl` commands
3. Doesn't check `ios-deploy` commands
4. Doesn't enforce for `swift build` or other build tools

**Impact**: Partial enforcement - some build paths still bypass device rules.

**Fix Required**: Comprehensive build command interception.

---

### 11. ❌ PII GUARD RUNS BUT DOESN'T RESTORE

**Location**: `lib/security/pii-guard.ts`, `lib/agents/agent.ts`

**Problem**: The `PIIGuard.redact()` method is called on user messages:
```typescript
const sanitizedUserMessage = this.piiGuard.redact(userMessage);
```

But there's no corresponding `restore()` call before returning the response. If the AI's response references redacted content, it will contain placeholders like `[EMAIL_1]` instead of actual values.

**Impact**: Responses may contain unresolved PII placeholders.

**Fix Required**: Implement bidirectional PII handling.

---

### 12. ❌ CONTEXT MANAGER TRUNCATION LOSES TOOL RESULTS

**Location**: `lib/context-manager.ts`

**Problem**: When context exceeds limits, the `prepareForAPI()` method truncates messages. The truncation strategy `tool_results_first` is supposed to preserve tool results, but:
1. It truncates from the middle of the conversation
2. Tool results from early in the conversation are lost
3. No summarization - just deletion

**Impact**: Long conversations lose important context silently.

**Fix Required**: Implement proper summarization before truncation.

---

## MEDIUM ISSUES

### 13. ⚠️ Registry Doesn't Include All Tools

**Location**: `lib/agents/tools/registry.ts`

The `createToolRegistry()` function doesn't include:
- RAG tools (RAGIngestTool, RAGSearchTool, etc.)
- Vision tools (VisionAnalysisTool, iOSUIReviewTool, etc.)
- Specialist tools (SearchSpecialistTool, etc.)

These are manually added in `mcp-server.ts` and `mcp-agent-runner.ts`, creating duplication.

---

### 14. ⚠️ Flywheel Logger Disabled in MCP Server

**Location**: `mcp-server.ts` line 67

```typescript
const flywheelLogger = getFlywheelLogger({ enabled: false }); // Disabled to prevent crashes
```

The main flywheel logger is disabled. A separate one is created for flywheel tools, but the agent's automatic logging is off.

---

### 15. ⚠️ No Validation of Tool Arguments

Tools receive `Record<string, unknown>` and do their own parsing. There's a `validate()` method in `BaseTool` but it's not consistently used, and errors are returned as strings rather than thrown.

---

### 16. ⚠️ Tracer Spans Never Exported

**Location**: `lib/agents/observability/tracer.ts`

The `Tracer` class creates spans but there's no exporter configured. Spans are created and ended but the data goes nowhere.

---

## LOW ISSUES

### 17. 📝 Duplicate Tool Instantiation

Tools are instantiated in multiple places:
- `mcp-server.ts`
- `mcp-agent-runner.ts`
- `registry.ts`

Should use a single factory.

---

### 18. 📝 Inconsistent Error Handling

Some tools return `Error: message`, others throw, others return objects with `isError` flags.

---

### 19. 📝 No Health Check Endpoint

The MCP server has no way to verify it's healthy or check component status.

---

## SUMMARY TABLE

| Component | Status | Wired? | Functional? |
|-----------|--------|--------|-------------|
| Hooks (agentSpawn, postToolUse) | ❌ BROKEN | No | No |
| UnifiedContext | ⚠️ PARTIAL | Optional | When used |
| ToolOrchestrator | ❌ BROKEN | Yes | No (output ignored) |
| FeedbackOptimizer | ❌ BROKEN | Yes | No (results discarded) |
| AutoRAGUpdater | ❌ BROKEN | Yes | No (never syncs) |
| FlywheelEvaluator | ❌ BROKEN | Yes | No (scores lost) |
| FlywheelLogger | ⚠️ PARTIAL | Yes | Disabled in MCP |
| Elasticsearch Sink | ⚠️ PARTIAL | Yes | Silent failure |
| Memory (tools/memory.ts) | ✅ WORKS | Yes | Yes |
| Memory (vector-memory.ts) | ✅ WORKS | Yes | Yes (separate system) |
| RAG Pipeline | ✅ WORKS | Yes | Yes |
| Bash Tool Enforcement | ⚠️ PARTIAL | Yes | Partial |
| PII Guard | ⚠️ PARTIAL | Yes | One-way only |
| Context Manager | ⚠️ PARTIAL | Yes | Lossy truncation |

---

## ROOT CAUSE

The system was built with good architectural intentions but **integration was never completed**. Each component works in isolation but the glue code to connect them is missing or broken.

The pattern is consistent:
1. Class is designed and implemented ✓
2. Class is instantiated ✓
3. Class is passed to constructor ✓
4. **Class methods are never called** ✗

This suggests the system was built incrementally with each component tested in isolation, but end-to-end integration testing was never performed.

---

## RECOMMENDED FIX ORDER

1. **Implement hook execution** - This is the foundation for rule enforcement
2. **Unify memory systems** - Single source of truth
3. **Make UnifiedContext mandatory** - Context injection on every call
4. **Fix learn() method** - Actually persist evaluation scores
5. **Fix ToolOrchestrator** - Use its output
6. **Add integration tests** - Verify end-to-end flows

---

## VERIFICATION COMMANDS

```bash
# Check if hooks are processed
grep -r "agentSpawn" /Users/home/Documents/nvidia-cli/lib --include="*.ts"

# Check memory file locations
ls -la ~/.nvidia-cli/memory/
ls -la ~/.kiro/memory/

# Check if ES is running
curl -s localhost:9200/_cluster/health | jq .status

# Check flywheel records
cat ~/.nvidia-cli/flywheel/*.json 2>/dev/null | head -20
```
