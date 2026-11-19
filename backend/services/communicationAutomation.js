const prisma = require('../config/prisma');
const { sendEmail, sendWhatsApp } = require('../utils/notificationService');
const logger = require('../lib/logger');

const RULE_DEFAULTS = [
  { trigger: 'membership_expiring', name: 'Membership expiring', days: 2, subject: 'Your Gym CRM membership expires soon', message: 'Hi {{name}}, your membership at {{gymName}} expires in {{days}} day(s), on {{expiryDate}}. Contact your gym to renew.' },
  { trigger: 'balance_overdue', name: 'Outstanding balance', days: 10, subject: 'A membership balance is still due', message: 'Hi {{name}}, our records show an outstanding balance of {{amountDue}} at {{gymName}}. Please contact the gym if you have already paid.' },
  { trigger: 'inactive_member', name: 'Member check-in reminder', days: 2, subject: 'We have not seen you at the gym recently', message: 'Hi {{name}}, it has been {{days}} days since your last check-in at {{gymName}}. We would love to see you back.' },
  { trigger: 'new_lead', name: 'New lead follow-up', days: 0, subject: 'Thanks for your interest in {{gymName}}', message: 'Hi {{name}}, thanks for reaching out to {{gymName}}. A team member will be in touch shortly.' },
];

const addDays = (date, days) => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};
const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const render = (template, values) => String(template || '').replace(/\{\{\s*([a-zA-Z]+)\s*\}\}/g, (_, key) => String(values[key] ?? ''));
const asHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])).replace(/\n/g, '<br>');

async function ensureDefaultRules(gymId) {
  for (const rule of RULE_DEFAULTS) {
    await prisma.communicationAutomationRule.upsert({
      where: { gymId_trigger: { gymId, trigger: rule.trigger } },
      create: { gymId, ...rule, enabled: false, channel: 'email' },
      update: {},
    });
  }
  return prisma.communicationAutomationRule.findMany({ where: { gymId }, orderBy: { createdAt: 'asc' } });
}

async function enqueueRule({ rule, target, kind, dateKey, gymName, currency = 'INR', days, amountDue, expiryDate }) {
  const targetId = target.id;
  const preference = kind === 'member'
    ? await prisma.communicationPreference.findUnique({ where: { memberId: targetId } })
    : await prisma.communicationPreference.findUnique({ where: { leadId: targetId } });
  if (!preference || preference.gymId !== rule.gymId || preference.optedOutAt) return;

  const values = {
    name: target.name || 'there', gymName, days: String(days ?? rule.days),
    amountDue: new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amountDue || 0),
    expiryDate: expiryDate ? new Date(expiryDate).toLocaleDateString('en-IN') : '',
  };
  const message = render(rule.message, values);
  const subject = render(rule.subject, values);
  const targets = rule.channel === 'both' ? ['email', 'whatsapp'] : [rule.channel];

  for (const channel of targets) {
    const hasConsent = channel === 'email' ? preference.emailOptIn : preference.whatsappOptIn;
    const recipient = channel === 'email' ? target.email : target.phone;
    if (!hasConsent || !recipient) continue;
    const dedupeKey = `${rule.id}:${kind}:${targetId}:${dateKey}:${channel}`;
    try {
      await prisma.communicationMessage.create({
        data: {
          gymId: rule.gymId, memberId: kind === 'member' ? targetId : null,
          leadId: kind === 'lead' ? targetId : null, ruleId: rule.id, channel,
          recipient, subject, body: message, dedupeKey,
        },
      });
    } catch (error) {
      if (error.code !== 'P2002') throw error;
    }
  }
}

async function scanGymRules(gymId, gymName, currency) {
  const rules = await ensureDefaultRules(gymId);
  const today = startOfDay(new Date());
  for (const rule of rules.filter((item) => item.enabled)) {
    if (rule.trigger === 'membership_expiring') {
      const day = addDays(today, rule.days);
      const members = await prisma.member.findMany({ where: { gymId, status: 'Active', expiryDate: { gte: day, lt: addDays(day, 1) } } });
      for (const member of members) await enqueueRule({ rule, target: member, kind: 'member', dateKey: `expiry-${member.expiryDate.toISOString().slice(0, 10)}`, gymName, currency, days: rule.days, expiryDate: member.expiryDate });
    }
    if (rule.trigger === 'balance_overdue') {
      // Membership expiry is the available due-date signal in this project.
      const dueDay = addDays(today, -rule.days);
      const members = await prisma.member.findMany({ where: { gymId, expiryDate: { lt: addDays(dueDay, 1) }, planPrice: { gt: 0 } } });
      for (const member of members) {
        const amountDue = Math.max(0, Number(member.planPrice || 0) - Number(member.paidAmount || 0));
        if (amountDue > 0) await enqueueRule({ rule, target: member, kind: 'member', dateKey: `overdue-${member.expiryDate.toISOString().slice(0, 10)}`, gymName, currency, days: rule.days, amountDue, expiryDate: member.expiryDate });
      }
    }
    if (rule.trigger === 'inactive_member') {
      const members = await prisma.member.findMany({ where: { gymId, status: 'Active', expiryDate: { gt: new Date() } } });
      const cutoff = addDays(today, -rule.days);
      const visits = await prisma.attendance.groupBy({ by: ['memberId'], where: { gymId }, _max: { date: true } });
      const latestVisitByMember = new Map(visits.map((visit) => [visit.memberId, visit._max.date]));
      for (const member of members) {
        const lastVisit = latestVisitByMember.get(member.id) || member.joinDate;
        if (lastVisit && lastVisit < cutoff) await enqueueRule({ rule, target: member, kind: 'member', dateKey: `inactive-${lastVisit.toISOString().slice(0, 10)}`, gymName, currency, days: Math.floor((today - startOfDay(lastVisit)) / 86400000) });
      }
    }
    if (rule.trigger === 'new_lead') {
      const leadDay = addDays(today, -rule.days);
      const leads = await prisma.lead.findMany({ where: { gymId, status: { notIn: ['Converted', 'Lost'] }, createdAt: { lt: addDays(leadDay, 1) } } });
      for (const lead of leads) await enqueueRule({ rule, target: lead, kind: 'lead', dateKey: `lead-${lead.createdAt.toISOString()}`, gymName, currency, days: rule.days });
    }
  }
}

async function scanEnabledRules() {
  const gyms = await prisma.gym.findMany({ where: { status: 'Active' }, select: { id: true, name: true, settings: { select: { currency: true } } } });
  for (const gym of gyms) {
    try { await scanGymRules(gym.id, gym.name, gym.settings?.currency || 'INR'); }
    catch (error) { logger.error({ err: error, gymId: gym.id }, 'Communication rule scan failed'); }
  }
}

async function dispatchPendingMessages(limit = 50) {
  const staleSending = new Date(Date.now() - 10 * 60_000);
  await prisma.communicationMessage.updateMany({ where: { status: 'sending', updatedAt: { lt: staleSending } }, data: { status: 'pending', nextAttemptAt: new Date() } });
  const pending = await prisma.communicationMessage.findMany({ where: { status: 'pending', nextAttemptAt: { lte: new Date() } }, orderBy: { createdAt: 'asc' }, take: limit });
  for (const item of pending) {
    const claim = await prisma.communicationMessage.updateMany({ where: { id: item.id, status: 'pending' }, data: { status: 'sending', attemptCount: { increment: 1 } } });
    if (!claim.count) continue;
    try {
      const preference = item.memberId
        ? await prisma.communicationPreference.findUnique({ where: { memberId: item.memberId } })
        : item.leadId ? await prisma.communicationPreference.findUnique({ where: { leadId: item.leadId } }) : null;
      const consentIsActive = preference?.gymId === item.gymId && !preference.optedOutAt && (item.channel === 'email' ? preference.emailOptIn : preference.whatsappOptIn);
      if (!consentIsActive || !(await isStillEligible(item))) {
        await prisma.communicationMessage.update({ where: { id: item.id }, data: { status: 'cancelled', error: '' } });
        continue;
      }
      const result = item.channel === 'email'
        ? await sendEmail({ email: item.recipient, subject: item.subject, text: item.body, html: `<p>${asHtml(item.body)}</p>` })
        : await sendWhatsApp({ phone: item.recipient, message: item.body });
      await prisma.communicationMessage.update({ where: { id: item.id }, data: { status: result.status, providerId: result.messageId || '', sentAt: new Date(), error: '' } });
    } catch (error) {
      const attempts = item.attemptCount + 1;
      const retry = attempts < 4;
      await prisma.communicationMessage.update({ where: { id: item.id }, data: { status: retry ? 'pending' : 'failed', error: String(error.message || error).slice(0, 1000), nextAttemptAt: retry ? new Date(Date.now() + Math.min(60, 2 ** attempts) * 60_000) : new Date() } });
    }
  }
}

async function isStillEligible(item) {
  if (!item.ruleId) return true;
  const rule = await prisma.communicationAutomationRule.findFirst({ where: { id: item.ruleId, gymId: item.gymId, enabled: true } });
  if (!rule) return false;
  const today = startOfDay(new Date());
  if (item.memberId) {
    const member = await prisma.member.findFirst({ where: { id: item.memberId, gymId: item.gymId } });
    if (!member) return false;
    if (rule.trigger === 'membership_expiring') {
      const target = addDays(today, rule.days);
      return member.status === 'Active' && member.expiryDate >= target && member.expiryDate < addDays(target, 1);
    }
    if (rule.trigger === 'balance_overdue') {
      return Boolean(member.expiryDate && member.expiryDate < addDays(addDays(today, -rule.days), 1) && Number(member.planPrice || 0) > Number(member.paidAmount || 0));
    }
    if (rule.trigger === 'inactive_member') {
      if (member.status !== 'Active' || !member.expiryDate || member.expiryDate <= new Date()) return false;
      const visit = await prisma.attendance.findFirst({ where: { memberId: member.id, gymId: item.gymId }, orderBy: { date: 'desc' } });
      return (visit?.date || member.joinDate) < addDays(today, -rule.days);
    }
  }
  if (item.leadId && rule.trigger === 'new_lead') {
    return Boolean(await prisma.lead.findFirst({ where: { id: item.leadId, gymId: item.gymId, status: { notIn: ['Converted', 'Lost'] } }, select: { id: true } }));
  }
  return false;
}

async function runCommunicationJobs() {
  await scanEnabledRules();
  await dispatchPendingMessages();
}

module.exports = { RULE_DEFAULTS, runCommunicationJobs, ensureDefaultRules, render };
