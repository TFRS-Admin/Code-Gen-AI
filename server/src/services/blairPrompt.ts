import fs from 'fs';
import path from 'path';

export const BLAIR_SYSTEM_PROMPT = (() => {
  try {
    const promptPath = path.resolve(__dirname, '../../../prompts/blair-system-prompt.md');
    return fs.readFileSync(promptPath, 'utf8');
  } catch {
    return 'You are Blair, a senior AI coding assistant. Follow the Define → Plan → Build → Verify → Review → Ship lifecycle.';
  }
})();
