// Auto-Flywheel API Endpoint
// Handles automatic conversation logging

import express from 'express';
import { getFlywheelLogger } from './lib/agents/flywheel/logger.ts';

const app = express();
app.use(express.json());

const flywheelLogger = getFlywheelLogger({ enabled: true });

// Auto-logging endpoint
app.post('/api/flywheel/log', async (req, res) => {
  try {
    const { user_message, assistant_response, model, mode } = req.body;
    
    const record = flywheelLogger.logInteraction({
      userMessage: user_message,
      assistantResponse: assistant_response,
      systemPrompt: "",
      conversationHistory: [],
      toolCalls: [],
      model: model || "claude-opus-4.5",
      mode: mode || "dory-agent",
      tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      latencyMs: 0
    });
    
    res.json({ success: true, recordId: record?.id });
  } catch (error) {
    console.error('[Flywheel API] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Start server on port 3001 (avoid conflict with main app)
const PORT = 3001;
app.listen(PORT, () => {
  console.log(`[Flywheel API] Running on http://localhost:${PORT}`);
});

export default app;
