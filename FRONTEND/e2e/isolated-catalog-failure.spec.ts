import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { execFileSync } from 'node:child_process';
import { test, expect } from '@playwright/test';
import {
  startIsolatedCatalogStack,
  mintE2EJWT,
  psql,
  databaseExists,
} from './isolated-catalog-stack';

/**
 * All residue checks here are BASELINE DIFFS, not absolute-zero assertions.
 * A concurrently-running isolated test (this file with `--workers` > 1, a
 * developer running another spec locally, CI parallelism) can have its own
 * legitimate disposable database, port file, and e2e_tickets_service.exe
 * process in flight — asserting "zero databases/processes/port files exist
 * anywhere on the system" would fail on THEIR resources, not a leak from
 * this test. Snapshotting before and asserting "no NEW entries after" is
 * what actually proves this test's own cleanup worked, without claiming
 * ownership of what it didn't create.
 */

function snapshotEphemeralDatabases(): string[] {
  const out = execFileSync(
    'docker',
    ['exec', '-i', 'backend-postgres-1', 'psql', '-U', 'sigdesk', '-d', 'postgres', '-t', '-A', '-c',
      "SELECT datname FROM pg_database WHERE datname LIKE 'sigdesk_tickets_e2e_%';"],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  )
    .toString()
    .trim();
  if (!out) return [];
  return out.split(/\r?\n/).filter(Boolean);
}

function snapshotPortFiles(): string[] {
  return fs.readdirSync(os.tmpdir()).filter((f) => f.startsWith('sigdesk_e2e_port_'));
}

/** PIDs, not merely "is any instance of this image running" — the latter
 *  would flag a concurrent test's own, entirely healthy process as this
 *  test's residue. */
function snapshotE2EProcessPids(): string[] {
  try {
    const out = execFileSync(
      'tasklist',
      ['/FI', 'IMAGENAME eq e2e_tickets_service.exe', '/FO', 'CSV', '/NH'],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    )
      .toString()
      .trim();
    if (!out || out.toLowerCase().includes('no tasks')) return [];
    return out
      .split(/\r?\n/)
      .map((line) => {
        // CSV columns: "Image Name","PID","Session Name","Session#","Mem Usage"
        const cols = line.split('","').map((c) => c.replace(/^"|"$/g, ''));
        return cols[1] ?? '';
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

type ResidueSnapshot = {
  databases: string[];
  portFiles: string[];
  pids: string[];
};

function snapshotResidue(): ResidueSnapshot {
  return {
    databases: snapshotEphemeralDatabases(),
    portFiles: snapshotPortFiles(),
    pids: snapshotE2EProcessPids(),
  };
}

/** Asserts this test introduced no residue it didn't clean up — tolerant
 *  of whatever concurrent, unrelated E2E resources already existed in
 *  `before`. */
function assertNoNewResidue(before: ResidueSnapshot): void {
  const after = snapshotResidue();
  const newDatabases = after.databases.filter((d) => !before.databases.includes(d));
  const newPortFiles = after.portFiles.filter((f) => !before.portFiles.includes(f));
  const newPids = after.pids.filter((p) => !before.pids.includes(p));
  expect(newDatabases, `New disposable databases left behind: ${newDatabases.join(', ') || '(none listed)'}`).toEqual([]);
  expect(newPortFiles, `New port files left behind: ${newPortFiles.join(', ') || '(none listed)'}`).toEqual([]);
  expect(newPids, `New e2e_tickets_service.exe PIDs left behind: ${newPids.join(', ') || '(none listed)'}`).toEqual([]);
}

test.describe('Isolated Catalog Stack Resilience & Cleanup', () => {
  test('cleans up all resources when failure occurs after database creation', async () => {
    const before = snapshotResidue();
    let thrown = false;
    try {
      await startIsolatedCatalogStack({ failAfterDatabaseCreation: true });
    } catch (err: unknown) {
      thrown = true;
      expect((err as Error).message).toContain('Simulated failure after database creation');
    }
    expect(thrown).toBe(true);
    assertNoNewResidue(before);
  });

  test('cleans up all resources when failure occurs during seed', async () => {
    const before = snapshotResidue();
    let thrown = false;
    try {
      await startIsolatedCatalogStack({ failDuringSeed: true });
    } catch (err: unknown) {
      thrown = true;
      expect((err as Error).message).toContain('Simulated failure during seed');
    }
    expect(thrown).toBe(true);
    assertNoNewResidue(before);
  });

  test('cleans up all resources when failure occurs during readiness (pre-loop throw)', async () => {
    const before = snapshotResidue();
    let thrown = false;
    try {
      await startIsolatedCatalogStack({ failDuringReadiness: true });
    } catch (err: unknown) {
      thrown = true;
      expect((err as Error).message).toContain('Simulated failure during readiness');
    }
    expect(thrown).toBe(true);
    assertNoNewResidue(before);
  });

  // The test above throws BEFORE the readiness poll loop is ever entered —
  // it proves cleanup works at that phase boundary, but it never actually
  // exercises the polling/timeout code itself. This one does: it redirects
  // the poll at a path that can never return 200, so the real loop runs to
  // its real deadline and throws the real "did not become ready" error.
  // `readinessTimeoutMs` keeps that deadline short so the test stays fast.
  test('cleans up all resources on a real readiness timeout (not just a pre-loop throw)', async () => {
    const before = snapshotResidue();
    let thrown = false;
    try {
      await startIsolatedCatalogStack({ forceReadinessTimeout: true, readinessTimeoutMs: 1500 });
    } catch (err: unknown) {
      thrown = true;
      expect((err as Error).message).toMatch(/did not become ready.*within 1500ms/);
    }
    expect(thrown).toBe(true);
    assertNoNewResidue(before);
  });

  test('authenticates and functions with a non-default JWT secret', async () => {
    const before = snapshotResidue();
    const customSecret = 'custom-super-secret-key-that-is-at-least-32-chars-long!';
    const stack = await startIsolatedCatalogStack({ jwtSecret: customSecret });
    try {
      expect(stack.port).toBeGreaterThan(0);
      const res = await stack.isolatedRequest.get('/sla/policies');
      expect(res.status()).toBe(200);

      // Verify that request with wrong secret is rejected with 401
      const wrongToken = mintE2EJWT(
        'wrong-fallback-secret-at-least-32-chars-long!',
        '00000000-0000-0000-0000-000000000003',
      );
      const unauthorizedRes = await fetch(`${stack.baseUrl}/sla/policies`, {
        headers: { Authorization: `Bearer ${wrongToken}` },
      });
      expect(unauthorizedRes.status).toBe(401);
    } finally {
      await stack.cleanup();
    }
    assertNoNewResidue(before);
  });

  // The sensitivity test the lease fail-closed rewrite exists to satisfy:
  // a mismatched lease must make cleanup() reject and leave the database
  // standing, and cleanup() must be a real retry once the correct lease is
  // back — not a one-shot that already lost track of what it owned.
  test('rejects cleanup on a lease mismatch, leaves the database intact, and drops only that exact database once the correct lease is restored', async () => {
    const stack = await startIsolatedCatalogStack();
    const { dbName, runToken } = stack;

    const foreignToken = crypto.randomUUID();
    psql(dbName, `UPDATE _e2e_lease SET run_token = :'foreign' WHERE run_token = :'expected';`, {
      foreign: foreignToken,
      expected: runToken,
    });
    expect(databaseExists(dbName)).toBe(true);

    await expect(stack.cleanup()).rejects.toThrow(/lease mismatch/);
    // Rejected — the database must still be exactly where it was.
    expect(databaseExists(dbName)).toBe(true);

    // Restore the correct lease and retry: this is the exact scenario the
    // fail-closed design exists to make possible — a rejected cleanup()
    // isn't a dead end, it's a retryable state.
    psql(dbName, `UPDATE _e2e_lease SET run_token = :'restored' WHERE run_token = :'foreign';`, {
      restored: runToken,
      foreign: foreignToken,
    });

    const otherDatabasesBefore = snapshotEphemeralDatabases().filter((d) => d !== dbName);
    await stack.cleanup();
    expect(databaseExists(dbName)).toBe(false);
    // And ONLY this database — nothing else disposable was touched.
    expect(snapshotEphemeralDatabases()).toEqual(otherDatabasesBefore);
  });
});
