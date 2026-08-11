"use strict";
(async () => {
    const connection = document.getElementById('connection');
    const wrongCount = document.getElementById('wrong-count');
    const savedCount = document.getElementById('saved-count');
    const primary = document.getElementById('primary');
    const message = document.getElementById('message');
    const state = (await chrome.runtime.sendMessage({ type: 'GET_POPUP_STATE' }));
    connection.textContent = state.connected ? 'Connected' : 'Not connected';
    wrongCount.textContent = String(state.wrong || 0);
    savedCount.textContent = String(state.saved || 0);
    if (state.connected && state.spreadsheetUrl) {
        primary.disabled = false;
        primary.textContent = 'Open Google Sheet';
        primary.addEventListener('click', () => chrome.tabs.create({ url: state.spreadsheetUrl }));
    }
    else {
        primary.disabled = false;
        primary.textContent = 'Connect Google Sheets';
        primary.addEventListener('click', async () => {
            primary.disabled = true;
            message.textContent = 'Connecting…';
            const response = await chrome.runtime.sendMessage({ type: 'CONNECT_SHEETS' });
            if (response?.ok) {
                message.textContent = 'Connected';
                setTimeout(() => window.close(), 450);
            }
            else {
                message.textContent = response?.error || 'Could not connect.';
                primary.disabled = false;
            }
        });
    }
})();
