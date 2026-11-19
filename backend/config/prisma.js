const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('@prisma/client');
const dns = require('dns');
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}
require('dotenv').config();

const databaseHost = new URL(process.env.DATABASE_URL).hostname;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Local PostgreSQL is intentionally unencrypted. Enable TLS only when a
  // deployment explicitly points DATABASE_URL at a remote host.
  ssl: ['localhost', '127.0.0.1', 'db'].includes(databaseHost)
    ? false
    : { rejectUnauthorized: true },
  max: 10,
  idleTimeoutMillis: 120000, // keep connection warm across minute cron checks
  connectionTimeoutMillis: 60000, // 60s timeout for cold starts / network latency
  keepAlive: true,
  keepAliveInitialDelayMillis: 5000,
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

module.exports = prisma;
