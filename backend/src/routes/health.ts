import { Router } from 'express';
import mongoose from 'mongoose';
import { connectDatabase } from '../lib/mongo.js';

export const healthRouter = Router();

healthRouter.get('/health', async (_request, response) => {
  try {
    await connectDatabase();
    await mongoose.connection.db?.admin().command({ ping: 1 });
    response.setHeader('Cache-Control', 'no-store');
    response.status(200).json({ data: { status: 'ok' } });
  } catch {
    response.setHeader('Cache-Control', 'no-store');
    response.status(503).json({
      error: {
        code: 'INTERNAL',
        message: 'Service is temporarily unavailable.',
        details: {},
      },
    });
  }
});
