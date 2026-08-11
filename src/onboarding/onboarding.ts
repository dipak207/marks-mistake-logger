declare var chrome: any;

(() => {
  const button = document.getElementById('connect') as HTMLButtonElement;
  const result = document.getElementById('result')!;

  button.addEventListener('click', async () => {
    button.disabled = true;
    result.textContent = 'Connecting…';

    const response = await chrome.runtime.sendMessage({ type: 'CONNECT_SHEETS' });
    if (response?.ok) {
      result.textContent = '✓ Connected. Your MARKS Mistakes sheet is ready.';
      button.textContent = 'Connected';
      return;
    }

    result.textContent = response?.error || 'Could not connect Google Sheets.';
    button.disabled = false;
  });
})();
