// API Route: Shutdown
// Kills all running processes and exits

import { exec } from 'child_process';

export async function POST() {
  try {
    // Kill all related processes
    exec('pkill -f "next dev" ; pkill -f "terminal-server" ; pkill -f "npm run dev"');
    
    return new Response(JSON.stringify({ success: true, message: 'Shutdown initiated' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: String(error) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
