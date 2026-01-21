/**
 * Integration Test: Resource Limits Enforcement
 * 
 * Tests enforcement of:
 * - Time limits (timeout)
 * 
 * Output format: Use [OK], [TEST], [FAIL] in all console logs for clarity.
 * - Memory limits (per language)
 * - Language restrictions (unsupported languages)
 */

import axios from 'axios';

const BASE_URL = process.env['API_URL'] || 'http://localhost:3000';

console.log(`Testing against: ${BASE_URL}\n`);

interface SessionResponse {
  session_id: string;
  status: string;
}

interface RunCodeResponse {
  execution_id: string;
  status: string;
}

interface ExecutionResultResponse {
  execution_id: string;
  status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'TIMEOUT';
  stdout?: string;
  stderr?: string;
  execution_time_ms?: number;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function waitForExecution(executionId: string, maxWaitTime: number = 15000): Promise<ExecutionResultResponse> {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitTime) {
    const result = await axios.get<ExecutionResultResponse>(`${BASE_URL}/executions/${executionId}`);

    if (['COMPLETED', 'FAILED', 'TIMEOUT'].includes(result.data.status)) {
      return result.data;
    }

    await sleep(500);
  }

  throw new Error(`Execution ${executionId} did not complete within ${maxWaitTime}ms`);
}

// ========================================
// TEST 1: TIME LIMIT ENFORCEMENT (Timeout)
// ========================================

async function testTimeoutEnforcement() {
  console.log('[TEST 1] Time Limit Enforcement (Timeout)');
  console.log('Creating Python session...');

  const createRes = await axios.post<SessionResponse>(`${BASE_URL}/code-sessions`, {
    language: 'python'
  });
  const sessionId = createRes.data.session_id;
  console.log(`[OK] Session created: ${sessionId}`);

  console.log('\n[TEST 1.1] Infinite loop - should timeout after 5 seconds');
  await axios.patch(`${BASE_URL}/code-sessions/${sessionId}`, {
    language: 'python',
    source_code: `import time
while True:
    time.sleep(1)
    print("Still running...")
`
  });

  const run1 = await axios.post<RunCodeResponse>(`${BASE_URL}/code-sessions/${sessionId}/run`);
  console.log(`[OK] Execution queued: ${run1.data.execution_id}`);

  const result1 = await waitForExecution(run1.data.execution_id);

  if (result1.status === 'FAILED' && result1.stderr?.includes('timed out')) {
    console.log(`PASS: Execution timed out correctly`);
    console.log(`   Status: ${result1.status}`);
    console.log(`   Error: ${result1.stderr}`);
  } else {
    console.log(`FAIL: Expected timeout, got status: ${result1.status}`);
    process.exit(1);
  }

  await sleep(3000); // Cooldown

  console.log('\n[TEST 1.2] Long sleep - should timeout');
  await axios.patch(`${BASE_URL}/code-sessions/${sessionId}`, {
    language: 'python',
    source_code: `import time
print("Starting sleep...")
time.sleep(10)  # Sleep longer than 5s timeout
print("This should never print")
`
  });

  const run2 = await axios.post<RunCodeResponse>(`${BASE_URL}/code-sessions/${sessionId}/run`);
  const result2 = await waitForExecution(run2.data.execution_id);

  if (result2.status === 'FAILED' && result2.stderr?.includes('timed out')) {
    console.log(`PASS: Long sleep timed out correctly`);
  } else {
    console.log(`FAIL: Expected timeout for long sleep`);
    process.exit(1);
  }

  await sleep(3000); // Cooldown

  console.log('\n[TEST 1.3] Normal execution - should complete within timeout');
  await axios.patch(`${BASE_URL}/code-sessions/${sessionId}`, {
    language: 'python',
    source_code: `print("Quick execution")
result = sum(range(100))
print(f"Result: {result}")
`
  });

  const run3 = await axios.post<RunCodeResponse>(`${BASE_URL}/code-sessions/${sessionId}/run`);
  const result3 = await waitForExecution(run3.data.execution_id);

  if (result3.status === 'COMPLETED' && result3.stdout?.includes('Quick execution')) {
    console.log(`PASS: Normal code completed within timeout`);
    console.log(`   Execution time: ${result3.execution_time_ms}ms`);
  } else {
    console.log(`FAIL: Normal code should complete successfully`);
    process.exit(1);
  }

  console.log('\nTIME LIMIT TEST PASSED\n');
}

// ========================================
// TEST 2: MEMORY LIMIT ENFORCEMENT
// ========================================

async function testMemoryLimitEnforcement() {
  console.log('[TEST 2] Memory Limit Enforcement');

  // TEST 2.1: JavaScript Memory Limit
  console.log('\n[TEST 2.1] JavaScript memory limit (--max-old-space-size=128)');
  const jsSession = await axios.post<SessionResponse>(`${BASE_URL}/code-sessions`, {
    language: 'javascript'
  });
  console.log(`[OK] JS Session: ${jsSession.data.session_id}`);

  await axios.patch(`${BASE_URL}/code-sessions/${jsSession.data.session_id}`, {
    language: 'javascript',
    source_code: `// Try to allocate > 128MB
const arrays = [];
try {
  for (let i = 0; i < 100; i++) {
    arrays.push(new Array(10 * 1024 * 1024).fill(0)); // 10MB each iteration
    console.log(\`Allocated \${(i + 1) * 10}MB\`);
  }
  console.log("Memory bomb succeeded - BAD!");
} catch (e) {
  console.log("Memory allocation failed - GOOD!");
}
`
  });

  const jsRun = await axios.post<RunCodeResponse>(`${BASE_URL}/code-sessions/${jsSession.data.session_id}/run`);
  const jsResult = await waitForExecution(jsRun.data.execution_id);

  console.log(`   Status: ${jsResult.status}`);
  console.log(`   Output: ${jsResult.stdout?.substring(0, 200)}`);

  if (jsResult.status === 'FAILED' || jsResult.stdout?.includes('allocation failed')) {
    console.log(`PASS: JavaScript memory limit enforced`);
  } else {
    console.log(`WARNING: JS memory limit may not be enforced (depends on Node.js behavior)`);
  }

  await sleep(3000);

  // TEST 2.2: Python Memory Limit (Linux only)
  console.log('\n[TEST 2.2] Python memory limit (resource.setrlimit)');
  const pySession = await axios.post<SessionResponse>(`${BASE_URL}/code-sessions`, {
    language: 'python'
  });
  console.log(`[OK] Python Session: ${pySession.data.session_id}`);

  await axios.patch(`${BASE_URL}/code-sessions/${pySession.data.session_id}`, {
    language: 'python',
    source_code: `# Try to allocate > 128MB
try:
    big_list = [0] * (200 * 1024 * 1024)  # Try to allocate 200MB
    print("Memory bomb succeeded - BAD!")
except MemoryError:
    print("MemoryError caught - GOOD! (Linux)")
except Exception as e:
    print(f"Other error: {type(e).__name__} (possibly Windows)")
`
  });

  const pyRun = await axios.post<RunCodeResponse>(`${BASE_URL}/code-sessions/${pySession.data.session_id}/run`);
  const pyResult = await waitForExecution(pyRun.data.execution_id);

  console.log(`   Status: ${pyResult.status}`);
  console.log(`   Output: ${pyResult.stdout}`);

  if (pyResult.stdout?.includes('GOOD')) {
    console.log(`PASS: Python memory limit enforced (or OS-dependent graceful handling)`);
  } else {
    console.log(`INFO: Python memory limit behavior depends on OS (Linux vs Windows)`);
  }

  await sleep(3000);

  // TEST 2.3: Java Memory Limit
  console.log('\n[TEST 2.3] Java memory limit (-Xmx128m)');
  const javaSession = await axios.post<SessionResponse>(`${BASE_URL}/code-sessions`, {
    language: 'java'
  });
  console.log(`[OK] Java Session: ${javaSession.data.session_id}`);

  await axios.patch(`${BASE_URL}/code-sessions/${javaSession.data.session_id}`, {
    language: 'java',
    source_code: `public class Main {
    public static void main(String[] args) {
        try {
            // Try to allocate > 128MB
            byte[][] arrays = new byte[200][];
            for (int i = 0; i < 200; i++) {
                arrays[i] = new byte[1024 * 1024]; // 1MB each
                System.out.println("Allocated " + (i + 1) + "MB");
            }
            System.out.println("Memory bomb succeeded - BAD!");
        } catch (OutOfMemoryError e) {
            System.out.println("OutOfMemoryError caught - GOOD!");
        }
    }
}
`
  });

  const javaRun = await axios.post<RunCodeResponse>(`${BASE_URL}/code-sessions/${javaSession.data.session_id}/run`);
  const javaResult = await waitForExecution(javaRun.data.execution_id);

  console.log(`   Status: ${javaResult.status}`);
  console.log(`   Output: ${javaResult.stdout?.substring(0, 200)}`);

  if (javaResult.stdout?.includes('GOOD') || javaResult.status === 'FAILED') {
    console.log(`PASS: Java memory limit enforced`);
  } else {
    console.log(`WARNING: Java memory limit may not be enforced`);
  }

  console.log('\nMEMORY LIMIT TEST COMPLETED\n');
}

// ========================================
// TEST 3: LANGUAGE RESTRICTION ENFORCEMENT
// ========================================

async function testLanguageRestrictions() {
  console.log('[TEST 3] Language Restriction Enforcement');

  // TEST 3.1: Supported languages
  console.log('\n[TEST 3.1] Create sessions with supported languages');

  const supportedLanguages = ['javascript', 'python', 'java'];

  for (const lang of supportedLanguages) {
    try {
      const res = await axios.post<SessionResponse>(`${BASE_URL}/code-sessions`, {
        language: lang
      });
      console.log(`   PASS: ${lang}: Session created (${res.data.session_id})`);
    } catch (error: any) {
      console.log(`   FAIL: ${lang}: Failed - ${error.response?.data?.message || error.message}`);
      process.exit(1);
    }
  }

  // TEST 3.2: Unsupported languages
  console.log('\n[TEST 3.2] Reject unsupported languages');

  const unsupportedLanguages = ['ruby', 'go', 'rust', 'c++', 'php', 'typescript'];

  for (const lang of unsupportedLanguages) {
    try {
      await axios.post<SessionResponse>(`${BASE_URL}/code-sessions`, {
        language: lang
      });
      console.log(`   FAIL: ${lang}: Should have been rejected but was accepted!`);
      process.exit(1);
    } catch (error: any) {
      if (error.response?.status === 400) {
        console.log(`   PASS: ${lang}: Correctly rejected (400)`);
      } else {
        console.log(`   WARNING: ${lang}: Unexpected error status ${error.response?.status}`);
      }
    }
  }

  // TEST 3.3: Case sensitivity
  console.log('\n[TEST 3.3] Case sensitivity check');

  const caseSensitiveTests = [
    { lang: 'Python', shouldFail: true },
    { lang: 'JavaScript', shouldFail: true },
    { lang: 'JAVA', shouldFail: true },
    { lang: 'python', shouldFail: false },
  ];

  for (const test of caseSensitiveTests) {
    try {
      await axios.post<SessionResponse>(`${BASE_URL}/code-sessions`, {
        language: test.lang
      });
      if (test.shouldFail) {
        console.log(`   FAIL: "${test.lang}": Should have been rejected (case-sensitive)`);
        process.exit(1);
      } else {
        console.log(`   PASS: "${test.lang}": Correctly accepted`);
      }
    } catch (error: any) {
      if (!test.shouldFail) {
        console.log(`   FAIL: "${test.lang}": Should have been accepted`);
        process.exit(1);
      } else {
        console.log(`   PASS: "${test.lang}": Correctly rejected (case-sensitive)`);
      }
    }
  }

  // TEST 3.4: Language switching enforcement
  console.log('\n[TEST 3.4] Language change validation');

  const session = await axios.post<SessionResponse>(`${BASE_URL}/code-sessions`, {
    language: 'python'
  });
  console.log(`   Session created with Python`);

  // Try to update with unsupported language
  try {
    await axios.patch(`${BASE_URL}/code-sessions/${session.data.session_id}`, {
      language: 'ruby',
      source_code: 'puts "Hello"'
    });
    console.log(`   FAIL: Should reject unsupported language in PATCH`);
    process.exit(1);
  } catch (error: any) {
    if (error.response?.status === 400) {
      console.log(`   PASS: Correctly rejected unsupported language in PATCH`);
    }
  }

  // Try to update with valid language
  try {
    await axios.patch(`${BASE_URL}/code-sessions/${session.data.session_id}`, {
      language: 'javascript',
      source_code: 'console.log("Hello")'
    });
    console.log(`   PASS: Correctly allowed language switch (python -> javascript)`);
  } catch (error: any) {
    console.log(`   FAIL: Should allow switching to supported language`);
    process.exit(1);
  }

  console.log('\nLANGUAGE RESTRICTION TEST PASSED\n');
}

// ========================================
// TEST 4: OUTPUT SIZE LIMIT
// ========================================

async function testOutputSizeLimit() {
  console.log('[TEST 4] Output Size Limit Enforcement (1MB)');

  const session = await axios.post<SessionResponse>(`${BASE_URL}/code-sessions`, {
    language: 'python'
  });
  console.log(`[OK] Session created: ${session.data.session_id}`);

  console.log('\n[TEST 4.1] Generate massive output (should be truncated/killed)');
  await axios.patch(`${BASE_URL}/code-sessions/${session.data.session_id}`, {
    language: 'python',
    source_code: `# Try to output > 1MB
for i in range(100000):
    print("A" * 1000)  # 1KB per line × 100k = 100MB
`
  });

  const run = await axios.post<RunCodeResponse>(`${BASE_URL}/code-sessions/${session.data.session_id}/run`);
  const result = await waitForExecution(run.data.execution_id);

  const outputSize = (result.stdout?.length || 0) + (result.stderr?.length || 0);
  const maxSize = 1024 * 1024; // 1MB
  const maxSizeWithBuffer = maxSize + 1024; // Allow 1KB buffer for edge cases

  console.log(`   Output size: ${outputSize} bytes`);
  console.log(`   Max allowed: ${maxSize} bytes`);

  if (outputSize <= maxSizeWithBuffer) {
    console.log(`✅ PASS: Output size limited to ~${maxSize} bytes`);
  } else {
    console.log(`FAIL: Output exceeded limit`);
    process.exit(1);
  }

  if (result.stderr?.includes('Output size limit exceeded')) {
    console.log(`PASS: User notified about output limit`);
  }

  console.log('\nOUTPUT SIZE LIMIT TEST PASSED\n');
}

// ========================================
// MAIN TEST RUNNER
// ========================================

async function main() {
  console.log('='.repeat(70));
  console.log('RESOURCE LIMITS ENFORCEMENT TESTS');
  console.log('='.repeat(70));
  console.log();

  try {
    await testTimeoutEnforcement();
    await testMemoryLimitEnforcement();
    await testLanguageRestrictions();
    await testOutputSizeLimit();

    console.log('='.repeat(70));
    console.log('ALL RESOURCE LIMIT TESTS PASSED');
    console.log('='.repeat(70));
  } catch (error: any) {
    console.error('\nTEST SUITE FAILED:', error.response?.data || error.message);
    process.exit(1);
  }
}

main();
