const nodemailer = require('nodemailer');
const logger = require('../lib/logger');

const sendEmail = async (options) => {
    const required = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'FROM_EMAIL'];
    const missing = required.filter((key) => !process.env[key]);
    if (missing.length) {
        logger.info({ channel: 'email' }, 'Email simulated; SMTP is not configured');
        return { status: 'simulated', messageId: '' };
    }

    const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: process.env.SMTP_SECURE === 'true' || Number(process.env.SMTP_PORT) === 465,
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
        },
    });

    const message = {
        from: `${process.env.FROM_NAME || 'Gym CRM'} <${process.env.FROM_EMAIL}>`,
        to: options.email,
        subject: options.subject,
        text: options.text,
        html: options.html,
    };

    const info = await transporter.sendMail(message);
    logger.info({ messageId: info.messageId }, 'Email sent');
    return { status: 'sent', messageId: info.messageId || '' };
};

const sendWhatsApp = async (options) => {
    logger.info({ channel: 'whatsapp' }, 'WhatsApp simulated; provider is not connected');
    return { status: 'simulated', messageId: '' };
};

module.exports = {
    sendEmail,
    sendWhatsApp,
};
