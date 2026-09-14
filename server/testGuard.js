import dotenv from 'dotenv';
dotenv.config();

const dbUrl = process.env.DATABASE_URL || '';
const isProd = process.env.NODE_ENV === 'production';
const isRemoteSupabase = dbUrl.includes('supabase.com') || dbUrl.includes('pooler.supabase.com');

if (isProd || isRemoteSupabase) {
  console.error('\n🛑 BLOCKED: Cannot execute tests against the live production Supabase database!');
  console.error('To protect real customer & sales data, automated tests are blocked when connected to production.\n');
  process.exit(1);
}

console.log('✅ Local test environment verified. Running test suite...');
