import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SMTPServer } from 'smtp-server';
import { explain, htmlToText, senderFor, sendWithSmtp, validate } from '../server/utils/smtp.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const email = { id: 'e1', to: 'ann@example.com', from: 'Shop <shop@example.com>', subject: 'Your order', html: '<h2>Thanks</h2><p>Order <b>#1</b> is <a href="https://x.test/o/1">on its way</a>.</p>' };

/*
  A real SMTP server of the test's own, on a free port: it asks for the username and password, remembers every message it was given,
  and can refuse an address. Nothing leaves the machine.
*/
const startServer = ({ user = 'orders@example.com', pass = 'secret', refuse = null, open = false, refuseSender = null } = {}) => new Promise(resolve => {
  const messages = [];
  const server = new SMTPServer({
    authOptional: open,
    allowInsecureAuth: true,
    disabledCommands: ['STARTTLS'],
    onAuth: (auth, session, done) => (auth.username === user && auth.password === pass ? done(null, { user: auth.username }) : done(new Error('Invalid login'))),
    onMailFrom: (address, session, done) => (refuseSender && address.address === refuseSender ? done(Object.assign(new Error(`550 5.7.27 <${refuseSender}>: Sender address rejected: Domain example.com does not accept mail (nullMX)`), { responseCode: 550 })) : done()),
    onRcptTo: (address, session, done) => (refuse && address.address === refuse ? done(Object.assign(new Error('Mailbox unavailable'), { responseCode: 550 })) : done()),
    onData: (stream, session, done) => {
      let raw = '';
      stream.on('data', chunk => { raw += chunk; });
      stream.on('end', () => { messages.push({ raw, from: session.envelope.mailFrom.address, to: session.envelope.rcptTo.map(entry => entry.address) }); done(); });
    },
  });
  server.listen(0, '127.0.0.1', () => resolve({ server, messages, port: server.server.address().port }));
});

const servers = [];
const start = async options => { const started = await startServer(options); servers.push(started.server); return started; };
after(() => Promise.all(servers.map(server => new Promise(resolve => server.close(resolve)))));

const settings = port => ({ host: '127.0.0.1', port, secure: false, user: 'orders@example.com', password: 'secret' });

test('an email is delivered to a real SMTP server after signing in, with the html, a text version, and the right sender and recipient', async () => {
  const { messages, port } = await start();
  const result = await sendWithSmtp({ settings: settings(port), email });
  assert.equal(result.sent, true);
  assert.equal(result.provider, 'smtp');
  assert.ok(result.messageId);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].from, 'shop@example.com');
  assert.deepEqual(messages[0].to, ['ann@example.com']);
  assert.match(messages[0].raw, /Subject: Your order/);
  assert.match(messages[0].raw, /Content-Type: text\/html/);
  assert.match(messages[0].raw, /Content-Type: text\/plain/);
  assert.match(messages[0].raw, /<h2>Thanks<\/h2>/);
  assert.match(messages[0].raw, /on its way \(https:\/\/x\.test\/o\/1\)/);
});

test('a wrong password is reported as one, and nothing is delivered', async () => {
  const { messages, port } = await start();
  const result = await sendWithSmtp({ settings: { ...settings(port), password: 'wrong' }, email });
  assert.equal(result.sent, false);
  assert.match(result.error, /did not accept the username or password/);
  assert.equal(messages.length, 0);
});

test('a recipient the server refuses is a failure with the reason', async () => {
  const { messages, port } = await start({ refuse: 'ann@example.com' });
  const result = await sendWithSmtp({ settings: settings(port), email });
  assert.equal(result.sent, false);
  assert.match(result.error, /Mailbox unavailable/);
  assert.equal(messages.length, 0);
});

test('a server that is not there is a failure that says where it looked, and never a throw', async () => {
  const { port } = await start();
  const closed = await new Promise(resolve => { const probe = new SMTPServer(); probe.listen(0, '127.0.0.1', () => { const free = probe.server.address().port; probe.close(() => resolve(free)); }); });
  assert.notEqual(closed, port);
  const result = await sendWithSmtp({ settings: settings(closed), email });
  assert.equal(result.sent, false);
  assert.match(result.error, new RegExp(`127\\.0\\.0\\.1:${closed}`));
  const unknown = await sendWithSmtp({ settings: { ...settings(25), host: 'no-such-host.invalid' }, email });
  assert.equal(unknown.sent, false);
  assert.match(unknown.error, /no-such-host\.invalid/);
});

test('a server that needs no sign-in works with no user, and the settings are checked first', async () => {
  assert.equal((await sendWithSmtp({ settings: { host: '', port: 465 }, email })).sent, false);
  assert.match(validate({ host: '', port: 465 }), /SMTP tab of the Settings page/);
  assert.match(validate({ host: 'smtp.example.com', port: 70000 }), /port/);
  assert.match(validate({ host: 'smtp.example.com', port: NaN }), /port/);
  assert.equal(validate({ host: 'smtp.example.com', port: 587 }), null);
  const { messages, port } = await start({ open: true });
  const result = await sendWithSmtp({ settings: { host: '127.0.0.1', port, secure: false, user: '', password: '' }, email });
  assert.equal(result.sent, true, result.error);
  assert.equal(messages.length, 1);
});

test('a transport that throws something unexpected is still an answer, and the transport is closed', async () => {
  let closed = false;
  const createTransport = () => ({ sendMail: async () => { throw Object.assign(new Error('Strange'), { code: 'EWHATEVER' }); }, close: () => { closed = true; } });
  const result = await sendWithSmtp({ settings: { host: 'h', port: 25, secure: false }, email, createTransport });
  assert.deepEqual(result, { sent: false, error: 'SMTP: Strange' });
  assert.equal(closed, true);
  const none = await sendWithSmtp({ settings: { host: 'h', port: 25, secure: false }, email, createTransport: () => ({ sendMail: async () => ({ accepted: [], rejected: ['ann@example.com'] }), close() {} }) });
  assert.match(none.error, /did not accept ann@example.com \(rejected: ann@example.com\)/);
});

test('the plain text keeps links, line breaks and entities, and drops the markup and the style', () => {
  assert.equal(htmlToText('<style>p{color:red}</style><p>Hello &amp; welcome</p><p>Line<br>break</p>'), 'Hello & welcome\nLine\nbreak');
  assert.equal(htmlToText('<a href="https://x.test">https://x.test</a>'), 'https://x.test');
  assert.equal(htmlToText('<a href="https://x.test"><b>Click</b></a>'), 'Click (https://x.test)');
  assert.equal(htmlToText(undefined), '');
  assert.equal(explain({ code: 'ECONNREFUSED' }, { host: 'h', port: 1 }), 'Nothing is listening at h:1. Check the host and port');
});

test('the config declares the hook, the password is a secret, and the files it names exist', async () => {
  const config = JSON.parse(await readFile(path.join(root, 'kempo-config.json'), 'utf8'));
  assert.equal(config.hooks['email:send'], './hooks/send.js');
  assert.ok(existsSync(path.join(root, 'hooks', 'send.js')));
  const types = Object.fromEntries(config.settings.map(setting => [setting.name, setting.type]));
  assert.deepEqual(types, { smtp_host: 'string', smtp_port: 'number', smtp_secure: 'boolean', smtp_user: 'string', smtp_password: 'secret' });
  const tab = await readFile(path.join(root, 'admin', 'settings-tab.global.html'), 'utf8');
  assert.match(tab, /<k-settings-panel owner="kempo-smtp">/);
});

test('with the placeholder sender the mailbox signed in with is used, and a sender the site chose is left alone', async () => {
  const { messages, port } = await start();
  const placeholder = await sendWithSmtp({ settings: settings(port), email: { ...email, from: 'noreply@example.com', fromIsDefault: true } });
  assert.equal(placeholder.sent, true, placeholder.error);
  assert.equal(messages[0].from, 'orders@example.com');
  const chosen = await sendWithSmtp({ settings: settings(port), email: { ...email, from: 'Shop <shop@example.com>', fromIsDefault: false } });
  assert.equal(chosen.sent, true, chosen.error);
  assert.equal(messages[1].from, 'shop@example.com');
  assert.equal(senderFor({ from: 'noreply@example.com', fromIsDefault: true }, { user: '' }), 'noreply@example.com', 'with no user there is nothing better to use');
  assert.equal(senderFor({ from: 'noreply@example.com', fromIsDefault: true }, { user: 'not an address' }), 'noreply@example.com');
});

test('a sender the server refuses says which one, and where to change it', async () => {
  const { port } = await start({ open: true, refuseSender: 'noreply@example.com' });
  const result = await sendWithSmtp({ settings: { host: '127.0.0.1', port, secure: false, user: '', password: '' }, email: { ...email, from: 'noreply@example.com', fromIsDefault: false } });
  assert.equal(result.sent, false);
  assert.equal(result.skipped, undefined);
  assert.match(result.error, /refused the sender address noreply@example\.com/);
  assert.match(result.error, /Email from, on the System tab of the Settings page/);
  assert.match(explain({ code: 'EENVELOPE', response: '550 User unknown' }, { host: 'h', port: 1 }, 'a@b.co'), /refused the address: 550 User unknown/);
});

test('with no host the handler says it was skipped, and with a bad port it says it tried and could not', async () => {
  const none = await sendWithSmtp({ settings: { host: '', port: 465 }, email });
  assert.equal(none.skipped, true);
  const badPort = await sendWithSmtp({ settings: { host: 'smtp.example.com', port: 0 }, email });
  assert.equal(badPort.sent, false);
  assert.equal(badPort.skipped, undefined);
});
