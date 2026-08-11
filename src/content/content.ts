declare var chrome: any;

(() => {
  const SOURCE = 'marks-mistake-logger';
  const SUPPORTED_TYPES = new Set(['singleCorrect', 'numerical']);

  type MarksOption = {
    id: string;
    text?: string | null;
    isCorrect?: boolean;
    image?: string | null;
  };

  type MarksQuestion = {
    _id: string;
    type: 'singleCorrect' | 'numerical';
    question?: { text?: string | null; image?: string | null };
    options?: MarksOption[];
    correctValue?: string | number | null;
    solution?: { text?: string | null; image?: string | null };
  };

  type AttemptPayload = {
    inputValue: string;
    optionsMarked: string[];
    startedAt: string;
    timeTaken: number | null;
    status: string;
    subjectContainer: string;
    chapterContainer: string;
  };

  type Result = 'correct' | 'incorrect';

  const questions = new Map<string, MarksQuestion>();
  const labels = new Map<string, string>();
  let processingAttempt = false;

  function currentQuestionId(): string | null {
    const match = location.pathname.match(/\/question\/([^/?#]+)/i);
    return match ? decodeURIComponent(match[1]) : null;
  }

  function normalizeNumeric(value: unknown): string {
    const raw = String(value ?? '').trim();
    if (!raw) return '';
    const numberValue = Number(raw);
    return Number.isFinite(numberValue) ? String(numberValue) : raw;
  }

  function computeResult(question: MarksQuestion, attempt: AttemptPayload): Result | null {
    if (question.type === 'singleCorrect') {
      const marked = attempt.optionsMarked.length
        ? attempt.optionsMarked
        : attempt.inputValue
          ? [attempt.inputValue]
          : [];
      const correct = (question.options || []).filter((option) => option.isCorrect).map((option) => option.id);
      if (!marked.length || !correct.length) return null;
      return marked.length === correct.length && marked.every((id) => correct.includes(id))
        ? 'correct'
        : 'incorrect';
    }

    if (question.type === 'numerical') {
      if (question.correctValue === null || question.correctValue === undefined) return null;
      return normalizeNumeric(attempt.inputValue) === normalizeNumeric(question.correctValue)
        ? 'correct'
        : 'incorrect';
    }

    return null;
  }

  function waitForResult(question: MarksQuestion, attempt: AttemptPayload): Promise<Result> {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (result: Result) => {
        if (settled) return;
        settled = true;
        observer.disconnect();
        clearTimeout(timeout);
        resolve(result);
      };

      const resultFromNode = (node: Element | null): Result | null => {
        if (!node) return null;
        const status = node.getAttribute('data-status');
        return status === 'correct' || status === 'incorrect' ? status : null;
      };

      const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (mutation.type === 'attributes' && mutation.target instanceof Element) {
            const result = resultFromNode(mutation.target);
            if (result) return finish(result);
          }
          for (const added of mutation.addedNodes) {
            if (!(added instanceof Element)) continue;
            const direct = resultFromNode(added);
            if (direct) return finish(direct);
            const nested = added.querySelector('[data-status="correct"], [data-status="incorrect"]');
            const result = resultFromNode(nested);
            if (result) return finish(result);
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
        if (computed) return finish(computed);

        const visible = document.querySelector('[data-status="correct"], [data-status="incorrect"]');
        const domResult = resultFromNode(visible);
        finish(domResult || 'incorrect');
      }, 1800);
    });
  }

  async function waitForQuestion(id: string, timeoutMs = 1600): Promise<MarksQuestion | null> {
    const existing = questions.get(id);
    if (existing) return existing;

    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      const question = questions.get(id);
      if (question) return question;
    }
    return null;
  }

  function localIsoDate(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  async function processAttempt(attempt: AttemptPayload): Promise<void> {
    if (processingAttempt) return;
    processingAttempt = true;

    try {
      const questionId = currentQuestionId();
      if (!questionId) return;

      const question = await waitForQuestion(questionId);
      if (!question || !SUPPORTED_TYPES.has(question.type)) return;

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
    } finally {
      processingAttempt = false;
    }
  }

  function showToast(message: string): void {
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

  function showReasonOverlay(questionId: string): void {
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

    const chips = [...shadow.querySelectorAll<HTMLButtonElement>('.chip')];
    const otherWrap = shadow.querySelector<HTMLDivElement>('.other-wrap')!;
    const textarea = shadow.querySelector<HTMLTextAreaElement>('textarea')!;
    const saveButton = shadow.querySelector<HTMLButtonElement>('.save')!;
    const closeButton = shadow.querySelector<HTMLButtonElement>('.close')!;
    let selected = '';

    const refreshSaveState = () => {
      saveButton.disabled = !selected || (selected === 'Other' && !textarea.value.trim());
    };

    for (const chip of chips) {
      chip.addEventListener('click', () => {
        selected = chip.dataset.reason || '';
        chips.forEach((item) => item.classList.toggle('active', item === chip));
        otherWrap.classList.toggle('show', selected === 'Other');
        if (selected === 'Other') textarea.focus();
        refreshSaveState();
      });
    }

    textarea.addEventListener('input', refreshSaveState);
    closeButton.addEventListener('click', () => host.remove());

    saveButton.addEventListener('click', async () => {
      const reason = selected === 'Other' ? textarea.value.trim() : selected;
      if (!reason) return;

      saveButton.disabled = true;
      await chrome.runtime.sendMessage({ type: 'SET_REASON', payload: { questionId, reason } });
      host.remove();
      showToast('✓ Mistake saved to Google Sheets');
    });
  }

  window.addEventListener('message', (event: MessageEvent) => {
    if (event.source !== window) return;
    const message = event.data;
    if (!message || message.source !== SOURCE) return;

    if (message.type === 'QUESTION_DATA') {
      const question = message.payload as MarksQuestion;
      if (question?._id && SUPPORTED_TYPES.has(question.type)) questions.set(question._id, question);
      return;
    }

    if (message.type === 'ENTITY_LABELS' && message.payload && typeof message.payload === 'object') {
      for (const [id, label] of Object.entries(message.payload as Record<string, unknown>)) {
        if (typeof label === 'string' && label.trim()) labels.set(id, label.trim());
      }
      return;
    }

    if (message.type === 'ATTEMPT_PAYLOAD') {
      void processAttempt(message.payload as AttemptPayload);
    }
  });
})();
