const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("rhodesPortPicker", {
  select(port) {
    ipcRenderer.send("rhodes-port-picker-select", port);
  },
  cancel() {
    ipcRenderer.send("rhodes-port-picker-cancel");
  },
});
