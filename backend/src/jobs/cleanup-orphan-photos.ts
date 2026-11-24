import { connectDatabase, disconnectDatabase } from '../lib/mongo.js';
import { cleanupOrphanPhotos } from '../services/photos.js';

try {
  await connectDatabase();
  const deleted = await cleanupOrphanPhotos();
  process.stdout.write(`Cleaned ${deleted} orphan photo asset(s).\n`);
  await disconnectDatabase();
} catch {
  process.stderr.write('Orphan photo cleanup failed.\n');
  await disconnectDatabase().catch(() => undefined);
  process.exitCode = 1;
}
