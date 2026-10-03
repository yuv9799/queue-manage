import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Test that the auth module throws when JWT_SECRET is absent or too short.
// We test this in a subprocess so the current test process already has a valid JWT_SECRET.
function runAuthSubprocess(envExtra) {
  return new Promise((resolve) => {
    // If JWT_SECRET is not being explicitly set by the test, remove it
    // from the inherited env so we can test the "absent" case.
    const env = { ...process.env };
    if (!('JWT_SECRET' in envExtra)) {
      delete env.JWT_SECRET;
    }
    Object.assign(env, envExtra);
    const child = spawn(process.execPath, [path.join(__dirname, '..', 'middleware', 'auth.js')], {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('close', (code) => resolve({ code, stderr }));
  });
}

test('auth.js throws when JWT_SECRET is not set', async () => {
  const result = await runAuthSubprocess({});
  assert.notStrictEqual(result.code, 0, 'process should exit non-zero');
  assert.match(
    result.stderr,
    /JWT_SECRET must be set to a long random value/i,
    'stderr should mention JWT_SECRET requirement'
  );
});

test('auth.js throws when JWT_SECRET is too short', async () => {
  const result = await runAuthSubprocess({ JWT_SECRET: 'too-short' });
  assert.notStrictEqual(result.code, 0, 'process should exit non-zero');
  assert.match(
    result.stderr,
    /JWT_SECRET must be set to a long random value/i,
    'stderr should mention JWT_SECRET requirement'
  );
});

test('auth.js loads when JWT_SECRET is >= 32 characters', async () => {
  const result = await runAuthSubprocess({ JWT_SECRET: 'a'.repeat(32) });
  assert.strictEqual(result.code, 0, `auth.js should load without error: ${result.stderr}`);
});
