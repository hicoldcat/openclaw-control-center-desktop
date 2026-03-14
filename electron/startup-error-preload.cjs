const { contextBridge, ipcRenderer } = require('electron');

function readRequestId() {
  const prefix = '--startup-error-request-id=';
  const arg = process.argv.find((item) => item.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : '';
}

const requestId = readRequestId();
const dataChannel = `startup-error:get-data:${requestId}`;
const actionChannel = `startup-error:action:${requestId}`;

contextBridge.exposeInMainWorld('startupErrorBridge', {
  getDialogData: () => ipcRenderer.invoke(dataChannel),
  sendAction: (action) => ipcRenderer.send(actionChannel, action)
});
