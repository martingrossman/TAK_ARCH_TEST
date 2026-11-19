// Public deployment URL, not a credential. Set before distributing the template.
const REGISTRY_URL = 'PASTE_YOUR_REGISTRY_EXEC_URL_HERE';
const LAB_VERSION = '0.1.0';

function onOpen() {
  SpreadsheetApp.getUi().createMenu('TAK lab')
    .addItem('Activate this copy', 'activateThisCopy')
    .addItem('Write Hello World', 'helloWorld').addToUi();
}

function helloWorld() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = spreadsheet.getSheetByName('TAK_ARCH_TEST') ||
    spreadsheet.insertSheet('TAK_ARCH_TEST');
  sheet.getRange('A1:C2').setValues([
    ['Message', 'Architecture', 'Timestamp (UTC)'],
    ['Hello from TAK_ARCH_TEST!', 'registered-bound', new Date().toISOString()]
  ]);
}

function activateThisCopy() {
  const ui = SpreadsheetApp.getUi();
  const answer = ui.prompt('Activate this copy',
    'This sends this copy\'s Script ID, Spreadsheet ID and code version to the lab owner. ' +
    'It does not share your sheet or grant update access. Enter your private invitation code:',
    ui.ButtonSet.OK_CANCEL);
  if (answer.getSelectedButton() !== ui.Button.OK) return;
  try {
    registerCopy_(answer.getResponseText().trim());
    ui.alert('Copy registered for review. Share this disposable sheet with the updater account ' +
      'as an editor if you want remote updates. Registration alone grants no access.');
  } catch (error) {
    ui.alert(error.message);
  }
}

function registerCopy_(invitation) {
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(REGISTRY_URL)) {
    throw new Error('The template owner must configure the registry deployment URL first.');
  }
  if (!/^[a-f0-9-]{72}$/.test(invitation)) throw new Error('Enter a valid invitation code.');
  const sheet = SpreadsheetApp.getActiveSpreadsheet();
  // Always read live IDs. Never use a template ID or a copied activation flag.
  const payload = { invitation, scriptId: ScriptApp.getScriptId(),
    spreadsheetId: sheet.getId(), version: LAB_VERSION };
  let response;
  try {
    response = UrlFetchApp.fetch(REGISTRY_URL, { method: 'post', contentType: 'application/json',
      payload: JSON.stringify(payload), followRedirects: true, muteHttpExceptions: true });
  } catch {
    throw new Error('Could not reach the registry. Retry with the same code before it expires.');
  }
  let result;
  try { result = JSON.parse(response.getContentText()); } catch {
    throw new Error('Registry returned an unexpected response. Check its web app deployment settings.');
  }
  if (response.getResponseCode() !== 200 || result?.ok !== true) {
    throw new Error('Registration was not accepted. Check the invitation or ask the lab owner.');
  }
  // Do not store the invitation or log request/response bodies.
  return result;
}
