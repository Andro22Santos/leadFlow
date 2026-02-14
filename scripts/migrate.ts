/**
 * Database migration script
 * Run with: npm run migrate
 */
import { initDatabase, runMigrations, closeDatabase } from '../src/config/database';

async function main() {
  console.log('🔄 Running LeadFlow database migrations...\n');

  try {
    await initDatabase();
    await runMigrations();
    console.log('\n✅ Migrations completed successfully!');
  } catch (error: any) {
    console.error('\n❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await closeDatabase();
  }
}

main();
