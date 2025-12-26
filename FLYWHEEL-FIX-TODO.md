# Flywheel Fix TODO - Complete Implementation

## Phase 1: Schema Unification ✅
- [x] 1.1 Rewrite `lib/agents/flywheel/types.ts` with unified schema
- [x] 1.2 Update `lib/agents/flywheel/logger.ts` to use unified schema
- [x] 1.3 Update `lib/agents/flywheel/quality-filter.ts` to use unified schema
- [x] 1.4 Update `lib/agents/flywheel/trajectory-scorer.ts` to use unified schema
- [x] 1.5 Update `lib/agents/flywheel/dataset-creator.ts` to use unified schema
- [x] 1.6 Update `lib/agents/flywheel/evaluator.ts` to use unified schema

## Phase 2: Elasticsearch Sink ✅
- [x] 2.1 Rewrite `lib/agents/flywheel/elasticsearch-sink.ts` with full implementation
- [x] 2.2 Add retry logic with exponential backoff
- [x] 2.3 Add dead letter queue (DLQ) for failed writes
- [x] 2.4 Create DLQ directory

## Phase 3: Quality Filter Integration ✅
- [x] 3.1 Fix `lib/agents/flywheel/quality-filter.ts` field references
- [x] 3.2 Create sft_traces/ directory
- [x] 3.3 Create dpo_traces/ directory
- [x] 3.4 Integrate quality filter into logger.ts (call after logging)

## Phase 4: Dashboard Fix ✅
- [x] 4.1 Update `app/api/dashboard/route.ts` to use correct field names
- [x] 4.2 Add more metrics (tool usage, model distribution, latency)

## Phase 5: Error Monitor Integration ✅
- [x] 5.1 Fix `lib/agents/flywheel/error-monitor.ts` field references
- [x] 5.2 Create initialization script that starts error monitor
- [x] 5.3 Update `start.sh` to start error monitor

## Phase 6: AutoRAG Updater Fix ✅
- [x] 6.1 Fix `lib/agents/rag/auto-updater.ts` to use correct quality field

## Phase 7: Kiro Integration ✅
- [x] 7.1 Update flywheel-api.ts to handle Kiro hook data
- [x] 7.2 Document Kiro hook configuration

## Phase 8: Build Verification ✅
- [x] 8.1 Fix TypeScript compilation errors
- [x] 8.2 Verify Next.js build succeeds

---

## Summary of Changes

### Files Created/Modified:

1. **lib/agents/flywheel/types.ts** - Unified schema with:
   - Single FlywheelRecord interface for both logging and NAT export
   - QualitySignals with all scoring fields
   - toNATFormat() converter function
   - Constants: QUALITY_THRESHOLD=7, MIN_RESPONSE_LENGTH=50, MAX_ERROR_RATE=0.5

2. **lib/agents/flywheel/logger.ts** - Enhanced logger with:
   - Automatic ES persistence
   - Quality filter routing after evaluation
   - Workload type classification
   - High-quality record filtering

3. **lib/agents/flywheel/elasticsearch-sink.ts** - Full ES integration:
   - Retry logic with exponential backoff (5 retries)
   - Dead letter queue for failed writes
   - Bulk ingest support
   - DLQ retry functionality

4. **lib/agents/flywheel/quality-filter.ts** - Training data routing:
   - computeReward() for binary SFT/DPO classification
   - routeToTrainingDir() writes to sft_traces/ or dpo_traces/
   - exportAsJSONL() for training data export
   - createDPOPairs() for preference learning

5. **lib/agents/flywheel/trajectory-scorer.ts** - Quality scoring:
   - computeReward() with configurable thresholds
   - computeDetailedScores() for granular analysis
   - Heuristic scoring when no explicit rating

6. **lib/agents/flywheel/evaluator.ts** - LLM-as-Judge:
   - evaluateRecord() with tool-aware prompts
   - evaluateBatch() with rate limiting
   - compareModels() for A/B testing

7. **lib/agents/flywheel/dataset-creator.ts** - Training datasets:
   - createDatasets() with train/eval/test splits
   - exportToJSONL() in OpenAI format
   - Validation and quality filtering

8. **lib/agents/flywheel/error-monitor.ts** - Error alerting:
   - 5-minute interval checks
   - Slack webhook integration
   - Configurable threshold (5%)

9. **lib/agents/rag/auto-updater.ts** - RAG sync:
   - Uses correct qualitySignals.overallScore field
   - Deduplication by record ID
   - Formats records as Q&A documents

10. **lib/agents/feedback-optimizer.ts** - Failure analysis:
    - Uses correct quality field references
    - Golden example retrieval
    - Pattern analysis with LLM

11. **app/api/dashboard/route.ts** - Dashboard API:
    - Correct field mapping for both formats
    - Training stats, DLQ stats
    - Model/workload distribution

12. **app/dashboard/page.tsx** - Dashboard UI:
    - Quality distribution pie chart
    - Daily volume bar chart
    - Error rate gauge
    - Training data stats

13. **flywheel-api.ts** - External API:
    - POST /api/flywheel/log
    - POST /api/flywheel/evaluate
    - POST /api/flywheel/feedback
    - GET /api/flywheel/stats
    - GET /api/flywheel/export

14. **start.sh** - Startup script:
    - Creates training directories
    - Starts flywheel API server
    - Starts error monitor

### Directories Created:
- sft_traces/ - High-quality training data
- dpo_traces/ - Low-quality data for DPO
- dlq/ - Dead letter queue for failed ES writes

---

## How the Loop Works Now

```
User Interaction
       ↓
   Agent.run()
       ↓
FlywheelLogger.logInteraction()
       ↓
   ┌───┴───┐
   ↓       ↓
In-Memory  Elasticsearch
   ↓       (with retry + DLQ)
   ↓
FlywheelEvaluator.evaluateRecord()
   ↓
FlywheelLogger.addEvaluationScores()
   ↓
routeToTrainingDir()
   ↓
   ┌───┴───┐
   ↓       ↓
sft_traces/  dpo_traces/
(score≥7)    (score<7)
   ↓
DatasetCreator.createDatasets()
   ↓
exportToJSONL()
   ↓
Fine-tuning ready!
```

## Next Steps (Optional Enhancements)

1. **Kiro Hook Integration** - Add to ~/.kiro/agents/dory.json:
```json
"hooks": {
  "stop": [{
    "command": "curl -X POST http://localhost:3001/api/flywheel/log -H 'Content-Type: application/json' -d '{...}'"
  }]
}
```

2. **Scheduled DLQ Retry** - Add cron job to retry failed records

3. **Training Pipeline** - Connect to NVIDIA NeMo for actual fine-tuning

4. **A/B Testing** - Use compareModels() to evaluate fine-tuned vs base
