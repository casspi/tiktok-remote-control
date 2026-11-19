chrome.storage.local.get(['host', 'port', 'token'], (cfg) => {
  document.getElementById('host').value = cfg.host || '127.0.0.1';
  document.getElementById('port').value = cfg.port || '8787';
  document.getElementById('token').value = cfg.token || '';
});

document.getElementById('save').addEventListener('click', () => {
  const host = document.getElementById('host').value.trim() || '127.0.0.1';
  const port = Number(document.getElementById('port').value.trim()) || 8787;
  const token = document.getElementById('token').value.trim();
  chrome.storage.local.set({ host, port, token });
});
