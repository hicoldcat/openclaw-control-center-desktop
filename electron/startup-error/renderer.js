function setStatus(text, busy) {
  const container = document.getElementById('status');
  const textNode = document.getElementById('status-text');
  if (textNode) {
    textNode.textContent = text;
  }
  if (container) {
    container.classList.toggle('idle', !busy);
  }
}

function setButtonsDisabled(disabled) {
  const ids = ['start', 'retry', 'help', 'exit'];
  for (const id of ids) {
    const button = document.getElementById(id);
    if (button) {
      button.disabled = disabled;
    }
  }
}

function bindAction(id, action, statusText, busy) {
  const element = document.getElementById(id);
  if (!element) {
    return;
  }

  element.addEventListener('click', () => {
    setStatus(statusText, busy);
    setButtonsDisabled(true);
    window.startupErrorBridge.sendAction(action);
  });
}

async function init() {
  const data = await window.startupErrorBridge.getDialogData();

  document.title = data.title;
  const headline = document.getElementById('headline');
  const reason = document.getElementById('reason');
  const target = document.getElementById('target');

  if (headline) {
    headline.textContent = data.headline;
  }

  if (reason) {
    reason.textContent = data.reason;
  }

  if (target) {
    target.textContent = `Gateway target: ${data.host}:${data.port}`;
  }

  setStatus('Ready', false);
  setButtonsDisabled(false);

  bindAction('start', 'start', 'Starting OpenClaw...', true);
  bindAction('retry', 'retry', 'Checking gateway status...', true);
  bindAction('help', 'help', 'Opening help page...', true);
  bindAction('exit', 'exit', 'Closing...', false);
}

init().catch(() => {
  window.startupErrorBridge.sendAction('exit');
});
