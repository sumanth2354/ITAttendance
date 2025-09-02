/*
  Cleanup attendance records for specific dates for a class.
  Usage examples:
    node scripts/cleanup-attendance.js --class "3rd Year IT-A" --dates 2025-09-02,2025-09-03
    node scripts/cleanup-attendance.js --classId 1 --dates 2025-09-02

  Requires DATABASE_URL in environment.
*/

require('dotenv').config();
const { Pool } = require('pg');

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { dates: [] };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--class' && args[i + 1]) {
      out.className = args[++i];
    } else if (arg === '--classId' && args[i + 1]) {
      out.classId = args[++i];
    } else if (arg === '--dates' && args[i + 1]) {
      out.dates = args[++i].split(',').map(s => s.trim()).filter(Boolean);
    }
  }
  return out;
}

function requireEnv(name) {
  if (!process.env[name]) {
    throw new Error(`${name} is required in environment`);
  }
}

async function main() {
  requireEnv('DATABASE_URL');
  const { className, classId: classIdArg, dates } = parseArgs();
  if ((!className && !classIdArg) || dates.length === 0) {
    console.error('Usage: node scripts/cleanup-attendance.js --class "Class Name" --dates YYYY-MM-DD[,YYYY-MM-DD...]');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    let classId = classIdArg;
    if (!classId) {
      const res = await client.query('SELECT id FROM classes WHERE class_name = $1 LIMIT 1', [className]);
      if (res.rows.length === 0) {
        console.error('Class not found:', className);
        process.exit(2);
      }
      classId = res.rows[0].id;
    }

    // Delete records for given dates
    const params = [classId, ...dates];
    const placeholders = dates.map((_, idx) => `$${idx + 2}::date`).join(',');
    const sql = `DELETE FROM attendance WHERE class_id = $1 AND date::date IN (${placeholders}) RETURNING id, student_id, date, period_id`;
    const del = await client.query(sql, params);
    console.log(`Deleted ${del.rowCount} attendance record(s) for class_id=${classId} on: ${dates.join(', ')}`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('Cleanup failed:', err.message);
  process.exit(1);
});


