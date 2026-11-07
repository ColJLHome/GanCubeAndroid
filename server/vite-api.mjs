// Reuse Vite's HTTP server in development/preview instead of a process runner.
// Imported lazily: Android asset builds do not load Express or open a database.
export async function attachApi(server) {
  // Test runners and middleware-only consumers have no HTTP server to own it.
  if (!server.httpServer) return;
  const { createApp } = await import('./app.mjs');
  const { app, db, closeScrambler } = createApp(process.env.GANCUBE_DB_PATH || 'data/gancube.sqlite');
  server.middlewares.use((req, res, next) => {
    if (req.url?.startsWith('/api/')) app(req, res, next);
    else next();
  });
  server.httpServer.once('close', () => { closeScrambler(); db.close(); });
}
