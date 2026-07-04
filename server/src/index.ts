import express from 'express';
import cors from 'cors';
import { config } from './config';
import { requestId, errorHandler, notFound } from './middleware';
import healthRouter from './routes/health';
import generationsRouter from './routes/generations';
import jobsRouter from './routes/jobs';
import githubRouter from './routes/github';

const app = express();

// Core middleware
app.use(cors({ origin: config.cors.origin, credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(requestId);

// Routes
app.use('/api/health', healthRouter);
app.use('/api/generations', generationsRouter);
app.use('/api/jobs', jobsRouter);
app.use('/api/github', githubRouter);

// Error handling (must be last)
app.use(notFound);
app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`[blair-server] Running on port ${config.port} (${config.nodeEnv})`);
  console.log(`[blair-server] Default provider: ${config.providers.default}`);
});

export default app;
