import fs from 'fs';
import path from 'path';
import { db } from './client';

async function migrate() {
  const migrationsDir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

  console.log(`[migrate] Running ${files.length} migration(s)...`);

  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    console.log(`[migrate] Applying: ${file}`);
    await db.query(sql);
    console.log(`[migrate] Done: ${file}`);
  }

  console.log('[migrate] All migrations complete.');
  await db.end();
}

migrate().catch((err) => {
  console.error('[migrate] FAILED:', err.message);
  process.exit(1);
});
