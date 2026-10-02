// ---------------------------------------------------------------------------
// Idempotent review seeder.
// Inserts the 100 seed reviews, mapped to real departments/areas, as APPROVED
// content with no demo flags. Safe to run repeatedly: it only ever touches
// rows where is_demo = 1, so genuine user-submitted reviews are never removed.
// ---------------------------------------------------------------------------
import { db, migrate, run, get } from '../config/db.js';
import { REVIEW_DATA } from './reviews.data.js';

migrate();

function lookup(mode, code) {
  const table = mode === 'dept' ? 'departments' : 'areas';
  if (!code) return null;
  const row = get(`SELECT id FROM ${table} WHERE code = ?`, code);
  return row ? row.id : null;
}

function iso(ms) {
  return new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
}

export function seedReviews() {
  // Clean any previously-seeded rows only.
  run('DELETE FROM reviews WHERE is_demo = 1');

  const now = Date.now();
  let inserted = 0;
  for (let i = 0; i < REVIEW_DATA.length; i++) {
    const [type, rating, comment, category, request, deptCode, areaCode, name] = REVIEW_DATA[i];
    const departmentId = lookup('dept', deptCode);
    const serviceAreaId = deptCode ? lookup('area', areaCode || null) : null;
    // Stagger timestamps so newest/oldest sorting is meaningful.
    const createdAt = iso(now - (i * 3600 + (i % 7) * 6000) * 1000);
    run(
      `INSERT INTO reviews
         (reviewer_name, reviewer_type, rating, comment, category, request,
          department_id, service_area_id, status, is_demo, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'APPROVED', 0, ?)`,
      name,
      type,
      rating,
      comment,
      category || null,
      request || null,
      departmentId,
      serviceAreaId,
      createdAt
    );
    inserted++;
  }

  const summary = get(
    `SELECT COUNT(*) AS n,
            COALESCE(AVG(rating),0) AS avg,
            SUM(reviewer_type='PATIENT') AS patients,
            SUM(reviewer_type='STAFF') AS staff,
            SUM(rating=5) s5, SUM(rating=4) s4, SUM(rating=3) s3, SUM(rating=2) s2, SUM(rating=1) s1
     FROM reviews WHERE status = 'APPROVED'`
  );
  console.log('Reviews seeded.');
  console.log(`  total      : ${summary.n}`);
  console.log(`  patients   : ${summary.patients}`);
  console.log(`  staff      : ${summary.staff}`);
  console.log(`  avg rating : ${Math.round(summary.avg * 10) / 10}`);
  console.log(`  5★:${summary.s5} 4★:${summary.s4} 3★:${summary.s3} 2★:${summary.s2} 1★:${summary.s1}`);
  return inserted;
}

// Allow running directly: `node seed/reviews.seed.js`
if (process.argv[1] && process.argv[1].endsWith('reviews.seed.js')) {
  seedReviews();
}

export default seedReviews;