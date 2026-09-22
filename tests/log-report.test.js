const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SCRIPT_PATH = path.join(__dirname, '..', 'hooks', 'scripts', 'log-report.js');

function mkTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'log-report-test-'));
}

function writeTranscript(dir, entries) {
  const transcriptPath = path.join(dir, 'transcript.jsonl');
  const lines = entries.map((entry) => JSON.stringify(entry)).join('\n');
  fs.writeFileSync(transcriptPath, lines, 'utf8');
  return transcriptPath;
}

function userEntry(text) {
  return { type: 'user', message: { content: text } };
}

function toolResultUserEntry() {
  return { type: 'user', message: { content: [{ type: 'tool_result', content: 'ok' }] } };
}

function assistantEntry(text) {
  return { type: 'assistant', message: { content: text } };
}

function sidechainUserEntry(text) {
  return { type: 'user', isSidechain: true, message: { content: text } };
}

function sidechainAssistantEntry(text) {
  return { type: 'assistant', isSidechain: true, message: { content: text } };
}

function sidechainToolResultUserEntry() {
  return { type: 'user', isSidechain: true, message: { content: [{ type: 'tool_result', content: 'sidechain tool output' }] } };
}

function runHook(input) {
  return spawnSync('node', [SCRIPT_PATH], {
    input: JSON.stringify(input),
    encoding: 'utf8',
  });
}

function logsDirFor(cwd) {
  return path.join(cwd, 'development-logs');
}

test('no-op on malformed stdin JSON', () => {
  const cwd = mkTmpDir();
  const result = spawnSync('node', [SCRIPT_PATH], { input: 'not json', cwd, encoding: 'utf8' });
  assert.equal(result.status, 0);
  assert.equal(fs.existsSync(logsDirFor(cwd)), false);
});

test('no-op when stop_hook_active is true, even with a matching transcript', () => {
  const cwd = mkTmpDir();
  const transcriptPath = writeTranscript(cwd, [
    userEntry('/assess-quality'),
    assistantEntry('# Report'),
  ]);
  const result = runHook({ stop_hook_active: true, transcript_path: transcriptPath, cwd });
  assert.equal(result.status, 0);
  assert.equal(fs.existsSync(logsDirFor(cwd)), false);
});

test('no-op when transcript_path is missing', () => {
  const cwd = mkTmpDir();
  const result = runHook({ cwd });
  assert.equal(result.status, 0);
  assert.equal(fs.existsSync(logsDirFor(cwd)), false);
});

test('no-op when transcript_path does not exist on disk', () => {
  const cwd = mkTmpDir();
  const result = runHook({ transcript_path: path.join(cwd, 'missing.jsonl'), cwd });
  assert.equal(result.status, 0);
  assert.equal(fs.existsSync(logsDirFor(cwd)), false);
});

test('no-op when the last real user message is not /assess-quality', () => {
  const cwd = mkTmpDir();
  const transcriptPath = writeTranscript(cwd, [
    userEntry('/assess-quality'),
    assistantEntry('# Report'),
    userEntry('just chatting, not a command'),
  ]);
  const result = runHook({ transcript_path: transcriptPath, cwd });
  assert.equal(result.status, 0);
  assert.equal(fs.existsSync(logsDirFor(cwd)), false);
});

test('no-op when no assistant text follows the /assess-quality command', () => {
  const cwd = mkTmpDir();
  const transcriptPath = writeTranscript(cwd, [userEntry('/assess-quality')]);
  const result = runHook({ transcript_path: transcriptPath, cwd });
  assert.equal(result.status, 0);
  assert.equal(fs.existsSync(logsDirFor(cwd)), false);
});

test('writes the report to development-logs/ when the run was /assess-quality', () => {
  const cwd = mkTmpDir();
  const transcriptPath = writeTranscript(cwd, [
    userEntry('/assess-quality'),
    assistantEntry('# QA Report\n\nAll good.'),
  ]);
  const result = runHook({ transcript_path: transcriptPath, cwd });
  assert.equal(result.status, 0);

  const dir = logsDirFor(cwd);
  assert.equal(fs.existsSync(dir), true);
  const files = fs.readdirSync(dir);
  assert.equal(files.length, 1);
  assert.match(files[0], /^assess-quality-.*\.md$/);
  const content = fs.readFileSync(path.join(dir, files[0]), 'utf8');
  assert.equal(content, '# QA Report\n\nAll good.');
});

test('matches the namespaced plugin command form (/qa-plugin:assess-quality)', () => {
  const cwd = mkTmpDir();
  const transcriptPath = writeTranscript(cwd, [
    userEntry('/qa-plugin:assess-quality'),
    assistantEntry('# Report'),
  ]);
  const result = runHook({ transcript_path: transcriptPath, cwd });
  assert.equal(result.status, 0);
  assert.equal(fs.existsSync(logsDirFor(cwd)), true);
});

test('matches the <command-name> marker form the harness emits', () => {
  const cwd = mkTmpDir();
  const transcriptPath = writeTranscript(cwd, [
    userEntry('<command-name>/qa-plugin:assess-quality</command-name>\n<command-message>assess-quality</command-message>'),
    assistantEntry('# Report'),
  ]);
  const result = runHook({ transcript_path: transcriptPath, cwd });
  assert.equal(result.status, 0);
  assert.equal(fs.existsSync(logsDirFor(cwd)), true);
});

test('skips synthetic tool_result "user" entries when finding the last real user text', () => {
  const cwd = mkTmpDir();
  const transcriptPath = writeTranscript(cwd, [
    userEntry('/assess-quality'),
    assistantEntry('Running checks...'),
    toolResultUserEntry(),
    assistantEntry('# Final Report'),
  ]);
  const result = runHook({ transcript_path: transcriptPath, cwd });
  assert.equal(result.status, 0);

  const dir = logsDirFor(cwd);
  const files = fs.readdirSync(dir);
  assert.equal(files.length, 1);
  const content = fs.readFileSync(path.join(dir, files[0]), 'utf8');
  assert.equal(content, '# Final Report');
});

test('joins multiple text blocks in assistant content with newlines', () => {
  const cwd = mkTmpDir();
  const transcriptPath = writeTranscript(cwd, [
    userEntry('/assess-quality'),
    {
      type: 'assistant',
      message: {
        content: [
          { type: 'text', text: 'Part one.' },
          { type: 'text', text: 'Part two.' },
        ],
      },
    },
  ]);
  const result = runHook({ transcript_path: transcriptPath, cwd });
  assert.equal(result.status, 0);

  const dir = logsDirFor(cwd);
  const files = fs.readdirSync(dir);
  const content = fs.readFileSync(path.join(dir, files[0]), 'utf8');
  assert.equal(content, 'Part one.\nPart two.');
});

test('does not match plain text mentioning assess-quality without a leading slash', () => {
  const cwd = mkTmpDir();
  const transcriptPath = writeTranscript(cwd, [
    userEntry('please run assess-quality now'),
    assistantEntry('# Report'),
  ]);
  const result = runHook({ transcript_path: transcriptPath, cwd });
  assert.equal(result.status, 0);
  assert.equal(fs.existsSync(logsDirFor(cwd)), false);
});

test('does not match a <command-name> marker missing the leading slash', () => {
  const cwd = mkTmpDir();
  const transcriptPath = writeTranscript(cwd, [
    userEntry('<command-name>assess-quality</command-name>'),
    assistantEntry('# Report'),
  ]);
  const result = runHook({ transcript_path: transcriptPath, cwd });
  assert.equal(result.status, 0);
  assert.equal(fs.existsSync(logsDirFor(cwd)), false);
});

// The trigger regex uses `\b` after "assess-quality" rather than a hard end
// anchor, so a longer command that merely starts with "/assess-quality" is
// treated as a match too (a "-" is a word boundary just like whitespace).
// This documents that known false-positive behavior of the current regex.
test('known limitation: /assess-quality-ish is treated as a match (false positive)', () => {
  const cwd = mkTmpDir();
  const transcriptPath = writeTranscript(cwd, [
    userEntry('/assess-quality-ish'),
    assistantEntry('# Report'),
  ]);
  const result = runHook({ transcript_path: transcriptPath, cwd });
  assert.equal(result.status, 0);
  assert.equal(fs.existsSync(logsDirFor(cwd)), true);
});

test('ignores sidechain (subagent) entries when the command launched subagents', () => {
  const cwd = mkTmpDir();
  const transcriptPath = writeTranscript(cwd, [
    userEntry('/qa-plugin:assess-quality'),
    assistantEntry('Launching subagents...'),
    sidechainUserEntry('Review the target code for correctness...'),
    sidechainAssistantEntry('Here are my findings...'),
    assistantEntry('# Final Report\n\nConsolidated findings.'),
  ]);
  const result = runHook({ transcript_path: transcriptPath, cwd });
  assert.equal(result.status, 0);

  const dir = logsDirFor(cwd);
  assert.equal(fs.existsSync(dir), true);
  const files = fs.readdirSync(dir);
  assert.equal(files.length, 1);
  const content = fs.readFileSync(path.join(dir, files[0]), 'utf8');
  assert.equal(content, '# Final Report\n\nConsolidated findings.');
});

test('does not mistake a sidechain user entry for the last real user text', () => {
  const cwd = mkTmpDir();
  const transcriptPath = writeTranscript(cwd, [
    userEntry('just chatting, not a command'),
    assistantEntry('sure'),
    sidechainUserEntry('/qa-plugin:assess-quality'),
    sidechainAssistantEntry('# Sidechain report'),
  ]);
  const result = runHook({ transcript_path: transcriptPath, cwd });
  assert.equal(result.status, 0);
  assert.equal(fs.existsSync(logsDirFor(cwd)), false);
});

test('falls back to process.cwd() when input.cwd is absent', () => {
  const cwd = mkTmpDir();
  const transcriptPath = writeTranscript(cwd, [
    userEntry('/assess-quality'),
    assistantEntry('# Report without explicit cwd'),
  ]);
  const result = spawnSync('node', [SCRIPT_PATH], {
    input: JSON.stringify({ transcript_path: transcriptPath }),
    cwd,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0);

  const dir = logsDirFor(cwd);
  assert.equal(fs.existsSync(dir), true);
  const files = fs.readdirSync(dir);
  assert.equal(files.length, 1);
});

test('ignores sidechain entries interleaved on both sides of the real command and report', () => {
  const cwd = mkTmpDir();
  const transcriptPath = writeTranscript(cwd, [
    sidechainUserEntry('/qa-plugin:assess-quality'),
    sidechainAssistantEntry('# Sidechain report before the real turn'),
    userEntry('/qa-plugin:assess-quality'),
    assistantEntry('Launching subagents...'),
    sidechainUserEntry('Review the target code for correctness...'),
    sidechainAssistantEntry('Here are my findings...'),
    assistantEntry('# Final Report\n\nConsolidated findings.'),
    sidechainUserEntry('/qa-plugin:assess-quality'),
    sidechainAssistantEntry('# Sidechain report after the real turn'),
  ]);
  const result = runHook({ transcript_path: transcriptPath, cwd });
  assert.equal(result.status, 0);

  const dir = logsDirFor(cwd);
  assert.equal(fs.existsSync(dir), true);
  const files = fs.readdirSync(dir);
  assert.equal(files.length, 1);
  const content = fs.readFileSync(path.join(dir, files[0]), 'utf8');
  assert.equal(content, '# Final Report\n\nConsolidated findings.');
});

test('skips a sidechain user entry even when it carries a tool_result block', () => {
  const cwd = mkTmpDir();
  const transcriptPath = writeTranscript(cwd, [
    userEntry('/assess-quality'),
    assistantEntry('Launching subagents...'),
    sidechainToolResultUserEntry(),
    sidechainAssistantEntry('Sidechain findings.'),
    assistantEntry('# Final Report'),
  ]);
  const result = runHook({ transcript_path: transcriptPath, cwd });
  assert.equal(result.status, 0);

  const dir = logsDirFor(cwd);
  assert.equal(fs.existsSync(dir), true);
  const files = fs.readdirSync(dir);
  assert.equal(files.length, 1);
  const content = fs.readFileSync(path.join(dir, files[0]), 'utf8');
  assert.equal(content, '# Final Report');
});

test('treats a missing isSidechain key the same as an explicit isSidechain: false', () => {
  const cwd = mkTmpDir();
  const transcriptPath = writeTranscript(cwd, [
    { type: 'user', isSidechain: false, message: { content: '/assess-quality' } },
    { type: 'assistant', isSidechain: false, message: { content: '# Report with explicit isSidechain false' } },
  ]);
  const result = runHook({ transcript_path: transcriptPath, cwd });
  assert.equal(result.status, 0);

  const dir = logsDirFor(cwd);
  assert.equal(fs.existsSync(dir), true);
  const files = fs.readdirSync(dir);
  assert.equal(files.length, 1);
  const content = fs.readFileSync(path.join(dir, files[0]), 'utf8');
  assert.equal(content, '# Report with explicit isSidechain false');
});
