// Mailbox providers whose domain says nothing about the company (design decision 10): a
// registration from one of them never counts as a possible duplicate by domain.
export const FREE_MAIL_DOMAINS: ReadonlySet<string> = new Set([
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'yahoo.com',
  'icloud.com',
  'proton.me',
  'protonmail.com',
  'gmx.de',
  'gmx.net',
  'web.de',
  't-online.de',
  'freenet.de',
  'wp.pl',
  'o2.pl',
  'onet.pl',
  'interia.pl',
  'op.pl',
]);
