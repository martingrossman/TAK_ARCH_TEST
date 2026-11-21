/**
 * Independent per-copy TAK lab web app.
 * The copied Sheet owns this bound project and receives its own /exec deployment.
 */
const TAK_LAB_RELEASE = '0.1.0';
const TAK_SHEET_PROPERTY = 'TAK_BOUND_SPREADSHEET_ID';

/** A Sheet menu is just the launcher; the actual UI runs as a web app. */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('TAK lab')
    .addItem('Initialize this copy', 'initializeThisCopy')
    .addItem('Open my TAK web app', 'openMyTakWebApp')
    .addToUi();
}

/** Must be run from the COPIED spreadsheet, never from doGet(). */
function initializeThisCopy() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) throw new Error('Open the bound spreadsheet first.');
  // Always overwrite: a copied template must never retain the template sheet ID.
  PropertiesService.getScriptProperties().setProperty(TAK_SHEET_PROPERTY, spreadsheet.getId());
  SpreadsheetApp.getUi().alert('This copy is initialized. Deploy its web app from Extensions > Apps Script.');
}

/** Open this script's /exec URL in a new browser tab after the owner deploys it. */
function openMyTakWebApp() {
  const url = ScriptApp.getService().getUrl();
  if (!url || !/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(url)) {
    SpreadsheetApp.getUi().alert('First initialize this copy and publish its own web app deployment.');
    return;
  }
  const output = HtmlService.createHtmlOutput(
    '<p>Open the independent TAK web app for this Sheet:</p>' +
    '<a href="' + escapeHtml_(url) + '" target="_blank" rel="noopener noreferrer">Open TAK</a>'
  ).setWidth(310).setHeight(100);
  SpreadsheetApp.getUi().showModalDialog(output, 'Open TAK');
}

/** Web-app requests have no reliable active-spreadsheet context. */
function doGet() {
  const id = PropertiesService.getScriptProperties().getProperty(TAK_SHEET_PROPERTY);
  if (!id) return HtmlService.createHtmlOutput('This TAK copy is not initialized. Open its Google Sheet and run TAK lab > Initialize this copy.');
  const spreadsheet = SpreadsheetApp.openById(id);
  return HtmlService.createHtmlOutput(
    '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
    '<body style="font:16px system-ui,sans-serif;max-width:680px;margin:3rem auto;padding:0 1rem">' +
    '<h1>TAK independent web app</h1>' +
    '<p>Bound to Sheet: <strong>' + escapeHtml_(spreadsheet.getName()) + '</strong></p>' +
    '<p>Release: <strong>' + escapeHtml_(TAK_LAB_RELEASE) + '</strong></p>' +
    '<p>This is the copied project\'s own /exec deployment, not a central TAK app.</p>' +
    '</body></html>'
  ).setTitle('TAK architecture lab');
}

/** Protect the HTML output if a spreadsheet's title contains special characters. */
function escapeHtml_(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
