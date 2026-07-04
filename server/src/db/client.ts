import { Pool } from 'pg';
import { config } from '../config';

// Single shared pool — reuse across the app
export const db = new Pool({
  connectionString: config.database.url,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

db.on('error', (err) => {
  console.error('[db] Unexpected pool error:', err.message);
});

export async function query<T = any>(
  sql: string,
  params?: any[]
): Promise<T[]> {
  const result = await db.query(sql, params);
  return result.rows as T[];
}

export async function queryOne<T = any>(
  sql: string,
  params?: any[]
): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}
