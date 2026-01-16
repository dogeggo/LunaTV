const fs = require('node:fs');
const path = require('node:path');

const rawArgs = process.argv.slice(2);
const dryRun = rawArgs.includes('--dry-run');
const targetArg = rawArgs.find((arg) => !arg.startsWith('-'));
const targetDir = targetArg
  ? path.resolve(process.cwd(), targetArg)
  : path.join(process.cwd(), 'src');

const exts = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs']);
const ignoreDirs = new Set([
  'node_modules',
  '.next',
  '.git',
  'dist',
  'out',
  'coverage',
  '.turbo',
]);

function printUsage() {
  console.log('Usage: node scripts/comment-console-logs.js [targetDir] [--dry-run]');
}

function isIdentifierChar(ch) {
  return /[A-Za-z0-9_$]/.test(ch);
}

function isBoundaryBefore(text, index) {
  if (index === 0) return true;
  return !isIdentifierChar(text[index - 1]);
}

function isBoundaryAfter(text, index) {
  const next = text[index + 1];
  if (!next) return true;
  return !isIdentifierChar(next);
}

function createScanState() {
  return {
    inLineComment: false,
    inBlockComment: false,
    inSingle: false,
    inDouble: false,
    inTemplate: false,
    escaped: false,
  };
}

function advanceStringState(state, ch, quote) {
  if (!state.escaped && ch === quote) {
    if (quote === "'") state.inSingle = false;
    if (quote === '"') state.inDouble = false;
    if (quote === '`') state.inTemplate = false;
    state.escaped = false;
    return true;
  }
  state.escaped = ch === '\\' && !state.escaped;
  return false;
}

function findConsoleLogCallRange(source, startIndex) {
  const name = 'console.log';
  let i = startIndex + name.length;

  while (i < source.length && /\s/.test(source[i])) i += 1;
  if (source[i] !== '(') return null;

  i += 1;
  let depth = 1;
  const state = createScanState();

  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];

    if (state.inLineComment) {
      if (ch === '\n') state.inLineComment = false;
      i += 1;
      continue;
    }

    if (state.inBlockComment) {
      if (ch === '*' && next === '/') {
        state.inBlockComment = false;
        i += 2;
        continue;
      }
      i += 1;
      continue;
    }

    if (state.inSingle) {
      advanceStringState(state, ch, "'");
      i += 1;
      continue;
    }

    if (state.inDouble) {
      advanceStringState(state, ch, '"');
      i += 1;
      continue;
    }

    if (state.inTemplate) {
      advanceStringState(state, ch, '`');
      i += 1;
      continue;
    }

    if (ch === '/' && next === '/') {
      state.inLineComment = true;
      i += 2;
      continue;
    }

    if (ch === '/' && next === '*') {
      state.inBlockComment = true;
      i += 2;
      continue;
    }

    if (ch === "'") {
      state.inSingle = true;
      state.escaped = false;
      i += 1;
      continue;
    }

    if (ch === '"') {
      state.inDouble = true;
      state.escaped = false;
      i += 1;
      continue;
    }

    if (ch === '`') {
      state.inTemplate = true;
      state.escaped = false;
      i += 1;
      continue;
    }

    if (ch === '(') {
      depth += 1;
    } else if (ch === ')') {
      depth -= 1;
      if (depth === 0) {
        i += 1;
        break;
      }
    }

    i += 1;
  }

  if (depth !== 0) return null;

  let end = i;
  let probe = end;
  while (probe < source.length && /[ \t]/.test(source[probe])) {
    probe += 1;
  }
  if (source[probe] === ';') {
    end = probe + 1;
  }

  return { start: startIndex, end };
}

function findConsoleLogRanges(source) {
  const ranges = [];
  const name = 'console.log';
  const state = createScanState();
  let i = 0;

  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];

    if (state.inLineComment) {
      if (ch === '\n') state.inLineComment = false;
      i += 1;
      continue;
    }

    if (state.inBlockComment) {
      if (ch === '*' && next === '/') {
        state.inBlockComment = false;
        i += 2;
        continue;
      }
      i += 1;
      continue;
    }

    if (state.inSingle) {
      advanceStringState(state, ch, "'");
      i += 1;
      continue;
    }

    if (state.inDouble) {
      advanceStringState(state, ch, '"');
      i += 1;
      continue;
    }

    if (state.inTemplate) {
      advanceStringState(state, ch, '`');
      i += 1;
      continue;
    }

    if (ch === '/' && next === '/') {
      state.inLineComment = true;
      i += 2;
      continue;
    }

    if (ch === '/' && next === '*') {
      state.inBlockComment = true;
      i += 2;
      continue;
    }

    if (ch === "'") {
      state.inSingle = true;
      state.escaped = false;
      i += 1;
      continue;
    }

    if (ch === '"') {
      state.inDouble = true;
      state.escaped = false;
      i += 1;
      continue;
    }

    if (ch === '`') {
      state.inTemplate = true;
      state.escaped = false;
      i += 1;
      continue;
    }

    if (
      source.startsWith(name, i) &&
      isBoundaryBefore(source, i) &&
      isBoundaryAfter(source, i + name.length - 1)
    ) {
      const range = findConsoleLogCallRange(source, i);
      if (range) {
        ranges.push(range);
        i = range.end;
        continue;
      }
    }

    i += 1;
  }

  return ranges;
}

function commentConsoleLogs(source) {
  const ranges = findConsoleLogRanges(source);
  if (ranges.length === 0) {
    return { changed: false, content: source, count: 0 };
  }

  let result = '';
  let lastIndex = 0;
  for (const range of ranges) {
    result += source.slice(lastIndex, range.start);
    const snippet = source.slice(range.start, range.end);
    const safeSnippet = snippet.replace(/\*\//g, '*\\/');
    result += `/* ${safeSnippet} */`;
    lastIndex = range.end;
  }
  result += source.slice(lastIndex);

  return { changed: true, content: result, count: ranges.length };
}

function collectFiles(dir, results) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (ignoreDirs.has(entry.name)) continue;
      collectFiles(fullPath, results);
      continue;
    }
    if (entry.isFile()) results.push(fullPath);
  }
}

function shouldProcess(filePath) {
  const ext = path.extname(filePath);
  if (!exts.has(ext)) return false;
  if (filePath.endsWith('.d.ts')) return false;
  return true;
}

function main() {
  if (rawArgs.includes('--help') || rawArgs.includes('-h')) {
    printUsage();
    process.exit(0);
  }

  if (!fs.existsSync(targetDir)) {
    console.error(`Target path does not exist: ${targetDir}`);
    printUsage();
    process.exit(1);
  }

  const files = [];
  collectFiles(targetDir, files);

  let totalFiles = 0;
  let changedFiles = 0;
  let totalLogs = 0;

  for (const filePath of files) {
    if (!shouldProcess(filePath)) continue;

    const source = fs.readFileSync(filePath, 'utf8');
    if (!source.includes('console.log')) continue;

    totalFiles += 1;
    const result = commentConsoleLogs(source);
    if (!result.changed) continue;

    totalLogs += result.count;
    changedFiles += 1;
    if (!dryRun) {
      fs.writeFileSync(filePath, result.content, 'utf8');
    }
  }

  const modeLabel = dryRun ? 'Dry run' : 'Completed';
  console.log(
    `${modeLabel}: ${changedFiles} files updated, ${totalLogs} console.log calls commented.`,
  );
}

main();
