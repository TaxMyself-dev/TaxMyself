const fs = require('fs');
const path = require('path');

/** Strips ANSI color codes from a string */
function stripAnsi(str) {
  return str.replace(/\x1B\[[0-9;]*[mGKHFJ]/g, '');
}

class CleanReporter {
  constructor() {
    this._lines = [];
    const now = new Date();
    const date = now.toISOString().slice(0, 10);
    const time = now.toTimeString().slice(0, 5).replace(':', '-');
    this._logPath = path.join('test', `results_${date}_${time}.txt`);
    this._lines.push(`E2E Test Run — ${now.toLocaleString('he-IL')}`);
    this._lines.push('='.repeat(60));
  }

  onTestResult(test, testResult) {
    const suiteName = path.basename(test.path);
    this._lines.push(`\nSUITE: ${suiteName}`);
    this._lines.push('-'.repeat(50));

    if (testResult.testExecError) {
      this._lines.push(`  [ERROR] Suite failed to run:`);
      this._lines.push(`  ${stripAnsi(testResult.testExecError.message)}`);
      return;
    }

    // Print ALL console output when a suite has failures
    const hasFailed = testResult.testResults.some(r => r.status === 'failed');
    if (hasFailed && testResult.console && testResult.console.length > 0) {
      this._lines.push('  --- server logs ---');
      testResult.console.forEach(c => {
        const msg = stripAnsi(c.message).trim();
        if (msg) this._lines.push(`  [${c.type}] ${msg}`);
      });
      this._lines.push('  ---');
    }

    testResult.testResults.forEach(result => {
      const icon = result.status === 'passed' ? '✓' : result.status === 'failed' ? '✗' : '-';
      const status = result.status.toUpperCase();
      this._lines.push(`  ${icon} [${status}] ${result.fullName}`);

      if (result.status === 'failed') {
        result.failureMessages.forEach(msg => {
          const clean = stripAnsi(msg);
          const relevant = clean
            .split('\n')
            .filter(l => l.trim() && !l.includes('node_modules') && !l.includes('    at '))
            .slice(0, 6);
          relevant.forEach(l => this._lines.push(`       ${l.trim()}`));
        });
      }
    });
  }

  onRunComplete(_contexts, results) {
    this._lines.push(`\n${'='.repeat(60)}`);
    this._lines.push(`Suites : ${results.numFailedTestSuites} failed, ${results.numPassedTestSuites} passed, ${results.numTotalTestSuites} total`);
    this._lines.push(`Tests  : ${results.numFailedTests} failed, ${results.numPassedTests} passed, ${results.numTotalTests} total`);

    fs.writeFileSync(this._logPath, this._lines.join('\n'), 'utf8');
    // Signal the log path to the PS wrapper script
    process.stderr.write(`__LOG_PATH__:${this._logPath}\n`);
  }
}

module.exports = CleanReporter;
