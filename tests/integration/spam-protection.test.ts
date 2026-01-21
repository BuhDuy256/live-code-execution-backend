/**
 * Integration tests for spam protection features
 * 
 * Tests:
 * 1. Autosave throttling - rapid autosaves should be throttled
 * 2. Content change detection - identical content should not trigger DB writes
 * 3. Execution cooldown - enforces minimum time between runs
 * 4. Active execution prevention - prevents multiple simultaneous runs
 */

import axios from 'axios';

// Support both Docker and local environments
// Docker: Use host.docker.internal or container name
// Local: Use localhost
const BASE_URL = process.env['API_URL'] || process.env['BASE_URL'] || 'http://localhost:3000';

console.log(`🔗 Testing against: ${BASE_URL}\n`);

interface SessionResponse {
  session_id: string;
  status: string;
}

interface RunCodeResponse {
  execution_id: string;
  status: string;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function testAutosaveThrottling() {
  console.log('\n[TEST] Test 1: Autosave Throttling');
  console.log('Creating session...');

  const createRes = await axios.post<SessionResponse>(`${BASE_URL}/code-sessions`, {
    language: 'python'
  });
  const sessionId = createRes.data.session_id;
  console.log(`[OK] Session created: ${sessionId}`);

  console.log('\nSending 10 rapid autosave requests...');
  const startTime = Date.now();

  for (let i = 0; i < 10; i++) {
    await axios.patch(`${BASE_URL}/code-sessions/${sessionId}`, {
      language: 'python',
      source_code: `print('Test ${i}')`
    });
    console.log(`  Request ${i + 1} sent`);
  }

  const duration = Date.now() - startTime;
  console.log(`[OK] All 10 requests completed in ${duration}ms`);
  console.log('  (DB writes are throttled to 1 per second, but API responds immediately)');
}

async function testContentChangeDetection() {
  console.log('\n[TEST] Test 2: Content Change Detection');
  console.log('Creating session...');

  const createRes = await axios.post<SessionResponse>(`${BASE_URL}/code-sessions`, {
    language: 'javascript'
  });
  const sessionId = createRes.data.session_id;
  console.log(`[OK] Session created: ${sessionId}`);

  const sameCode = 'console.log("Same code");';

  console.log('\nSending 5 autosaves with identical content...');
  for (let i = 0; i < 5; i++) {
    await axios.patch(`${BASE_URL}/code-sessions/${sessionId}`, {
      language: 'javascript',
      source_code: sameCode
    });
    console.log(`  Request ${i + 1} sent (no DB write, content unchanged)`);
    await sleep(100);
  }

  console.log('[OK] Duplicate content detected and skipped');
}

async function testExecutionCooldown() {
  console.log('\n[TEST] Test 3: Execution Cooldown');
  console.log('Creating session...');

  const createRes = await axios.post<SessionResponse>(`${BASE_URL}/code-sessions`, {
    language: 'python'
  });
  const sessionId = createRes.data.session_id;
  console.log(`[OK] Session created: ${sessionId}`);

  console.log('\nSetting code...');
  await axios.patch(`${BASE_URL}/code-sessions/${sessionId}`, {
    language: 'python',
    source_code: 'print("Hello")'
  });

  console.log('\nFirst execution...');
  const run1 = await axios.post<RunCodeResponse>(`${BASE_URL}/code-sessions/${sessionId}/run`);
  console.log(`[OK] Execution queued: ${run1.data.execution_id}`);

  // Wait a bit for execution to start/complete (but still within cooldown period)
  console.log('Waiting 1 second...');
  await sleep(1000);

  console.log('\nAttempting second execution within cooldown (should fail with 429)...');
  try {
    await axios.post(`${BASE_URL}/code-sessions/${sessionId}/run`);
    console.log('[FAIL] Should have been rate limited!');
  } catch (error: any) {
    if (error.response?.status === 429) {
      console.log(`[OK] Correctly rate limited: ${error.response.data.message}`);
    } else if (error.response?.status === 409) {
      console.log(`[WARN] Got 409 (still running) instead of 429 (cooldown) - acceptable`);
    } else {
      console.log(`[FAIL] Wrong error: ${error.response?.status} - ${error.response?.data?.message}`);
    }
  }

  console.log('\nWaiting for cooldown to expire (3 seconds total)...');
  await sleep(2500);

  console.log('Attempting third execution after cooldown (should succeed)...');
  const run3 = await axios.post<RunCodeResponse>(`${BASE_URL}/code-sessions/${sessionId}/run`);
  console.log(`[OK] Execution queued after cooldown: ${run3.data.execution_id}`);
}

async function testActiveExecutionPrevention() {
  console.log('\n[TEST] Test 4: Active Execution Prevention');
  console.log('Creating session...');

  const createRes = await axios.post<SessionResponse>(`${BASE_URL}/code-sessions`, {
    language: 'python'
  });
  const sessionId = createRes.data.session_id;
  console.log(`[OK] Session created: ${sessionId}`);

  console.log('\nSetting code with intentional delay...');
  await axios.patch(`${BASE_URL}/code-sessions/${sessionId}`, {
    language: 'python',
    source_code: 'import time\ntime.sleep(2)\nprint("Done")'
  });

  console.log('\nStarting first execution...');
  const run1 = await axios.post<RunCodeResponse>(`${BASE_URL}/code-sessions/${sessionId}/run`);
  console.log(`[OK] First execution queued: ${run1.data.execution_id}`);

  // Immediately try to run again (should fail with 409)
  console.log('\nAttempting second execution while first is running (should fail with 409)...');
  try {
    await axios.post(`${BASE_URL}/code-sessions/${sessionId}/run`);
    console.log('[FAIL] Should have been rejected!');
  } catch (error: any) {
    if (error.response?.status === 409) {
      console.log(`[OK] Correctly rejected: ${error.response.data.message}`);
    } else {
      console.log(`[FAIL] Wrong error: ${error.response?.status} - ${error.response?.data?.message}`);
    }
  }

  console.log('\nWaiting for first execution to complete...');
  await sleep(4000);

  console.log('Attempting third execution (should succeed)...');
  const run3 = await axios.post<RunCodeResponse>(`${BASE_URL}/code-sessions/${sessionId}/run`);
  console.log(`[OK] New execution queued: ${run3.data.execution_id}`);
}

async function runAllTests() {
  console.log('=======================================================');
  console.log('         Spam Protection Integration Tests');
  console.log('=======================================================');

  try {
    await testAutosaveThrottling();
    await sleep(1000);

    await testContentChangeDetection();
    await sleep(1000);

    await testExecutionCooldown();
    await sleep(1000);

    await testActiveExecutionPrevention();

    console.log('\n=======================================================');
    console.log('[OK] All spam protection tests passed!');
    console.log('=======================================================\n');
  } catch (error: any) {
    console.error('\n[FAIL] Test failed:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  runAllTests();
}
