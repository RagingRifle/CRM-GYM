const prisma = require('../config/prisma');
const { RULE_DEFAULTS, ensureDefaultRules } = require('../services/communicationAutomation');
const { sendEmail } = require('../utils/notificationService');

const TRIGGERS = new Set(RULE_DEFAULTS.map((rule) => rule.trigger));
const getGymId = (req) => String(req.user.gymId?._id || req.user.gymId?.id || req.user.gymId || '');

const getSettings = async (req, res) => {
  const gymId = getGymId(req);
  if (!gymId) return res.status(400).json({ message: 'Select a gym workspace first.' });
  const [rules, recentMessages, preferences] = await Promise.all([
    ensureDefaultRules(gymId),
    prisma.communicationMessage.findMany({ where: { gymId }, orderBy: { createdAt: 'desc' }, take: 15, select: { id: true, channel: true, recipient: true, subject: true, body: true, status: true, error: true, attemptCount: true, sentAt: true, createdAt: true } }),
    prisma.communicationPreference.count({ where: { gymId } }),
  ]);
  res.json({ rules, recentMessages, contactsWithPreferences: preferences, emailConfigured: Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && process.env.FROM_EMAIL), whatsappMode: 'simulation' });
};

const updateRule = async (req, res) => {
  const gymId = getGymId(req);
  const { trigger } = req.params;
  if (!TRIGGERS.has(trigger)) return res.status(404).json({ message: 'Automation rule not found.' });
  const { enabled, days, channel, subject, message } = req.body;
  if (enabled !== undefined && typeof enabled !== 'boolean') return res.status(400).json({ message: 'Enabled must be true or false.' });
  if (days !== undefined && (!Number.isInteger(Number(days)) || Number(days) < 0 || Number(days) > 365)) return res.status(400).json({ message: 'Days must be between 0 and 365.' });
  if (channel !== undefined && !['email', 'whatsapp', 'both'].includes(channel)) return res.status(400).json({ message: 'Channel must be email, whatsapp, or both.' });
  if (message !== undefined && (typeof message !== 'string' || message.length > 2000)) return res.status(400).json({ message: 'Message must be 2,000 characters or fewer.' });
  if (subject !== undefined && (typeof subject !== 'string' || subject.length > 200)) return res.status(400).json({ message: 'Subject must be 200 characters or fewer.' });
  const base = RULE_DEFAULTS.find((rule) => rule.trigger === trigger);
  const rule = await prisma.communicationAutomationRule.upsert({
    where: { gymId_trigger: { gymId, trigger } },
    create: { gymId, ...base, enabled: enabled ?? false, days: days === undefined ? base.days : Number(days), channel: channel || 'email', subject: String(subject ?? base.subject).slice(0, 200), message: message ?? base.message },
    update: { ...(enabled === undefined ? {} : { enabled }), ...(days === undefined ? {} : { days: Number(days) }), ...(channel === undefined ? {} : { channel }), ...(subject === undefined ? {} : { subject: String(subject).slice(0, 200) }), ...(message === undefined ? {} : { message }) },
  });
  if (rule.enabled === false) await prisma.communicationMessage.updateMany({ where: { gymId, ruleId: rule.id, status: 'pending' }, data: { status: 'cancelled' } });
  res.json(rule);
};

const getContacts = async (req, res) => {
  const gymId = getGymId(req);
  const branchId = req.user.branchId || undefined;
  const [members, leads] = await Promise.all([
    prisma.member.findMany({ where: { gymId, ...(branchId ? { branchId } : {}) }, orderBy: { name: 'asc' }, take: 150, select: { id: true, name: true, email: true, phone: true, branchId: true } }),
    prisma.lead.findMany({ where: { gymId, ...(branchId ? { branchId } : {}), status: { notIn: ['Converted', 'Lost'] } }, orderBy: { name: 'asc' }, take: 100, select: { id: true, name: true, email: true, phone: true, branchId: true } }),
  ]);
  const preferences = await prisma.communicationPreference.findMany({ where: { gymId, OR: [{ memberId: { in: members.map((item) => item.id) } }, { leadId: { in: leads.map((item) => item.id) } }] } });
  const prefMap = new Map(preferences.map((pref) => [pref.memberId || pref.leadId, pref]));
  res.json([
    ...members.map((item) => ({ ...item, type: 'member', preferences: prefMap.get(item.id) || null })),
    ...leads.map((item) => ({ ...item, type: 'lead', preferences: prefMap.get(item.id) || null })),
  ]);
};

const updateContactPreference = async (req, res) => {
  const gymId = getGymId(req);
  const { type, id } = req.params;
  if (!['member', 'lead'].includes(type)) return res.status(400).json({ message: 'Contact type must be member or lead.' });
  const model = type === 'member' ? prisma.member : prisma.lead;
  const contact = await model.findFirst({ where: { id, gymId, ...(req.user.branchId ? { branchId: req.user.branchId } : {}) }, select: { id: true } });
  if (!contact) return res.status(404).json({ message: 'Contact not found in this gym.' });
  const { emailOptIn, whatsappOptIn, consentSource } = req.body;
  if (typeof emailOptIn !== 'boolean' || typeof whatsappOptIn !== 'boolean') return res.status(400).json({ message: 'Choose email and WhatsApp consent explicitly.' });
  if ((emailOptIn || whatsappOptIn) && !String(consentSource || '').trim()) return res.status(400).json({ message: 'Record where consent was obtained before enabling a channel.' });
  const key = type === 'member' ? { memberId: id } : { leadId: id };
  const preference = await prisma.communicationPreference.upsert({
    where: key,
    create: { gymId, ...key, emailOptIn, whatsappOptIn, consentSource: String(consentSource || '').slice(0, 200), consentedAt: emailOptIn || whatsappOptIn ? new Date() : null, optedOutAt: !emailOptIn && !whatsappOptIn ? new Date() : null },
    update: { emailOptIn, whatsappOptIn, consentSource: String(consentSource || '').slice(0, 200), consentedAt: emailOptIn || whatsappOptIn ? new Date() : null, optedOutAt: !emailOptIn && !whatsappOptIn ? new Date() : null },
  });
  res.json(preference);
};

const sendTestEmail = async (req, res) => {
  if (!req.user.email) return res.status(400).json({ message: 'Your staff account needs an email address to receive a test.' });
  const result = await sendEmail({ email: req.user.email, subject: 'Gym CRM email connection test', text: 'Your Gym CRM SMTP connection is working.', html: '<p>Your Gym CRM SMTP connection is working.</p>' });
  res.json({ ...result, recipient: req.user.email });
};

const getMessages = async (req, res) => {
  const gymId = getGymId(req);
  const status = req.query.status;
  const messages = await prisma.communicationMessage.findMany({ where: { gymId, ...(status ? { status: String(status) } : {}), ...(req.user.branchId ? { OR: [{ member: { branchId: req.user.branchId } }, { lead: { branchId: req.user.branchId } }, { memberId: null, leadId: null }] } : {}) }, orderBy: { createdAt: 'desc' }, take: 100 });
  res.json(messages);
};

module.exports = { getSettings, updateRule, getContacts, updateContactPreference, sendTestEmail, getMessages };
