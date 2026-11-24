import { app } from './app.js';
import { getEnvironment } from './config/env.js';

const { PORT } = getEnvironment();

app.listen(PORT, () => {
  process.stdout.write(`UniCircle API listening on http://localhost:${PORT}\n`);
});
