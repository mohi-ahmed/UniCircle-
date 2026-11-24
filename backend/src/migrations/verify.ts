import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../lib/mongo.js';

async function main(): Promise<void> {
  try {
    await connectDatabase();
    const database = mongoose.connection.db;
    if (!database) throw new Error('MongoDB connection is not ready.');

    const [hello, collections, categoryCount, domainCount, settingsCount, requestIndexes] = await Promise.all([
      database.admin().command({ hello: 1 }),
      database.listCollections({}, { nameOnly: true }).toArray(),
      database.collection('categories').countDocuments(),
      database.collection('approvedEmailDomains').countDocuments({ domain: 'seu.edu.bd', isActive: true }),
      database.collection<{ _id: string }>('universitySettings').countDocuments({
        _id: 'primary', universityName: 'Southeast University', campusTimeZone: 'Asia/Dhaka',
      }),
      database.collection('requests').listIndexes().toArray(),
    ]);

    process.stdout.write(`${JSON.stringify({
      replicaSet: hello.setName ?? null,
      collectionCount: collections.length,
      categoryCount,
      approvedInitialDomainCount: domainCount,
      primaryUniversitySettingsCount: settingsCount,
      requestIndexes: requestIndexes.map(({ name }) => name).sort(),
    }, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`Phase 1 verification failed: ${error instanceof Error ? error.message : 'unknown error'}\n`);
    process.exitCode = 1;
  } finally {
    await disconnectDatabase();
  }
}

void main();
