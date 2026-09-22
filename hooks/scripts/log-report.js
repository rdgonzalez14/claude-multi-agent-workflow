#!/usr/bin/env node
// Stop hook: if the user's last turn was the /assess-quality command, archive
// the report Claude just produced (see skills/report-format/SKILL.md for its
// shape) into development-logs/ so the project keeps a history of QA runs.

const fs = require('fs');
const path = require('path');
const readline = require('readline');

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

function textFromContent(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  const textBlocks = content.filter((block) => block && block.type === 'text');
  if (textBlocks.length === 0) return '';
  return textBlocks.map((block) => block.text || '').join('\n');
}

function hasToolResult(content) {
  return Array.isArray(content) && content.some((block) => block && block.type === 'tool_result');
}

async function readTranscript(transcriptPath) {
  const entries = [];
  const stream = fs.createReadStream(transcriptPath, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      entries.push(JSON.parse(line));
    } catch {
      // skip malformed lines
    }
  }
  return entries;
}

// Matches a plain "/assess-quality ..." turn as well as the namespaced form
// ("/qa-plugin:assess-quality") and the <command-name> marker the harness
// wraps a slash-command invocation in.
const ASSESS_QUALITY_RE = /(?:^|<command-name>)\/(?:[\w-]+:)?assess-quality\b/;

function matchesAssessQuality(text) {
  return ASSESS_QUALITY_RE.test(text);
}

function findLastRealUserText(entries) {
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const entry = entries[i];
    if (entry.isSidechain) continue; // subagent transcript entry, not the main turn
    if (entry.type !== 'user') continue;
    const content = entry.message && entry.message.content;
    if (hasToolResult(content)) continue; // synthetic tool-result "user" message
    const text = textFromContent(content).trim();
    if (text) return text;
  }
  return null;
}

function findLastAssistantText(entries) {
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const entry = entries[i];
    if (entry.isSidechain) continue; // subagent transcript entry, not the main turn
    if (entry.type !== 'assistant') continue;
    const content = entry.message && entry.message.content;
    const text = textFromContent(content).trim();
    if (text) return text;
  }
  return null;
}

async function main() {
  const raw = await readStdin();
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    return; // nothing usable on stdin, no-op
  }

  if (input.stop_hook_active) return; // avoid recursing on our own stop

  const transcriptPath = input.transcript_path;
  if (!transcriptPath || !fs.existsSync(transcriptPath)) return;

  const entries = await readTranscript(transcriptPath);

  const lastUserText = findLastRealUserText(entries);
  if (!lastUserText || !matchesAssessQuality(lastUserText)) return;

  const report = findLastAssistantText(entries);
  if (!report) return;

  const cwd = input.cwd || process.cwd();
  const logsDir = path.join(cwd, 'development-logs');
  fs.mkdirSync(logsDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outPath = path.join(logsDir, `assess-quality-${timestamp}.md`);
  fs.writeFileSync(outPath, report, 'utf8');
}

main().catch(() => {
  // Never fail the user's session over a logging hook.
  process.exit(0);
});
