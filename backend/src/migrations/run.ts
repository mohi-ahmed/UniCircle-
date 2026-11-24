import { disconnectDatabase } from '../lib/mongo.js';
import { runPhaseOneMigration } from './phase-1.js';

async function main(): Promise<void> {
  try {
    await runPhaseOneMigration();
    process.stdout.write('Phase 1 migration completed.\n');
  } catch (error) {
    process.stderr.write(`Phase 1 migration failed: ${error instanceof Error ? error.message : 'unknown error'}\n`);
    process.exitCode = 1;
  } finally {
    await disconnectDatabase();
  }
}

void main();
