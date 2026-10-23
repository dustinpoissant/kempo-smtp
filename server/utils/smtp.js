import nodemailer from 'nodemailer';

/*
  Sending one email through an SMTP server with nodemailer. The settings and the email are given, and so is `createTransport`, so a test
  can use a real SMTP server of its own and nothing else is needed. It never throws: it resolves to what an email:send handler answers,
  `{ sent: true, provider, messageId }` or `{ sent: false, error }` (with `skipped: true` when no host is set up, so kempo knows it did not try).

  `secure: true` connects with TLS straight away (port 465, what most providers call SSL). `secure: false` connects plainly and upgrades with
  STARTTLS when the server offers it (port 587); the password is not sent before that unless the server cannot do TLS at all.
*/
const TIMEOUT_MS = 20 * 1000;

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': '\'', '&nbsp;': ' ', '&times;': 'x', '&middot;': '-' };

/* A plain-text version of the HTML for mail programs that show text (and spam filters that like to see one). */
export const htmlToText = html => String(html ?? '')
  .replace(/<(style|script)[\s\S]*?<\/\1>/gi, '')
  .replace(/<br\s*\/?>/gi, '\n')
  .replace(/<\/(p|div|h[1-6]|tr|li|blockquote|table)>/gi, '\n')
  .replace(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (match, href, text) => (text.replace(/<[^>]*>/g, '').trim() === href ? href : `${text.replace(/<[^>]*>/g, '').trim()} (${href})`))
  .replace(/<[^>]*>/g, '')
  .replace(/&(?:amp|lt|gt|quot|#39|nbsp|times|middot);/g, entity => ENTITIES[entity])
  .replace(/[ \t]+\n/g, '\n')
  .replace(/\n{3,}/g, '\n\n')
  .trim();

/* The sentence for a failure, in plain words, from what nodemailer reports. */
export const explain = (error, { host, port }, from = '') => {
  const reason = String(error?.response ?? error?.message ?? 'no reason given').replace(/\s+/g, ' ').trim();
  switch(error?.code){
    case 'EAUTH': return `The SMTP server did not accept the username or password (${reason})`;
    case 'ECONNREFUSED': return `Nothing is listening at ${host}:${port}. Check the host and port`;
    case 'ENOTFOUND': case 'EDNS': return `The host ${host} was not found`;
    case 'ETIMEDOUT': case 'ESOCKET': case 'ECONNECTION': case 'ECONNRESET': return `Could not connect to ${host}:${port} (${reason}). Check the host, the port and whether the connection is meant to be secure`;
    case 'EENVELOPE': return /sender|from|5\.7\.|domain/i.test(reason) && from
      ? `The SMTP server refused the sender address ${from} (${reason}). Set Email from, on the System tab of the Settings page, to the mailbox address or one of its aliases`
      : `The SMTP server refused the address: ${reason}`;
    case 'EMESSAGE': return `The SMTP server refused the message: ${reason}`;
    default: return `SMTP: ${reason}`;
  }
};

/* The sender to use: the site's, or when the site has not set one (a placeholder), the mailbox signed in with, which is what an SMTP server accepts. */
export const senderFor = (email, settings) => (email.fromIsDefault && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(settings?.user ?? '') ? settings.user : email.from);

export const validate = settings => {
  if(!settings?.host) return 'No SMTP server is set up. Add the host on the SMTP tab of the Settings page';
  if(!Number.isInteger(settings.port) || settings.port < 1 || settings.port > 65535) return 'The SMTP port must be a number from 1 to 65535';
  return null;
};

export const sendWithSmtp = async ({ settings, email, createTransport = options => nodemailer.createTransport(options) }) => {
  const problem = validate(settings);
  if(problem) return { sent: false, ...(settings?.host ? {} : { skipped: true }), error: problem };
  const from = senderFor(email, settings);

  const transport = createTransport({
    host: settings.host,
    port: settings.port,
    secure: settings.secure,
    ...(settings.user ? { auth: { user: settings.user, pass: settings.password } } : {}),
    connectionTimeout: TIMEOUT_MS,
    greetingTimeout: TIMEOUT_MS,
    socketTimeout: TIMEOUT_MS * 2,
  });

  try {
    const info = await transport.sendMail({ from, to: email.to, subject: email.subject, html: email.html, text: htmlToText(email.html) });
    if(Array.isArray(info.accepted) && info.accepted.length === 0) return { sent: false, error: `The SMTP server did not accept ${email.to}${info.rejected?.length ? ` (rejected: ${info.rejected.join(', ')})` : ''}` };
    return { sent: true, provider: 'smtp', messageId: info.messageId };
  } catch(error) {
    return { sent: false, error: explain(error, settings, from) };
  } finally {
    transport.close?.();
  }
};
