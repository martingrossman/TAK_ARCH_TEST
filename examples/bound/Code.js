/** Runs in the editor or menu of a disposable, bound spreadsheet. */
function helloWorld() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) {
    throw new Error('Run this from the bound spreadsheet menu or script editor.');
  }
  const sheet = spreadsheet.getSheetByName('TAK_ARCH_TEST') ||
    spreadsheet.insertSheet('TAK_ARCH_TEST');
  sheet.getRange('A1:C2').setValues([
    ['Message', 'Architecture', 'Timestamp (UTC)'],
    ['Hello from TAK_ARCH_TEST!', 'bound', new Date().toISOString()]
  ]);
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('TAK lab')
    .addItem('Write Hello World', 'helloWorld').addToUi();
}
