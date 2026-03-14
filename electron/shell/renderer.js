(function bootstrapShell() {
  const params = new URLSearchParams(window.location.search);
  const uiUrl = params.get('ui') || 'http://127.0.0.1:4310/?section=overview&lang=zh';
  const platform = window.desktopMeta?.platform || 'win32';

  document.body.classList.add(`platform-${platform}`);

  const frame = document.getElementById('ui-frame');
  const minimizeBtn = document.getElementById('minimize-btn');
  const maximizeBtn = document.getElementById('maximize-btn');
  const closeBtn = document.getElementById('close-btn');
  const maxIcon = maximizeBtn.querySelector('.icon-max');
  const restoreIcon = maximizeBtn.querySelector('.icon-restore');

  frame.src = uiUrl;

  function setMaximizedState(isMaximized) {
    maxIcon.classList.toggle('hidden', isMaximized);
    restoreIcon.classList.toggle('hidden', !isMaximized);
    maximizeBtn.title = isMaximized ? 'Restore' : 'Maximize';
    maximizeBtn.setAttribute('aria-label', isMaximized ? 'Restore' : 'Maximize');
  }

  minimizeBtn.addEventListener('click', () => {
    window.windowControls.minimize();
  });

  maximizeBtn.addEventListener('click', async () => {
    window.windowControls.toggleMaximize();
    const state = await window.windowControls.getState();
    setMaximizedState(state.isMaximized);
  });

  closeBtn.addEventListener('click', () => {
    window.windowControls.close();
  });

  window.windowControls.getState().then((state) => {
    setMaximizedState(state.isMaximized);
  });
})();
