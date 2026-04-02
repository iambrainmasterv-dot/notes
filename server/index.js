import './loadEnv.js';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDb } from './db.js';
import { authMiddleware } from './auth.js';
import authRoutes from './routes/auth.js';
import notesRoutes from './routes/notes.js';
import tasksRoutes from './routes/tasks.js';
import settingsRoutes from './routes/settings.js';
import templatesRoutes from './routes/templates.js';
import instancesRoutes from './routes/instances.js';
import presetsRoutes from './routes/presets.js';
import scheduleTemplatesRoutes from './routes/scheduleTemplates.js';
import importRoutes from './routes/import.js';
import aiRoutes from './routes/ai.js';
import voidRoutes from './routes/void.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

if (process.env.TRUST_PROXY === 'true' || process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

app.use(cors());
app.use(express.json({ limit: '5mb' }));

app.use('/api/auth', authRoutes);
app.use('/api/void', voidRoutes);

app.use('/api/notes', authMiddleware, notesRoutes);
app.use('/api/tasks', authMiddleware, tasksRoutes);
app.use('/api/settings', authMiddleware, settingsRoutes);
app.use('/api/templates', authMiddleware, templatesRoutes);
app.use('/api/instances', authMiddleware, instancesRoutes);
app.use('/api/presets', authMiddleware, presetsRoutes);
app.use('/api/schedule-templates', authMiddleware, scheduleTemplatesRoutes);
app.use('/api/import', authMiddleware, importRoutes);
app.use('/api/ai', authMiddleware, aiRoutes);

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// Serve static frontend in production
const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir));
app.use((req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to init DB:', err);
    process.exit(1);
  });
