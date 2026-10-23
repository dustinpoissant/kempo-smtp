/* Nothing to create: the settings come from kempo-config.json. Says what is still to do, and warns when kempo cannot store the password. */
export default async () => {
  if(!process.env.SETTINGS_ENCRYPTION_KEY){
    console.warn('[kempo-smtp] SETTINGS_ENCRYPTION_KEY is not set, so the SMTP password cannot be stored. Start the server once to have kempo make one, then reinstall this extension.');
    return;
  }
  console.log('[kempo-smtp] Installed. Add the SMTP host, port, user and password on the SMTP tab of the Settings page, and set the Email from address to the mailbox address.');
};
