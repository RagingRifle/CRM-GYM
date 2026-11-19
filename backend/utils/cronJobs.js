const cron = require('node-cron');
const logger = require('../lib/logger');
const { autoUnfreezeDueMembers } = require('../controllers/freezeController');
const { runCommunicationJobs } = require('../services/communicationAutomation');

const startCronJobs = () => {
    // Scheduled membership pauses resume automatically at their chosen time.
    cron.schedule('*/5 * * * *', async () => {
        try {
            const resumed = await autoUnfreezeDueMembers();
            if (resumed) logger.info(`[MembershipFreeze] Automatically resumed ${resumed} scheduled pause(s).`);
        } catch (error) {
            logger.error({ err: error }, '[MembershipFreeze] Automatic resume job failed.');
        }
    });

    // Scan automation rules and dispatch the durable queue every five minutes.
    cron.schedule('*/5 * * * *', async () => {
        try { await runCommunicationJobs(); }
        catch (error) { logger.error({ err: error }, 'Communication automation job failed'); }
    });

    cron.schedule('0 0 * * *', async () => {
        try {
            const prisma = require('../config/prisma');
            const expired = await prisma.member.updateMany({ where: { status: 'Active', expiryDate: { lt: new Date() } }, data: { status: 'Expired' } });
            if (expired.count) logger.info({ count: expired.count }, 'Expired memberships updated');
        } catch (error) { logger.error({ err: error }, 'Daily membership expiry update failed'); }
    });

    // --- FitPrime session auto-expiry (every minute) ---
    // Bulk-reconcile sessions whose clock has run out. The lazy expireIfDue()
    // helper in sessionHelpers.js already handles this on read for correctness,
    // so this cron only exists to clean up rows and member fields in the
    // background for sessions that are never read again.
    //
    // NOTE: intentionally does NOT call logAudit() -- session-expiry volume would
    // flood the admin AuditLogs UI. Operational visibility stays in console logs only.
    cron.schedule('* * * * *', async () => {
        const runWithRetry = async (fn, retries = 2, delay = 3000) => {
            for (let i = 1; i <= retries; i++) {
                try {
                    return await fn();
                } catch (err) {
                    if (i === retries) throw err;
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        };

        try {
            const now = new Date();
            const prisma = require('../config/prisma');

            // 1. Expire the SessionCheckIn rows.
            const expiredRows = await runWithRetry(() =>
                prisma.sessionCheckIn.updateMany({
                    where: { status: 'active', expiresAt: { lte: now } },
                    data: { status: 'expired' },
                })
            );

            if (expiredRows && expiredRows.count > 0) {
                // 2. Clear the now-expired active session fields on those members.
                const justExpired = await runWithRetry(() =>
                    prisma.sessionCheckIn.findMany({
                        where: { status: 'expired', expiresAt: { lte: now } },
                        select: { memberId: true, expiresAt: true },
                        distinct: ['memberId'],
                    })
                );
                for (const row of justExpired) {
                    await prisma.member.updateMany({
                        where: { id: row.memberId, currentSessionEndsAt: row.expiresAt },
                        data: { currentSessionEndsAt: null, currentSessionGymId: null },
                    }).catch(() => {});
                }
                logger.info(`[SessionExpiry] Expired ${expiredRows.count} session(s).`);
            }
        } catch (error) {
            // Silently handle transient socket timeouts in background cron
            if (error?.code !== 'P1008') {
                logger.error({ message: error.message }, '[SessionExpiry] background sync issue');
            }
        }
    });

    logger.info('Cron jobs scheduled logic initialized.');
};

module.exports = startCronJobs;
