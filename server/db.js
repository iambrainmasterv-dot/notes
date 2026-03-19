import pg from 'pg';
const { Pool } = pg;

if (!process.env.DATABASE_URL || typeof process.env.DATABASE_URL !== 'string') {
  throw new Error('DATABASE_URL is missing or invalid. Set it in server/.env');
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

export async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS notes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      completed BOOLEAN NOT NULL DEFAULT false,
      created_at TEXT NOT NULL,
      deadline TEXT,
      parent_id UUID,
      position_x REAL,
      position_y REAL,
      collapsed BOOLEAN NOT NULL DEFAULT false,
      daily BOOLEAN NOT NULL DEFAULT false
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      completed BOOLEAN NOT NULL DEFAULT false,
      created_at TEXT NOT NULL,
      deadline TEXT,
      target INTEGER NOT NULL DEFAULT 10,
      progress INTEGER NOT NULL DEFAULT 0,
      daily BOOLEAN NOT NULL DEFAULT false
    );

    CREATE TABLE IF NOT EXISTS daily_templates (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK (type IN ('note', 'task')),
      title TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      deadline_time TEXT,
      target INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS daily_instances (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      day_date DATE NOT NULL,
      source_template_id UUID REFERENCES daily_templates(id) ON DELETE SET NULL,
      preset_id UUID,
      type TEXT NOT NULL CHECK (type IN ('note', 'task')),
      title TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      deadline_time TEXT,
      target INTEGER NOT NULL DEFAULT 0,
      progress INTEGER NOT NULL DEFAULT 0,
      completed BOOLEAN NOT NULL DEFAULT false,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS presets (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS preset_items (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      preset_id UUID NOT NULL REFERENCES presets(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK (type IN ('note', 'task')),
      title TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      deadline_time TEXT,
      target INTEGER,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS user_settings (
      user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      daily_reset_time TEXT NOT NULL DEFAULT '00:00',
      theme_mode TEXT NOT NULL DEFAULT 'system',
      accent TEXT NOT NULL DEFAULT 'blue',
      ui_scale TEXT NOT NULL DEFAULT 'default',
      font_scale TEXT NOT NULL DEFAULT 'default',
      last_reset_tag TEXT
    );
  `);
}
