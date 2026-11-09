import type { TeamId } from '@cti/shared';
import { state } from './state';

export const TEAMS: Record<TeamId, string> = {
  money: 'Money Movement',
  tax: 'Tax',
  access: 'Account Access',
  investing: 'Investing',
  banking: 'Banking'
};

export interface SubDef {
  id: string;
  name: string;
  /** Support notes in the 30 days ending on DATA_END. */
  n: number;
  /** Percent change vs the preceding 30 days. */
  change: number;
  seed: number;
  parentId: string;
}
export interface ParentDef {
  id: string;
  name: string;
  team: TeamId;
  subs: SubDef[];
}

type RawSub = Omit<SubDef, 'seed' | 'parentId'>;
const RAW: { id: string; name: string; team: TeamId; subs: RawSub[] }[] = [
  { id: 'wires', name: 'Wires and funding methods', team: 'money', subs: [
    { id: 'wire-re', name: 'Wire transfers & real estate', n: 1120, change: 34 },
    { id: 'wire-status', name: 'Wire status & processing updates', n: 780, change: 21 },
    { id: 'wire-3p', name: 'Third-party wires', n: 640, change: -4 },
    { id: 'wire-in', name: 'Incoming wire setup', n: 180, change: 6 },
    { id: 'wire-fees', name: 'Wire fees & limits', n: 130, change: -2 },
    { id: 'wire-intl', name: 'International wires', n: 90, change: 3 }] },
  { id: 'tax', name: 'Tax Forms & Residency', team: 'tax', subs: [
    { id: 'tax-1099', name: 'Tax Documents and 1099s', n: 1890, change: 48 },
    { id: 'tax-w9', name: 'W9 and Tax Forms', n: 720, change: 12 }] },
  { id: 'access', name: 'Login and Access Issues', team: 'access', subs: [
    { id: 'login-email', name: 'Login/email access issues', n: 1040, change: 9 },
    { id: 'locked', name: 'Account locked/password resets', n: 830, change: 17 },
    { id: '2fa', name: 'Two-factor & device verification', n: 310, change: 5 }] },
  { id: 'check', name: 'Check deposit and account questions', team: 'money', subs: [
    { id: 'check-status', name: 'Check status & delivery', n: 640, change: -12 },
    { id: 'check-deposit', name: 'Check deposit guidance', n: 560, change: -3 },
    { id: 'check-stop', name: 'Check stop payments', n: 310, change: 2 },
    { id: 'check-rollover', name: 'Check rollovers', n: 210, change: 4 }] },
  { id: 'withdraw', name: 'Withdrawal Inquiries', team: 'money', subs: [
    { id: 'wd-timing', name: 'Withdrawal timing', n: 690, change: 5 },
    { id: 'wd-limits', name: 'Withdrawal limits', n: 450, change: 1 },
    { id: 'wd-ext', name: 'Withdrawals to external accounts', n: 340, change: -6 }] },
  { id: 'ira', name: 'IRA rollovers & conversions', team: 'investing', subs: [
    { id: 'roth', name: 'Roth conversions', n: 420, change: 8 },
    { id: '401k', name: '401(k) rollovers', n: 380, change: 3 },
    { id: 'rollover-checks', name: 'Rollover checks', n: 250, change: 2 },
    { id: 'contrib', name: 'Contribution limits', n: 160, change: -9 }] },
  { id: 'cash', name: 'Cash account & APY', team: 'banking', subs: [
    { id: 'apy', name: 'APY questions', n: 610, change: -5 },
    { id: 'cash-features', name: 'Cash account features', n: 370, change: 2 }] },
  { id: 'invest', name: 'Investing & portfolio questions', team: 'investing', subs: [
    { id: 'risk', name: 'Portfolio & risk score', n: 410, change: 1 },
    { id: 'bond-port', name: 'Automated bond portfolio', n: 350, change: 11 }] },
  { id: 'statements', name: 'Account statements & documents', team: 'banking', subs: [
    { id: 'stmt-download', name: 'Statement downloads', n: 330, change: 4 },
    { id: 'acct-letters', name: 'Account verification letters', n: 210, change: 2 }] }
];

let seed = 0;
export const TOPICS: ParentDef[] = RAW.map((p) => ({
  id: p.id,
  name: p.name,
  team: p.team,
  subs: p.subs.map((s) => {
    seed += 1;
    return { ...s, seed, parentId: p.id };
  })
}));

export const PARENT: Record<string, ParentDef> = Object.fromEntries(TOPICS.map((p) => [p.id, p]));
export const SUB: Record<string, SubDef> = Object.fromEntries(TOPICS.flatMap((p) => p.subs.map((s) => [s.id, s])));

/** The 80 smaller topics that aren't modelled one by one, as a flat daily rate. */
export const OTHER_TOPICS = { count: 80, perDay: 4000 / 30, prevFactor: 0.98 };
export const TOTAL_TOPICS = 89;
/** Company-wide notes with no suitable topic, per day. */
export const NO_TOPIC_PER_DAY = 1437 / 30;
export const NO_TOPIC_THRESHOLD_PCT = 5;

/** Display name of a subtopic in a taxonomy version. */
export function subName(s: SubDef, version: string): string {
  if (s.id === '2fa' && version === 'v6') return 'Resolved login issues';
  // Renames published in a later version (set by the label management service on publish).
  const renames = (state.taxonomy as { publishedRenames?: Record<string, Record<string, string>> }).publishedRenames;
  const renamed = renames?.[version]?.[s.id];
  if (renamed) return renamed;
  return s.name;
}

/** Note templates: [text, theme]. Themes become AI "recurring issues". */
export const TEMPLATES: Record<string, [string, string][]> = {
  'wire-re': [
    ['Called asking how to wire to escrow for a home purchase. Explained the wire can be submitted from the app or website and shared the general timeline.', 'Not sure how to start an escrow wire'],
    ["Client asked what documents she needs to wire funds for a home closing. Advised having the purchase agreement and the title company's wire instructions ready.", 'Unsure which documents the title company needs'],
    ["Client is closing on a house Friday and worried the wire won't arrive in time. Explained the same-day cutoff and suggested sending by Thursday morning.", "Worried the wire won't arrive before closing"],
    ['Called to check when an escrow wire sent this morning will land. Confirmed it was submitted from [account redacted] and explained the same-day timeline.', 'Checking when a sent escrow wire will land']],
  'wire-status': [
    ['Client asked why an outgoing wire still shows as pending after 3 hours. Confirmed it was in review and gave the expected completion time.', 'Wire pending longer than expected'],
    ['Called to confirm a wire went out. Shared the reference number so the receiving bank could trace it.', 'Needs a reference number for the receiving bank'],
    ["Client's wire was returned by the receiving bank. Explained the account name didn't match and how to resubmit.", 'Wire returned by the receiving bank'],
    ['Asked whether a wire submitted after the cutoff would go out today. Explained it will process the next business day.', 'Cutoff time for same-day wires']],
  'wire-3p': [
    ["Client wanted to wire money to a family member's account. Explained third-party wires need extra verification.", "Wiring money to someone else's account"],
    ['Asked why a wire to a business account was flagged. Explained the third-party review and expected timeline.', 'Third-party wire flagged for review'],
    ['Client asked if a contractor can be paid by wire from [account redacted]. Walked through the third-party wire form.', 'Paying a contractor or business by wire'],
    ['Called about a third-party wire on hold. Confirmed identity and released the hold after review.', 'Third-party wire on hold']],
  'wire-in': [
    ['Client needed routing and account details to receive an incoming wire. Pointed to the account details page.', 'Needs details to receive a wire'],
    ['Asked how long an incoming wire takes to show up. Explained same-day posting when received before the cutoff.', 'How long incoming wires take'],
    ['Employer asked client for a wire memo. Explained what to include in the reference field.', 'What to put in the wire memo'],
    ['Incoming wire not showing yet. Confirmed nothing received and suggested asking the sender for a trace number.', 'Incoming wire not showing yet']],
  'wire-fees': [
    ['Asked whether there is a fee for outgoing wires. Explained the fee schedule.', 'Fees for outgoing wires'],
    ['Client hit the daily wire limit. Explained the limit and how to request a temporary increase.', 'Hit the daily wire limit'],
    ['Asked why the receiving bank charged a fee. Explained intermediary bank fees are outside our control.', 'Fees charged by other banks'],
    ['Client asked for the maximum wire amount for a home purchase. Shared the limit and the review process for larger wires.', 'Maximum wire for a home purchase']],
  'wire-intl': [
    ['Client asked if international wires are supported. Explained current options.', 'Whether international wires are supported'],
    ['Asked how to receive money from an overseas account. Shared the SWIFT details process.', 'Receiving money from abroad'],
    ['Called about exchange rates on an incoming international wire. Explained the conversion happens at the sending bank.', 'Exchange rates on incoming wires'],
    ['Client wanted to send money abroad for tuition. Explained the alternatives available.', 'Sending money abroad']],
  'tax-1099': [
    ['Client asked when the 1099 will be available. Explained the release date and how to download it.', 'When the 1099 will be available'],
    ['Called because the 1099 shows a different amount than expected. Explained cost basis reporting.', '1099 amounts differ from expectations'],
    ['Asked for a corrected 1099 after a late dividend adjustment. Explained corrected forms are issued automatically.', 'Corrected 1099 requests'],
    ["Client's tax software couldn't import the 1099. Shared the manual download steps.", "Tax software can't import the 1099"]],
  'tax-w9': [
    ['Client asked how to update the W-9 after a name change. Walked through the upload steps.', 'Updating the W-9 after a name change'],
    ['Asked why the account shows a backup withholding notice. Explained the W-9 certification.', 'Backup withholding notices'],
    ['Client moved abroad and asked which tax form to file. Referred to the W-8BEN instructions.', 'Which form to file after moving abroad'],
    ['Called to confirm the W-9 upload went through. Confirmed it was received.', 'Confirming the W-9 was received']],
  'login-email': [
    ["Client no longer has access to the email on file and can't log in. Started the email change verification.", 'No access to the email on file'],
    ["Login link emails aren't arriving. Asked client to check spam and resent the link.", 'Login emails not arriving'],
    ['Client changed jobs and lost the work email used for login. Verified identity and updated the email.', 'Lost a work email used for login'],
    ['Asked how to change the login email. Walked through the settings page.', 'Changing the login email']],
  locked: [
    ['Account locked after too many password attempts. Verified identity and explained the lock clears in 30 minutes.', 'Locked out after too many attempts'],
    ['Password reset email not received. Resent it and confirmed the email address on file.', 'Password reset email not received'],
    ["Client says the new password isn't accepted. Explained the password requirements.", 'New password not accepted'],
    ['Locked out while traveling. Verified identity and unlocked the account.', 'Locked out while traveling']],
  '2fa': [
    ["Client got a new phone and isn't receiving two-factor codes. Walked through updating the device.", 'New phone not receiving codes'],
    ['Asked why a verification code is requested at every login. Explained trusted device settings.', 'Asked for a code at every login'],
    ['Two-factor codes arriving late. Suggested switching to an authenticator app.', 'Codes arriving late'],
    ['Client lost the phone used for two-factor. Started identity verification.', 'Lost the two-factor phone']],
  'check-status': [
    ["Called – Inquired about check status. Explained we don't see a check sent because the check confirmation wasn't received in time.", 'No check sent because confirmation was late'],
    ['Client asked when a mailed check will arrive. Shared the expected delivery window.', 'When a mailed check will arrive'],
    ["Asked whether a check can be tracked. Explained tracking isn't available and gave the mailing date.", 'Tracking a mailed check'],
    ["Check hasn't arrived after 10 business days. Explained the reissue process.", 'Check not arrived after 10 days']],
  'check-rollover': [
    ["Client called about a rollover check and wanted to know if he can mobile deposit it. Explained he can't and will need to mail it.", 'Depositing a rollover check by mobile'],
    ['Asked how a rollover check from another provider should be made out before depositing.', 'How a rollover check should be made out'],
    ['Client received a rollover check by mail and asked where to send it.', 'Where to send a rollover check'],
    ['Asked when a mailed rollover check will be deposited.', 'When a mailed rollover check is deposited']],
  'rollover-checks': [
    ['Called to ask for 401k check rollover info. Explained how the check should be made out and where to mail it.', 'How to make out and mail a rollover check'],
    ["Client's old provider is mailing a rollover check. Explained when funds will be invested after it arrives.", 'When rolled-over funds are invested'],
    ['Asked whether the rollover check needs a form included. Shared the rollover form.', 'Forms to include with a rollover check'],
    ['Rollover check arrived made out to the client. Explained the 60-day rollover rule and next steps.', 'Rollover check made out to the client']],
  roth: [
    ['Called – Inquired about the Roth conversion process. Explained funds are invested in the Traditional IRA first, then can be converted after they clear.', 'How the Roth conversion process works'],
    ['Asked whether a Roth conversion is taxable this year. Suggested checking with a tax professional.', 'Whether a conversion is taxable'],
    ['Client wanted to undo a Roth conversion. Explained recharacterization is no longer allowed.', 'Undoing a Roth conversion'],
    ['Asked how long a Roth conversion takes. Explained the timeline.', 'How long a conversion takes']]
};

export function templatesOf(s: SubDef): [string, string][] {
  const t = TEMPLATES[s.id];
  if (t) return t;
  const l = s.name.toLowerCase();
  return [
    [`Client called with a question about ${l}. Walked through the steps and shared the help article.`, 'How it works'],
    [`Asked how long ${l} usually takes. Explained the typical timeline.`, 'How long it takes'],
    [`Called about ${l}; client was confused by a message in the app. Clarified what it meant.`, 'Confusing in-app message'],
    [`Follow-up call about ${l}. Confirmed details on [account redacted] and noted next steps.`, 'Follow-up on an open request']
  ];
}
