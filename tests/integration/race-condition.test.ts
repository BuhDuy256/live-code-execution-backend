/**
 * Test: Unique index prevents race conditions
 * 
 * Verifies that the database-level unique constraint prevents
 * multiple QUEUED/RUNNING executions for the same session
 */

import axios from 'axios';

const BASE_URL = process.env['API_URL'] || 'http://localhost:3000';

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

async function testRaceConditionPrevention() {
  console.log('[TEST] Race Condition Prevention via Unique Index');
  console.log('Creating session...');

  const createRes = await axios.post<SessionResponse>(`${BASE_URL}/code-sessions`, {
    language: 'python'
  });
  const sessionId = createRes.data.session_id;
  console.log(`[OK] Session created: ${sessionId}`);

  console.log('\nSetting code...');
  await axios.patch(`${BASE_URL}/code-sessions/${sessionId}`, {
    language: 'python',
    source_code: 'print("Testing race condition")'
  });

  console.log('\nSimulating race condition: sending 2 concurrent execution requests...');

  // Send two requests simultaneously (no await)
  const request1Promise = axios.post<RunCodeResponse>(`${BASE_URL}/code-sessions/${sessionId}/run`);
  const request2Promise = axios.post<RunCodeResponse>(`${BASE_URL}/code-sessions/${sessionId}/run`);

  const results = await Promise.allSettled([request1Promise, request2Promise]);

  let successCount = 0;
  let conflictCount = 0;

  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      successCount++;
      console.log(`  Request ${index + 1}: ✅ SUCCESS (execution_id: ${result.value.data.execution_id})`);
    } else {
      if (result.reason.response?.status === 409) {
        conflictCount++;
        console.log(`  Request ${index + 1}: ✅ CONFLICT (409) - Correctly rejected by unique index`);
      } else {
        console.log(`  Request ${index + 1}: ❌ UNEXPECTED ERROR (${result.reason.response?.status})`);
      }
    }
  });

  console.log('\n[RESULTS]');
  console.log(`  Successful executions: ${successCount}`);
  console.log(`  Rejected by unique index: ${conflictCount}`);

  if (successCount === 1 && conflictCount === 1) {
    console.log('\n✅ TEST PASSED: Unique index prevented duplicate execution');
    console.log('   Database-level constraint working correctly!');
  } else {
    console.log('\n❌ TEST FAILED: Expected 1 success and 1 conflict');
    console.log(`   Got: ${successCount} success, ${conflictCount} conflict`);
    process.exit(1);
  }

  // Wait for execution to complete before next test
  await sleep(6000);
}

async function testUniqueIndexOnlyAppliesToActiveStatus() {
  console.log('\n[TEST] Unique Index Only Applies to QUEUED/RUNNING Status');
  console.log('Creating session...');

  const createRes = await axios.post<SessionResponse>(`${BASE_URL}/code-sessions`, {
    language: 'javascript'
  });
  const sessionId = createRes.data.session_id;
  console.log(`[OK] Session created: ${sessionId}`);

  console.log('\nSetting code...');
  await axios.patch(`${BASE_URL}/code-sessions/${sessionId}`, {
    language: 'javascript',
    source_code: 'console.log("Test 1");'
  });

  console.log('\nFirst execution...');
  const run1 = await axios.post<RunCodeResponse>(`${BASE_URL}/code-sessions/${sessionId}/run`);
  console.log(`[OK] First execution queued: ${run1.data.execution_id}`);

  // Wait for execution to complete (status becomes COMPLETED)
  console.log('Waiting for execution to complete...');
  await sleep(6000);

  console.log('\nSecond execution (should succeed since first is COMPLETED)...');
  try {
    const run2 = await axios.post<RunCodeResponse>(`${BASE_URL}/code-sessions/${sessionId}/run`);
    console.log(`[OK] Second execution queued: ${run2.data.execution_id}`);
    console.log('\n✅ TEST PASSED: Unique index only blocks QUEUED/RUNNING, allows new execution after COMPLETED');
  } catch (error: any) {
    if (error.response?.status === 409) {
      console.log('\n❌ TEST FAILED: Unique index blocking even after first execution completed');
      console.log('   This means the WHERE clause is not working correctly');
      process.exit(1);
    } else {
      throw error;
    }
  }
}

async function main() {
  try {
    await testRaceConditionPrevention();
    await testUniqueIndexOnlyAppliesToActiveStatus();

    console.log('\n' + '='.repeat(60));
    console.log('✅ ALL TESTS PASSED');
    console.log('='.repeat(60));
  } catch (error: any) {
    console.error('\n❌ TEST ERROR:', error.response?.data || error.message);
    process.exit(1);
  }
}

main();
