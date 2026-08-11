"use strict";
const SHEET_NAME = 'Mistakes';
const SHEET_HEADERS = [
    'Date',
    'Question Link',
    'Question',
    'Options',
    'Why Was It Incorrect',
    'Question Status',
    'Subject',
    'Chapter',
    'No. of Times Attempted',
    'No. of Times Wrong',
    'Accuracy',
    'Avg Time',
    'Option Marked',
    'Correct Answer',
    'Explanation',
    'Question ID'
];
function cleanForSheet(value) {
    return String(value ?? '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/\r\n/g, '\n')
        .trim();
}
function optionLabel(index) {
    return String.fromCharCode(65 + index);
}
function formatOptions(question) {
    if (question.type !== 'singleCorrect')
        return '';
    return (question.options || [])
        .map((option, index) => `${optionLabel(index)}. ${cleanForSheet(option.text || option.image || '')}`)
        .join('\n');
}
function formatMarkedAnswer(question, attempt) {
    if (question.type === 'numerical')
        return cleanForSheet(attempt.inputValue);
    const markedId = attempt.optionsMarked[0] || attempt.inputValue;
    const index = (question.options || []).findIndex((option) => option.id === markedId);
    if (index < 0)
        return cleanForSheet(markedId);
    const option = (question.options || [])[index];
    return `${optionLabel(index)}. ${cleanForSheet(option.text || option.image || '')}`;
}
function formatCorrectAnswer(question) {
    if (question.type === 'numerical')
        return cleanForSheet(question.correctValue);
    const options = question.options || [];
    const correct = options
        .map((option, index) => ({ option, index }))
        .filter(({ option }) => option.isCorrect)
        .map(({ option, index }) => `${optionLabel(index)}. ${cleanForSheet(option.text || option.image || '')}`);
    return correct.join('\n');
}
function accuracy(stats) {
    if (!stats.attempts)
        return '0%';
    const correct = stats.attempts - stats.wrong;
    const value = (correct / stats.attempts) * 100;
    return `${Number(value.toFixed(2))}%`;
}
function averageTime(stats) {
    if (!stats.timedAttempts)
        return '';
    const value = stats.totalTime / stats.timedAttempts;
    return `${Number(value.toFixed(2))} sec`;
}
function toSheetRow(stats) {
    return [
        stats.date,
        stats.questionUrl,
        stats.questionText,
        stats.optionsText,
        stats.reason,
        stats.status,
        stats.subject,
        stats.chapter,
        stats.attempts,
        stats.wrong,
        accuracy(stats),
        averageTime(stats),
        stats.optionMarked,
        stats.correctAnswer,
        stats.explanation,
        stats.questionId
    ];
}
async function readStore() {
    const { questionStats = {} } = await chrome.storage.local.get('questionStats');
    return questionStats;
}
async function writeStore(store) {
    await chrome.storage.local.set({ questionStats: store });
}
async function token(interactive) {
    const result = await chrome.identity.getAuthToken({ interactive });
    const accessToken = typeof result === 'string' ? result : result?.token;
    if (!accessToken)
        throw new Error('Google authorization was not granted.');
    return accessToken;
}
async function googleFetch(url, init = {}, interactive = false, retry = true) {
    const accessToken = await token(interactive);
    const headers = new Headers(init.headers || {});
    headers.set('Authorization', `Bearer ${accessToken}`);
    headers.set('Content-Type', 'application/json');
    const response = await fetch(url, { ...init, headers });
    if (response.status === 401 && retry) {
        await chrome.identity.removeCachedAuthToken({ token: accessToken });
        return googleFetch(url, init, interactive, false);
    }
    return response;
}
async function updateValues(spreadsheetId, range, values) {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?valueInputOption=RAW`;
    const response = await googleFetch(url, {
        method: 'PUT',
        body: JSON.stringify({ range, majorDimension: 'ROWS', values })
    });
    if (!response.ok)
        throw new Error(`Sheets update failed: ${response.status}`);
}
async function appendValues(spreadsheetId, range, values) {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;
    const response = await googleFetch(url, {
        method: 'POST',
        body: JSON.stringify({ range, majorDimension: 'ROWS', values })
    });
    if (!response.ok)
        throw new Error(`Sheets append failed: ${response.status}`);
}
async function findQuestionRow(spreadsheetId, questionId) {
    const range = `${SHEET_NAME}!P2:P`;
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?majorDimension=ROWS`;
    const response = await googleFetch(url);
    if (!response.ok)
        throw new Error(`Sheets read failed: ${response.status}`);
    const body = await response.json();
    const values = Array.isArray(body.values) ? body.values : [];
    for (let index = 0; index < values.length; index += 1) {
        if (String(values[index]?.[0] ?? '') === questionId)
            return index + 2;
    }
    return null;
}
async function ensureSpreadsheet(interactive = false) {
    const stored = await chrome.storage.local.get(['spreadsheetId', 'spreadsheetUrl']);
    if (stored.spreadsheetId) {
        return {
            spreadsheetId: stored.spreadsheetId,
            spreadsheetUrl: stored.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${stored.spreadsheetId}/edit`
        };
    }
    const response = await googleFetch('https://sheets.googleapis.com/v4/spreadsheets', {
        method: 'POST',
        body: JSON.stringify({
            properties: { title: 'MARKS Mistakes' },
            sheets: [{ properties: { title: SHEET_NAME, gridProperties: { frozenRowCount: 1 } } }]
        })
    }, interactive);
    if (!response.ok)
        throw new Error(`Spreadsheet creation failed: ${response.status}`);
    const spreadsheet = await response.json();
    const spreadsheetId = String(spreadsheet.spreadsheetId || '');
    if (!spreadsheetId)
        throw new Error('Google Sheets did not return a spreadsheet ID.');
    const spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
    await updateValues(spreadsheetId, `${SHEET_NAME}!A1:P1`, [SHEET_HEADERS]);
    await chrome.storage.local.set({ spreadsheetId, spreadsheetUrl });
    return { spreadsheetId, spreadsheetUrl };
}
async function upsertStatsRow(stats) {
    if (!stats.wasEverWrong)
        return;
    const { spreadsheetId } = await ensureSpreadsheet(false);
    const row = await findQuestionRow(spreadsheetId, stats.questionId);
    const values = [toSheetRow(stats)];
    if (row) {
        await updateValues(spreadsheetId, `${SHEET_NAME}!A${row}:P${row}`, values);
    }
    else {
        await appendValues(spreadsheetId, `${SHEET_NAME}!A:P`, values);
    }
    await chrome.storage.local.set({ lastSyncAt: Date.now() });
}
async function safeSync(stats) {
    try {
        await upsertStatsRow(stats);
    }
    catch (error) {
        console.warn('[MARKS Mistake Logger] Google Sheets sync deferred:', error);
    }
}
async function recordAttempt(message) {
    const store = await readStore();
    const questionId = message.question._id;
    const previous = store[questionId];
    const timeTaken = typeof message.attempt.timeTaken === 'number' && message.attempt.timeTaken >= 0
        ? message.attempt.timeTaken
        : null;
    const stats = previous || {
        questionId,
        attempts: 0,
        wrong: 0,
        totalTime: 0,
        timedAttempts: 0,
        wasEverWrong: false,
        status: '',
        date: '',
        questionUrl: '',
        questionText: '',
        optionsText: '',
        reason: '',
        subject: '',
        chapter: '',
        optionMarked: '',
        correctAnswer: '',
        explanation: ''
    };
    stats.attempts += 1;
    if (timeTaken !== null) {
        stats.totalTime += timeTaken;
        stats.timedAttempts += 1;
    }
    stats.questionUrl = message.questionUrl || stats.questionUrl;
    stats.questionText = cleanForSheet(message.question.question?.text || message.question.question?.image || '');
    stats.optionsText = formatOptions(message.question);
    stats.optionMarked = formatMarkedAnswer(message.question, message.attempt);
    stats.correctAnswer = formatCorrectAnswer(message.question);
    stats.explanation = cleanForSheet(message.question.solution?.text || message.question.solution?.image || '');
    if (message.subject)
        stats.subject = message.subject;
    if (message.chapter)
        stats.chapter = message.chapter;
    if (message.result === 'incorrect') {
        stats.wrong += 1;
        stats.wasEverWrong = true;
        stats.status = 'Wrong';
        stats.date = message.date;
        stats.reason = '';
    }
    else if (stats.wasEverWrong) {
        stats.status = 'Resolved';
    }
    store[questionId] = stats;
    await writeStore(store);
    // A wrong answer is saved immediately even if the student dismisses the reason card.
    // The reason card simply updates the same row afterwards.
    if (stats.wasEverWrong)
        void safeSync(stats);
    return { needsReason: message.result === 'incorrect' };
}
async function setReason(questionId, reason) {
    const store = await readStore();
    const stats = store[questionId];
    if (!stats || !stats.wasEverWrong)
        return;
    stats.reason = reason.trim();
    store[questionId] = stats;
    await writeStore(store);
    await safeSync(stats);
}
async function flushMistakes() {
    const store = await readStore();
    for (const stats of Object.values(store)) {
        if (stats.wasEverWrong)
            await safeSync(stats);
    }
}
async function popupState() {
    const store = await readStore();
    const saved = Object.values(store).filter((stats) => stats.wasEverWrong).length;
    const wrong = Object.values(store).filter((stats) => stats.wasEverWrong && stats.status === 'Wrong').length;
    const stored = await chrome.storage.local.get(['spreadsheetId', 'spreadsheetUrl', 'lastSyncAt']);
    return {
        connected: Boolean(stored.spreadsheetId),
        saved,
        wrong,
        spreadsheetUrl: stored.spreadsheetUrl || '',
        lastSyncAt: stored.lastSyncAt || null
    };
}
chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
        void chrome.tabs.create({ url: chrome.runtime.getURL('onboarding/onboarding.html') });
    }
});
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    (async () => {
        switch (message?.type) {
            case 'ATTEMPT_RECORDED':
                sendResponse(await recordAttempt(message.payload));
                break;
            case 'SET_REASON':
                await setReason(String(message.payload?.questionId || ''), String(message.payload?.reason || ''));
                sendResponse({ ok: true });
                break;
            case 'CONNECT_SHEETS': {
                const sheet = await ensureSpreadsheet(true);
                await flushMistakes();
                sendResponse({ ok: true, ...sheet });
                break;
            }
            case 'GET_POPUP_STATE':
                sendResponse(await popupState());
                break;
            default:
                sendResponse({ ok: false });
        }
    })().catch((error) => {
        console.error('[MARKS Mistake Logger]', error);
        sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
    });
    return true;
});
