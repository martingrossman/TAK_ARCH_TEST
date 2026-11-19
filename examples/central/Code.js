/**
 * Standalone-script example: reads TARGET_SPREADSHEET_ID from Script Properties
 * and writes a timestamped greeting to that explicit target spreadsheet.
 */
function helloWorld() {
  const id = PropertiesService.getScriptProperties()
    .getProperty('TARGET_SPREADSHEET_ID');
  if (!id || !id.trim()) {
    throw new Error('Set TARGET_SPREADSHEET_ID in Project Settings > Script Properties.');
  }
  const spreadsheet = SpreadsheetApp.openById(id.trim());
  const sheet = spreadsheet.getSheetByName('TAK_ARCH_TEST') ||
    spreadsheet.insertSheet('TAK_ARCH_TEST');
  sheet.getRange('A1:C2').setValues([
    ['Message', 'Architecture', 'Timestamp (UTC)'],
    ['Hello from TAK_ARCH_TEST!', 'central', new Date().toISOString()]
  ]);
}
