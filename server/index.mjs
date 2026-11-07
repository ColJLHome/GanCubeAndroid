import { resolve } from 'node:path';
import { createApp } from './app.mjs';
const path = resolve(process.env.GANCUBE_DB_PATH || 'data/gancube.sqlite');
const { app, db, closeScrambler } = createApp(path);
const port = Number(process.env.PORT || 3001);
const server = app.listen(port, '127.0.0.1', () => {
  console.log(`GAN Cube API: http://localhost:${port}`);
  console.log(`SQLite database: ${path}`);
});
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
  closeScrambler();
  server.close(() => { db.close(); process.exit(0); });
});
