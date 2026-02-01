#!/usr/bin/env node
/**
 * VectorSheet Headless Test Harness - CLI Entry Point
 *
 * Usage:
 *   # REPL mode
 *   npx ts-node engine/harness/cli.ts [options]
 *   npx ts-node engine/harness/cli.ts < script.txt
 *   echo "SET A1 100" | npx ts-node engine/harness/cli.ts
 *
 *   # Regression test runner
 *   npx ts-node engine/harness/cli.ts run <glob-or-path> [options]
 *   npx ts-node engine/harness/cli.ts run tests/basic.vsheet
 *   npx ts-node engine/harness/cli.ts run "tests/*.vsheet" --golden
 *
 * Options:
 *   --pretty        Human-readable output (default: JSON)
 *   --no-timestamps Omit timestamps from output
 *   --stop-on-error Stop execution on first error
 *   --echo          Echo commands before executing
 *   --verbose       Verbose mode with extra logging
 *   --help          Show help message
 *
 * Run command options:
 *   --golden        Enable golden file comparison
 *   --update-golden Update golden files
 *   --filter <str>  Filter tests by name
 *   --fail-fast     Stop on first failure
 *
 * Interactive mode:
 *   Run without piped input for REPL-style interaction.
 */

import * as readline from 'readline';
import { HarnessRunner, createHarnessRunner } from './HarnessRunner.js';
import { HarnessConfig, DEFAULT_CONFIG, Output } from './types.js';
import {
  createRegressionRunner,
  RegressionRunnerOptions,
  DEFAULT_REGRESSION_OPTIONS,
} from './RegressionRunner.js';

// =============================================================================
// CLI Argument Parsing
// =============================================================================

interface CLIArgs {
  config: Partial<HarnessConfig>;
  help: boolean;
  interactive: boolean;
  /** Subcommand: 'run' for regression testing, undefined for REPL */
  subcommand?: 'run';
  /** Arguments for subcommand */
  subcommandArgs: string[];
  /** Options for run subcommand */
  runOptions: Partial<RegressionRunnerOptions>;
}

function parseArgs(args: string[]): CLIArgs {
  const result: CLIArgs = {
    config: {},
    help: false,
    interactive: false,
    subcommandArgs: [],
    runOptions: {},
  };

  let i = 0;

  // Check for subcommand first
  if (args.length > 0 && args[0] === 'run') {
    result.subcommand = 'run';
    i = 1;
    // Default to pretty output for run command
    result.runOptions.outputFormat = 'pretty';
  }

  while (i < args.length) {
    const arg = args[i];

    switch (arg) {
      case '--pretty':
        result.config.outputFormat = 'pretty';
        result.runOptions.outputFormat = 'pretty';
        break;
      case '--json':
        result.config.outputFormat = 'json';
        result.runOptions.outputFormat = 'json';
        break;
      case '--no-timestamps':
        result.config.includeTimestamps = false;
        break;
      case '--timestamps':
        result.config.includeTimestamps = true;
        break;
      case '--stop-on-error':
        result.config.stopOnError = true;
        break;
      case '--continue-on-error':
        result.config.stopOnError = false;
        break;
      case '--echo':
        result.config.echoCommands = true;
        break;
      case '--no-echo':
        result.config.echoCommands = false;
        break;
      case '--verbose':
      case '-v':
        result.config.verbose = true;
        result.runOptions.verbose = true;
        break;
      case '--quiet':
      case '-q':
        result.config.verbose = false;
        result.runOptions.verbose = false;
        break;
      case '--interactive':
      case '-i':
        result.interactive = true;
        break;
      case '--help':
      case '-h':
        result.help = true;
        break;
      // Run command specific options
      case '--golden':
        result.runOptions.golden = true;
        break;
      case '--update-golden':
        result.runOptions.golden = true;
        result.runOptions.updateGolden = true;
        break;
      case '--fail-fast':
        result.runOptions.failFast = true;
        break;
      case '--filter':
        i++;
        if (i < args.length) {
          result.runOptions.filter = args[i];
        } else {
          console.error('--filter requires a value');
          process.exit(1);
        }
        break;
      default:
        if (arg.startsWith('-')) {
          console.error(`Unknown option: ${arg}`);
          process.exit(1);
        } else if (result.subcommand) {
          // Positional arg for subcommand
          result.subcommandArgs.push(arg);
        }
    }
    i++;
  }

  return result;
}

// =============================================================================
// Output Formatting
// =============================================================================

function formatOutput(output: Output, config: HarnessConfig): string {
  if (config.outputFormat === 'json') {
    return JSON.stringify(output);
  }

  // Pretty format
  const prefix = config.includeTimestamps
    ? `[${new Date(output.timestamp).toISOString().slice(11, 23)}] `
    : '';

  switch (output.type) {
    case 'result':
      return `${prefix}${output.success ? 'OK' : 'FAIL'}${output.data !== undefined ? `: ${JSON.stringify(output.data)}` : ''}`;

    case 'value':
      if (output.cell) {
        return `${prefix}VALUE: ${JSON.stringify(output.value)}`;
      } else if (output.range) {
        return `${prefix}RANGE:\n${formatRangeValue(output.value)}`;
      }
      return `${prefix}VALUE: ${JSON.stringify(output.value)}`;

    case 'snapshot':
      return `${prefix}SNAPSHOT:\n  Cells: ${Object.keys(output.cells).length}\n  Used range: ${formatRange(output.usedRange)}`;

    case 'diff':
      return `${prefix}DIFF: ${output.changes.length} changes${output.selectionChanged ? ', selection changed' : ''}`;

    case 'error':
      return `${prefix}ERROR: ${output.message}`;

    case 'info':
      return `${prefix}INFO: ${output.message}`;

    case 'stats':
      return `${prefix}STATS: ${output.cellCount} cells, ${output.formulaCount} formulas, ${output.memoryKB}KB`;

    case 'table':
      return `${prefix}TABLE:\n${formatTable(output.headers, output.rows)}`;

    case 'assert':
      return `${prefix}ASSERT ${output.passed ? 'PASSED' : 'FAILED'}: expected=${JSON.stringify(output.expected)}, actual=${JSON.stringify(output.actual)}${output.message ? ` (${output.message})` : ''}`;

    case 'echo':
      return `${prefix}ECHO: ${output.message}`;

    default:
      return `${prefix}${JSON.stringify(output)}`;
  }
}

function formatRangeValue(value: unknown): string {
  if (!Array.isArray(value)) return JSON.stringify(value);
  return value
    .map((row) => (Array.isArray(row) ? row.map((v) => String(v ?? '')).join('\t') : String(row)))
    .join('\n');
}

function formatRange(range: { startRow: number; startCol: number; endRow: number; endCol: number }): string {
  return `R${range.startRow}C${range.startCol}:R${range.endRow}C${range.endCol}`;
}

function formatTable(headers: string[], rows: string[][]): string {
  const allRows = [headers, ...rows];
  const colWidths = headers.map((_, i) =>
    Math.max(...allRows.map((row) => (row[i] || '').length))
  );

  const separator = colWidths.map((w) => '-'.repeat(w + 2)).join('+');
  const formatRow = (row: string[]) =>
    row.map((cell, i) => ` ${(cell || '').padEnd(colWidths[i])} `).join('|');

  return [
    formatRow(headers),
    separator,
    ...rows.map(formatRow),
  ].join('\n');
}

// =============================================================================
// Help Text
// =============================================================================

const HELP_TEXT = `
VectorSheet Headless Test Harness

USAGE:
  # Interactive / Piped mode
  npx ts-node engine/harness/cli.ts [options]
  npx ts-node engine/harness/cli.ts < script.txt
  echo "SET A1 100" | npx ts-node engine/harness/cli.ts

  # Regression test runner
  npx ts-node engine/harness/cli.ts run <glob-or-path> [options]
  npx ts-node engine/harness/cli.ts run tests/basic.vsheet
  npx ts-node engine/harness/cli.ts run "tests/*.vsheet" --golden

OPTIONS:
  --pretty          Human-readable output (default: JSON)
  --json            JSON output (one object per line)
  --no-timestamps   Omit timestamps from output
  --stop-on-error   Stop execution on first error
  --echo            Echo commands before executing
  --verbose, -v     Verbose mode with extra logging
  --interactive, -i Force interactive mode
  --help, -h        Show this help message

RUN COMMAND OPTIONS:
  --golden          Enable golden file comparison
  --update-golden   Create/update golden files (implies --golden)
  --filter <str>    Run only tests matching substring
  --fail-fast       Stop on first test failure

COMMANDS:
  Cell Operations:
    SET <cell> <value>       Set cell value (number, string, or =formula)
    GET <cell>               Get cell value
    DELETE <cell|range>      Delete cell(s)
    CLEAR [range]            Clear all or range

  Range Operations:
    GET_RANGE <range>        Get range values as table
    FILL <range> <direction> Fill range (DOWN, RIGHT, UP, LEFT)

  Format Operations:
    FORMAT <cell> [options]  Format cell (bold=true, italic=true, etc.)
    FORMAT_RANGE <range>     Format range
    NUMBER_FORMAT <cell>     Set number format

  Merge Operations:
    MERGE <range>            Merge cells
    UNMERGE <range>          Unmerge cells
    GET_MERGE <cell>         Get merge info for cell

  Selection:
    SELECT <cell|range>      Select cell or range
    GET_SELECTION            Get current selection

  Find/Replace:
    FIND <query> [options]   Find text (caseSensitive=true, regex=true)
    REPLACE <old> <new>      Replace first match
    REPLACE_ALL <old> <new>  Replace all matches

  Sort/Filter:
    SORT <range> [options]   Sort range (col=0, order=asc)
    FILTER <range> [options] Apply filter
    CLEAR_FILTER <range>     Clear filter

  Validation:
    ADD_VALIDATION <range>   Add validation rule
    REMOVE_VALIDATION <id>   Remove validation rule
    VALIDATE <cell> <value>  Test value against rules

  History:
    UNDO                     Undo last operation
    REDO                     Redo last undone operation
    BEGIN_BATCH <desc>       Start batch operation
    END_BATCH                End batch operation

  Conditional Formatting:
    ADD_CF_RULE <range>      Add conditional format rule
    REMOVE_CF_RULE <id>      Remove conditional format rule
    EVAL_CF <cell> <value>   Evaluate CF for cell

  State Inspection:
    SNAPSHOT                 Full state snapshot
    DIFF                     Changes since last snapshot
    STATS                    Engine statistics
    DUMP <range>             Dump range as table

  Utility:
    ECHO <message>           Print message
    SLEEP <ms>               Sleep for milliseconds
    ASSERT <cell> <op> <val> Assert cell value (==, !=, <, >, etc.)
    ASSERT_ERROR             Expect next command to fail

  Control:
    RESET                    Reset engine state
    QUIT                     Exit harness

EXAMPLES:
  # Set cells and compute
  SET A1 100
  SET A2 200
  SET A3 =A1+A2
  GET A3

  # Format cells
  FORMAT A1 bold=true fontSize=14
  NUMBER_FORMAT A1 #,##0.00

  # Sort data
  SET A1 "Name"
  SET B1 "Score"
  SET A2 "Alice"
  SET B2 85
  SET A3 "Bob"
  SET B3 92
  SORT A1:B3 col=1 order=desc hasHeader=true

  # Assertions
  SET A1 100
  ASSERT A1 == 100
  ASSERT_ERROR
  SET A1 =INVALID()
`;

// =============================================================================
// Main Entry Point
// =============================================================================

async function main(): Promise<void> {
  const cliArgs = parseArgs(process.argv.slice(2));

  if (cliArgs.help) {
    console.log(HELP_TEXT);
    process.exit(0);
  }

  // Handle 'run' subcommand for regression testing
  if (cliArgs.subcommand === 'run') {
    await runRegressionTests(cliArgs);
    return;
  }

  // Default: REPL or piped mode
  const config: HarnessConfig = {
    ...DEFAULT_CONFIG,
    ...cliArgs.config,
  };

  const runner = createHarnessRunner(config);

  // Set up output handler
  runner.onOutput((output) => {
    console.log(formatOutput(output, config));
  });

  // Determine if interactive (TTY) or piped input
  const isInteractive = cliArgs.interactive || process.stdin.isTTY;

  if (isInteractive) {
    await runInteractive(runner, config);
  } else {
    await runPiped(runner, config);
  }
}

// =============================================================================
// Regression Test Runner
// =============================================================================

async function runRegressionTests(cliArgs: CLIArgs): Promise<void> {
  const patterns = cliArgs.subcommandArgs;

  if (patterns.length === 0) {
    console.error('Error: run command requires at least one file path or glob pattern');
    console.error('Usage: harness run <glob-or-path> [options]');
    console.error('Examples:');
    console.error('  harness run tests/basic.vsheet');
    console.error('  harness run "tests/*.vsheet"');
    console.error('  harness run tests/ --golden');
    process.exit(1);
  }

  // Build regression runner options
  const options: Partial<RegressionRunnerOptions> = {
    ...DEFAULT_REGRESSION_OPTIONS,
    ...cliArgs.runOptions,
    config: cliArgs.config,
  };

  const runner = createRegressionRunner(options);

  // Run tests
  let result;
  if (patterns.length === 1) {
    result = await runner.run(patterns[0]);
  } else {
    result = await runner.runMultiple(patterns);
  }

  // Exit with appropriate code
  process.exit(result.allPassed ? 0 : 1);
}

async function runInteractive(runner: HarnessRunner, config: HarnessConfig): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'vs> ',
  });

  if (config.verbose) {
    console.log('VectorSheet Headless Test Harness');
    console.log('Type "help" for commands, "quit" to exit.');
    console.log('');
  }

  rl.prompt();

  rl.on('line', async (line) => {
    const trimmed = line.trim();

    if (trimmed.toLowerCase() === 'help') {
      console.log(HELP_TEXT);
      rl.prompt();
      return;
    }

    try {
      const shouldContinue = await runner.executeLine(line);
      if (!shouldContinue) {
        rl.close();
        process.exit(0);
      }
    } catch (error) {
      // Error already output by runner
      if (config.stopOnError) {
        rl.close();
        process.exit(1);
      }
    }

    rl.prompt();
  });

  rl.on('close', () => {
    if (config.verbose) {
      console.log('\nGoodbye!');
    }
    process.exit(0);
  });
}

async function runPiped(runner: HarnessRunner, _config: HarnessConfig): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });

  const lines: string[] = [];

  // Collect all lines first
  for await (const line of rl) {
    lines.push(line);
  }

  // Execute script
  try {
    await runner.executeScript(lines.join('\n'));
    process.exit(0);
  } catch (error) {
    process.exit(1);
  }
}

// Run
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
