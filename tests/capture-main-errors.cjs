// Test-only: fail visibly in logs instead of Electron's modal exception dialog.
function fail(error) {
  const detail = String(error && error.stack || error);
  console.error('TEST MAIN-PROCESS ERROR:', detail);
  try { require('node:fs').appendFileSync(require('node:path').join(process.env.MARKDOWN_LOCAL_USER_DATA, 'main-errors.log'), detail + '\n'); } catch { /* stderr still records the exception. */ }
  try { require('electron').app.exit(1); }
  catch { process.exit(1); }
}
process.on('uncaughtException', fail);
process.on('unhandledRejection', fail);
