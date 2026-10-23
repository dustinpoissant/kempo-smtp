import install from './install.js';

/* An update repeats the install, which only says what is left to set up. */
export default async () => {
  await install();
};
