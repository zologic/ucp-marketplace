const nodemailer = require('nodemailer');

// Email templates with {{variable}} syntax
const templates = {
  invoice_generated: {
    subject: 'New Invoice Generated - {{invoice_number}}',
    html: `
      <h2>Invoice Generated</h2>
      <p>Hello {{merchant_domain}},</p>
      <p>A new invoice has been generated for your account.</p>
      <ul>
        <li><strong>Invoice Number:</strong> {{invoice_number}}</li>
        <li><strong>Amount:</strong> {{amount}}</li>
        <li><strong>Due Date:</strong> {{due_date}}</li>
      </ul>
      <p>Please ensure payment is made by the due date to avoid service interruption.</p>
      <p>Best regards,<br>UCP Marketplace Team</p>
    `,
    text: `
Invoice Generated

Hello {{merchant_domain}},

A new invoice has been generated for your account.

Invoice Number: {{invoice_number}}
Amount: {{amount}}
Due Date: {{due_date}}

Please ensure payment is made by the due date to avoid service interruption.

Best regards,
UCP Marketplace Team
    `
  },

  payment_failed: {
    subject: 'Payment Failed - Action Required',
    html: `
      <h2>Payment Failed</h2>
      <p>Hello,</p>
      <p>We were unable to process your payment for invoice {{invoice_number}}.</p>
      <ul>
        <li><strong>Invoice Number:</strong> {{invoice_number}}</li>
        <li><strong>Amount:</strong> {{amount}}</li>
        <li><strong>Retry Date:</strong> {{retry_date}}</li>
      </ul>
      <p>Please update your payment method to avoid service suspension.</p>
      <p>Best regards,<br>UCP Marketplace Team</p>
    `,
    text: `
Payment Failed - Action Required

Hello,

We were unable to process your payment for invoice {{invoice_number}}.

Invoice Number: {{invoice_number}}
Amount: {{amount}}
Retry Date: {{retry_date}}

Please update your payment method to avoid service suspension.

Best regards,
UCP Marketplace Team
    `
  },

  merchant_suspended: {
    subject: 'Account Suspended - Payment Required',
    html: `
      <h2>Account Suspended</h2>
      <p>Hello {{merchant_domain}},</p>
      <p>Your merchant account has been suspended due to overdue payment.</p>
      <ul>
        <li><strong>Outstanding Invoice:</strong> {{invoice_number}}</li>
        <li><strong>Amount Due:</strong> {{amount}}</li>
      </ul>
      <p>To restore your account, please make payment immediately:</p>
      <p><a href="{{payment_link}}">Pay Now</a></p>
      <p>Best regards,<br>UCP Marketplace Team</p>
    `,
    text: `
Account Suspended - Payment Required

Hello {{merchant_domain}},

Your merchant account has been suspended due to overdue payment.

Outstanding Invoice: {{invoice_number}}
Amount Due: {{amount}}

To restore your account, please make payment immediately.

Best regards,
UCP Marketplace Team
    `
  },

  merchant_verified: {
    subject: 'Welcome to UCP Marketplace - Account Verified',
    html: `
      <h2>Welcome to UCP Marketplace!</h2>
      <p>Hello {{merchant_domain}},</p>
      <p>Your merchant account has been successfully verified via UCP protocol.</p>
      <h3>Next Steps:</h3>
      <ul>
        <li>Your products are now discoverable by AI agents</li>
        <li>Access your admin dashboard at {{dashboard_link}}</li>
        <li>Monitor your sales and analytics</li>
        <li>Configure your merchant profile</li>
      </ul>
      <p>Thank you for joining UCP Marketplace!</p>
      <p>Best regards,<br>UCP Marketplace Team</p>
    `,
    text: `
Welcome to UCP Marketplace - Account Verified

Hello {{merchant_domain}},

Your merchant account has been successfully verified via UCP protocol.

Next Steps:
- Your products are now discoverable by AI agents
- Access your admin dashboard
- Monitor your sales and analytics
- Configure your merchant profile

Thank you for joining UCP Marketplace!

Best regards,
UCP Marketplace Team
    `
  },

  admin_alert: {
    subject: 'Admin Alert - {{alert_type}}',
    html: `
      <h2>Admin Alert</h2>
      <p><strong>Alert Type:</strong> {{alert_type}}</p>
      <p><strong>Message:</strong></p>
      <p>{{message}}</p>
      <p><strong>Timestamp:</strong> {{timestamp}}</p>
    `,
    text: `
Admin Alert

Alert Type: {{alert_type}}

Message:
{{message}}

Timestamp: {{timestamp}}
    `
  }
};

/**
 * Replace template variables with actual data
 */
function fillTemplate(template, data) {
  let result = template;
  for (const [key, value] of Object.entries(data)) {
    const regex = new RegExp(`{{${key}}}`, 'g');
    result = result.replace(regex, value || '');
  }
  return result;
}

/**
 * Send email with template
 * @param {string} to - Recipient email address
 * @param {string} templateName - Template name from templates object
 * @param {object} data - Template data for variable replacement
 * @returns {Promise<{success: boolean, messageId?: string, error?: string}>}
 */
async function sendEmail(to, templateName, data) {
  // Check if SMTP is configured
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.warn('SMTP not configured - email not sent:', templateName, 'to:', to);
    return { success: false, error: 'SMTP not configured' };
  }

  try {
    // Create transporter
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_PORT === '465', // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });

    // Get template or use generic fallback
    const template = templates[templateName] || {
      subject: 'Notification',
      html: `<pre>${JSON.stringify(data, null, 2)}</pre>`,
      text: JSON.stringify(data, null, 2)
    };

    // Fill template with data
    const subject = fillTemplate(template.subject, data);
    const html = fillTemplate(template.html, data);
    const text = fillTemplate(template.text, data);

    // Send email
    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM || 'noreply@ucpmarketplace.com',
      to,
      subject,
      text,
      html
    });

    console.log('Email sent:', templateName, 'to:', to, 'messageId:', info.messageId);
    return { success: true, messageId: info.messageId };

  } catch (error) {
    console.error('Error sending email:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Send admin alert email
 */
async function sendAdminAlert(alertType, message) {
  const adminEmail = process.env.ADMIN_ALERT_EMAIL;
  if (!adminEmail) {
    console.warn('ADMIN_ALERT_EMAIL not configured');
    return { success: false, error: 'Admin email not configured' };
  }

  return sendEmail(adminEmail, 'admin_alert', {
    alert_type: alertType,
    message,
    timestamp: new Date().toISOString()
  });
}

module.exports = {
  sendEmail,
  sendAdminAlert
};
