import { getSetting } from 'kempo/server/sdk.js';
import { sendWithSmtp } from '../server/utils/smtp.js';

/*
  The `email:send` handler: sends the email through the SMTP server in the settings and says how it went (kempo keeps the log). With no
  host saved it answers that it did not send, so another email extension, if there is one, gets its turn.
*/
export default async ({ email }) => {
  const read = async (name, fallback) => (await getSetting('kempo-smtp', name, fallback))[1];
  const settings = {
    host: String(await read('smtp_host', '')).trim(),
    port: Number(await read('smtp_port', 465)),
    secure: (await read('smtp_secure', true)) === true,
    user: String(await read('smtp_user', '')).trim(),
    password: String(await read('smtp_password', '')),
  };
  return sendWithSmtp({ settings, email });
};
