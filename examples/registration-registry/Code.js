/**
 * Private registry web app: creates single-copy invitations and records approved
 * enrollment requests without granting the sender access to the registry sheet.
 */
const REGISTRY_HEADERS = ['Script ID', 'Spreadsheet ID', 'Reported version', 'Registered at UTC', 'Review status'];
const INVITE_PREFIX = 'INVITE_';

/** Adds owner-only registry administration commands when the registry opens. */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('TAK registry')
    .addItem('Initialize registry', 'initializeRegistry')
    .addItem('Create invitation', 'createInvitation')
    .addItem('Revoke all invitations', 'revokeInvitations').addToUi();
}

/** Creates and binds the private registrations tab to this spreadsheet. */
function initializeRegistry() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const properties = PropertiesService.getScriptProperties();
  const existing = properties.getProperty('REGISTRY_SPREADSHEET_ID');
  if (existing && existing !== spreadsheet.getId()) throw new Error('Registry already points to a different sheet.');
  const sheet = spreadsheet.getSheetByName('Registrations') || spreadsheet.insertSheet('Registrations');
  if (sheet.getLastRow() === 0) sheet.appendRow(REGISTRY_HEADERS);
  checkHeaders_(sheet);
  properties.setProperty('REGISTRY_SPREADSHEET_ID', spreadsheet.getId());
  SpreadsheetApp.getUi().alert('Registry initialized. Keep this spreadsheet private.');
}

/** Issues a 24-hour invitation and stores only its hash in Script Properties. */
function createInvitation() {
  const properties = PropertiesService.getScriptProperties();
  if (!properties.getProperty('REGISTRY_SPREADSHEET_ID')) throw new Error('Initialize the registry first.');
  // Remove expired invitations to keep this small lab within property storage limits.
  for (const [key, value] of Object.entries(properties.getProperties())) {
    if (key.startsWith(INVITE_PREFIX) && JSON.parse(value).expiresAt <= Date.now()) properties.deleteProperty(key);
  }
  const invitation = Utilities.getUuid() + Utilities.getUuid();
  properties.setProperty(inviteKey_(invitation), JSON.stringify({ expiresAt: Date.now() + 24 * 60 * 60 * 1000 }));
  SpreadsheetApp.getUi().alert('Private invitation (valid for 24 hours)',
    invitation + '\n\nGive this to one test user for one copy. It is not saved in the sheet or logs.',
    SpreadsheetApp.getUi().ButtonSet.OK);
}

/** Removes every outstanding invitation after an explicit owner confirmation. */
function revokeInvitations() {
  const ui = SpreadsheetApp.getUi();
  if (ui.alert('Revoke invitations?', 'All outstanding invitation codes will stop working.',
    ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  const lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    const properties = PropertiesService.getScriptProperties();
    for (const key of Object.keys(properties.getProperties())) {
      if (key.startsWith(INVITE_PREFIX)) properties.deleteProperty(key);
    }
  } finally { lock.releaseLock(); }
}

/** Handles a web-app enrollment request and returns a deliberately sanitized response. */
function doPost(event) {
  try {
    const text = event?.postData?.contents;
    if (typeof text !== 'string' || text.length > 4096) throw new Error('Invalid request');
    register_(JSON.parse(text));
    return json_({ ok: true, status: 'recorded' });
  } catch {
    // Avoid exposing request data, invitation codes, registry IDs, or Google errors.
    return json_({ ok: false, error: 'Registration not accepted. Contact the lab owner.' });
  }
}

/** Validates and records one copy while serializing access with a script lock. */
function register_(payload) {
  const idPattern = /^[A-Za-z0-9_-]{20,200}$/;
  if (!payload || typeof payload.invitation !== 'string' || !/^[a-f0-9-]{72}$/.test(payload.invitation) ||
      typeof payload.scriptId !== 'string' || !idPattern.test(payload.scriptId) ||
      typeof payload.spreadsheetId !== 'string' || !idPattern.test(payload.spreadsheetId) ||
      typeof payload.version !== 'string' || payload.version.length > 32 ||
      !/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(payload.version)) throw new Error('Invalid fields');
  const lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    const properties = PropertiesService.getScriptProperties();
    const key = inviteKey_(payload.invitation);
    const invite = JSON.parse(properties.getProperty(key) || 'null');
    if (!invite || !Number.isFinite(invite.expiresAt) || invite.expiresAt <= Date.now()) throw new Error('Invalid invite');
    if (invite.scriptId && (invite.scriptId !== payload.scriptId || invite.spreadsheetId !== payload.spreadsheetId)) {
      throw new Error('Invite already used for another copy');
    }
    const registryId = properties.getProperty('REGISTRY_SPREADSHEET_ID');
    if (!registryId) throw new Error('Registry is not initialized');
    const sheet = SpreadsheetApp.openById(registryId).getSheetByName('Registrations');
    if (!sheet) throw new Error('Missing registry tab');
    checkHeaders_(sheet);
    const rows = sheet.getDataRange().getValues().slice(1);
    const existing = rows.find((row) => row[0] === payload.scriptId);
    if (existing && existing[1] !== payload.spreadsheetId) throw new Error('Conflicting parent');
    // Bind the invitation before writing. A retry can finish a failed write only for this copy.
    properties.setProperty(key, JSON.stringify({ ...invite,
      scriptId: payload.scriptId, spreadsheetId: payload.spreadsheetId }));
    if (!existing) {
      sheet.appendRow([payload.scriptId, payload.spreadsheetId, payload.version,
        new Date().toISOString(), 'Pending review']);
      SpreadsheetApp.flush();
    }
    // Existing rows are unchanged: retrying does not reset the owner's review decision.
  } finally { lock.releaseLock(); }
}

/** Refuses to write if the registry tab no longer has the expected columns. */
function checkHeaders_(sheet) {
  if (JSON.stringify(sheet.getRange(1, 1, 1, REGISTRY_HEADERS.length).getValues()[0]) !== JSON.stringify(REGISTRY_HEADERS)) {
    throw new Error('Unexpected registry headers');
  }
}

/** Derives the Script Properties key from an invitation without storing it in plain text. */
function inviteKey_(value) {
  return INVITE_PREFIX + Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value, Utilities.Charset.UTF_8)
    .map((byte) => (byte & 255).toString(16).padStart(2, '0')).join('');
}

/** Serializes a web-app response as JSON. */
function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
