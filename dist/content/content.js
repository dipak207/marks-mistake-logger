"use strict";
(() => {
    const SOURCE = 'marks-mistake-logger';
    const SUPPORTED_TYPES = new Set(['singleCorrect', 'numerical']);
    const questions = new Map();
    const labels = new Map();
    let processingAttempt = false;
    function currentQuestionId() {
        const match = location.pathname.match(/\/question\/([^/?#]+)/i);
        return match ? decodeURIComponent(match[1]) : null;
    }
    function normalizeNumeric(value) {
        const raw = String(value ?? '').trim();
        if (!raw)
            return '';
        const numberValue = Number(raw);
        return Number.isFinite(numberValue) ? String(numberValue) : raw;
    }
    function computeResult(question, attempt) {
        if (question.type === 'singleCorrect') {
            const marked = attempt.optionsMarked.length
                ? attempt.optionsMarked
                : attempt.inputValue
                    ? [attempt.inputValue]
                    : [];
            const correct = (question.options || []).filter((option) => option.isCorrect).map((option) => option.id);
            if (!marked.length || !correct.length)
                return null;
            return marked.length === correct.length && marked.every((id) => correct.includes(id))
                ? 'correct'
                : 'incorrect';
        }
        if (question.type === 'numerical') {
            if (question.correctValue === null || question.correctValue === undefined)
                return null;
            return normalizeNumeric(attempt.inputValue) === normalizeNumeric(question.correctValue)
                ? 'correct'
                : 'incorrect';
        }
        return null;
    }
    function waitForResult(question, attempt) {
        return new Promise((resolve) => {
            let settled = false;
            const finish = (result) => {
                if (settled)
                    return;
                settled = true;
                observer.disconnect();
                clearTimeout(timeout);
                resolve(result);
            };
            const resultFromNode = (node) => {
                if (!node)
                    return null;
                const status = node.getAttribute('data-status');
                return status === 'correct' || status === 'incorrect' ? status : null;
            };
            const observer = new MutationObserver((mutations) => {
                for (const mutation of mutations) {
                    if (mutation.type === 'attributes' && mutation.target instanceof Element) {
                        const result = resultFromNode(mutation.target);
                        if (result)
                            return finish(result);
                    }
                    for (const added of mutation.addedNodes) {
                        if (!(added instanceof Element))
                            continue;
                        const direct = resultFromNode(added);
                        if (direct)
                            return finish(direct);
                        const nested = added.querySelector('[data-status="correct"], [data-status="incorrect"]');
                        const result = resultFromNode(nested);
                        if (result)
                            return finish(result);
                    }
                }
            });
            observer.observe(document.documentElement, {
                subtree: true,
                childList: true,
                attributes: true,
                attributeFilter: ['data-status']
            });
            const timeout = window.setTimeout(() => {
                const computed = computeResult(question, attempt);
                if (computed)
                    return finish(computed);
                const visible = document.querySelector('[data-status="correct"], [data-status="incorrect"]');
                const domResult = resultFromNode(visible);
                finish(domResult || 'incorrect');
            }, 1800);
        });
    }
    async function waitForQuestion(id, timeoutMs = 1600) {
        const existing = questions.get(id);
        if (existing)
            return existing;
        const started = Date.now();
        while (Date.now() - started < timeoutMs) {
            await new Promise((resolve) => setTimeout(resolve, 50));
            const question = questions.get(id);
            if (question)
                return question;
        }
        return null;
    }
    function localIsoDate() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
    async function processAttempt(attempt) {
        if (processingAttempt)
            return;
        processingAttempt = true;
        try {
            const questionId = currentQuestionId();
            if (!questionId)
                return;
            const question = await waitForQuestion(questionId);
            if (!question || !SUPPORTED_TYPES.has(question.type))
                return;
            const result = await waitForResult(question, attempt);
            const response = await chrome.runtime.sendMessage({
                type: 'ATTEMPT_RECORDED',
                payload: {
                    question,
                    attempt,
                    result,
                    date: localIsoDate(),
                    questionUrl: location.href,
                    subject: labels.get(attempt.subjectContainer) || '',
                    chapter: labels.get(attempt.chapterContainer) || ''
                }
            });
            if (result === 'incorrect' && response?.needsReason) {
                showReasonOverlay(questionId);
            }
        }
        finally {
            processingAttempt = false;
        }
    }
    function showToast(message) {
        const existing = document.getElementById('mml-toast-host');
        existing?.remove();
        const host = document.createElement('div');
        host.id = 'mml-toast-host';
        Object.assign(host.style, {
            position: 'fixed',
            right: '20px',
            bottom: '96px',
            zIndex: '2147483647'
        });
        const shadow = host.attachShadow({ mode: 'open' });
        shadow.innerHTML = `
      <style>
        :host { all: initial; }
        .toast {
          font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          background: #111c2d;
          color: #fff;
          font-size: 13px;
          line-height: 18px;
          padding: 9px 12px;
          border-radius: 6px;
          box-shadow: 0 4px 12px rgba(15, 23, 42, .16);
        }
      </style>
      <div class="toast">${message}</div>
    `;
        document.documentElement.appendChild(host);
        window.setTimeout(() => host.remove(), 1600);
    }
    function showReasonOverlay(questionId) {
        document.getElementById('mml-overlay-host')?.remove();
        const host = document.createElement('div');
        host.id = 'mml-overlay-host';
        Object.assign(host.style, {
            position: 'fixed',
            right: '20px',
            bottom: '96px',
            width: 'min(360px, calc(100vw - 24px))',
            zIndex: '2147483647'
        });
        const shadow = host.attachShadow({ mode: 'open' });
        shadow.innerHTML = `
      <style>
        :host { all: initial; }
        * { box-sizing: border-box; }
        .card {
          font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          color: #111c2d;
          background: #ffffff;
          border: 1px solid #c3c6d7;
          border-radius: 8px;
          padding: 12px;
          box-shadow: 0 4px 12px rgba(15, 23, 42, .10);
        }
        .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
        h2 { margin: 0; font-size: 16px; line-height: 24px; font-weight: 600; letter-spacing: -.01em; }
        .close {
          border: 0; background: transparent; color: #434655; padding: 2px 4px; cursor: pointer;
          font-size: 20px; line-height: 20px; border-radius: 4px;
        }
        .close:hover { background: #f0f3ff; }
        .chips { display: flex; flex-wrap: wrap; gap: 5px; }
        .chip {
          appearance: none;
          border: 1px solid #c3c6d7;
          background: #f0f3ff;
          color: #434655;
          border-radius: 4px;
          padding: 6px 10px;
          font-size: 12px;
          line-height: 16px;
          font-weight: 500;
          cursor: pointer;
        }
        .chip:hover { background: #e7eeff; }
        .chip.active { background: #e7eeff; border-color: #004ac6; color: #004ac6; }
        .other-wrap { display: none; margin-top: 8px; }
        .other-wrap.show { display: block; }
        textarea {
          width: 100%; min-height: 58px; resize: vertical;
          border: 1px solid #c3c6d7; border-radius: 4px; padding: 8px;
          color: #111c2d; background: #fff;
          font: 400 12px/16px Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          outline: none;
        }
        textarea:focus { border-color: #004ac6; box-shadow: 0 0 0 2px rgba(0, 74, 198, .12); }
        .actions { display: flex; justify-content: flex-end; margin-top: 12px; }
        .save {
          border: 0; border-radius: 4px; padding: 8px 12px;
          background: #004ac6; color: white;
          font-size: 12px; line-height: 16px; font-weight: 600;
          cursor: pointer;
        }
        .save:disabled { opacity: .45; cursor: default; }
      </style>
      <div class="card" role="dialog" aria-label="Mistake reason">
        <div class="header">
          <h2>What went wrong?</h2>
          <button class="close" aria-label="Close">×</button>
        </div>
        <div class="chips">
          ${['Concept', 'Calculation', 'Formula', 'Misread', 'Wrong approach', 'Guess', 'Other']
            .map((reason) => `<button class="chip" data-reason="${reason}">${reason}</button>`)
            .join('')}
        </div>
        <div class="other-wrap">
          <textarea maxlength="240" placeholder="Write the error..."></textarea>
        </div>
        <div class="actions">
          <button class="save" disabled>Save mistake</button>
        </div>
      </div>
    `;
        document.documentElement.appendChild(host);
        const chips = [...shadow.querySelectorAll('.chip')];
        const otherWrap = shadow.querySelector('.other-wrap');
        const textarea = shadow.querySelector('textarea');
        const saveButton = shadow.querySelector('.save');
        const closeButton = shadow.querySelector('.close');
        let selected = '';
        const refreshSaveState = () => {
            saveButton.disabled = !selected || (selected === 'Other' && !textarea.value.trim());
        };
        for (const chip of chips) {
            chip.addEventListener('click', () => {
                selected = chip.dataset.reason || '';
                chips.forEach((item) => item.classList.toggle('active', item === chip));
                otherWrap.classList.toggle('show', selected === 'Other');
                if (selected === 'Other')
                    textarea.focus();
                refreshSaveState();
            });
        }
        textarea.addEventListener('input', refreshSaveState);
        closeButton.addEventListener('click', () => host.remove());
        saveButton.addEventListener('click', async () => {
            const reason = selected === 'Other' ? textarea.value.trim() : selected;
            if (!reason)
                return;
            saveButton.disabled = true;
            await chrome.runtime.sendMessage({ type: 'SET_REASON', payload: { questionId, reason } });
            host.remove();
            showToast('✓ Mistake saved to Google Sheets');
        });
    }
    window.addEventListener('message', (event) => {
        if (event.source !== window)
            return;
        const message = event.data;
        if (!message || message.source !== SOURCE)
            return;
        if (message.type === 'QUESTION_DATA') {
            const question = message.payload;
            if (question?._id && SUPPORTED_TYPES.has(question.type))
                questions.set(question._id, question);
            return;
        }
        if (message.type === 'ENTITY_LABELS' && message.payload && typeof message.payload === 'object') {
            for (const [id, label] of Object.entries(message.payload)) {
                if (typeof label === 'string' && label.trim())
                    labels.set(id, label.trim());
            }
            return;
        }
        if (message.type === 'ATTEMPT_PAYLOAD') {
            void processAttempt(message.payload);
        }
    });
})();
