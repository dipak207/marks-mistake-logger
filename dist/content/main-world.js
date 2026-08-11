"use strict";
(() => {
    const SOURCE = 'marks-mistake-logger';
    const MAX_SCAN_NODES = 12000;
    function emit(type, payload) {
        window.postMessage({ source: SOURCE, type, payload }, location.origin);
    }
    function isObject(value) {
        return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
    }
    function parseBody(body) {
        if (!body)
            return null;
        if (typeof body === 'string') {
            try {
                return JSON.parse(body);
            }
            catch {
                return null;
            }
        }
        if (body instanceof URLSearchParams) {
            return Object.fromEntries(body.entries());
        }
        return null;
    }
    function looksLikeAttempt(value) {
        if (!isObject(value))
            return false;
        const hasAnswer = 'inputValue' in value || Array.isArray(value.optionsMarked);
        const isAnswered = value.status === 'answered';
        const isMarksModule = typeof value.moduleId === 'string' && value.moduleId.startsWith('cpyqb');
        return hasAnswer && isAnswered && isMarksModule;
    }
    function emitAttempt(value) {
        emit('ATTEMPT_PAYLOAD', {
            inputValue: typeof value.inputValue === 'string' ? value.inputValue : '',
            optionsMarked: Array.isArray(value.optionsMarked)
                ? value.optionsMarked.filter((item) => typeof item === 'string')
                : [],
            startedAt: typeof value.startedAt === 'string' ? value.startedAt : '',
            timeTaken: typeof value.timeTaken === 'number' ? value.timeTaken : null,
            status: value.status === 'answered' ? 'answered' : '',
            subjectContainer: typeof value.subjectContainer === 'string' ? value.subjectContainer : '',
            chapterContainer: typeof value.chapterContainer === 'string' ? value.chapterContainer : ''
        });
    }
    function inspectRequestBody(body) {
        const parsed = parseBody(body);
        if (looksLikeAttempt(parsed))
            emitAttempt(parsed);
    }
    function collectLabels(root) {
        const labels = {};
        const seen = new WeakSet();
        const stack = [root];
        let scanned = 0;
        while (stack.length && scanned < MAX_SCAN_NODES) {
            const current = stack.pop();
            if (!current || typeof current !== 'object')
                continue;
            if (seen.has(current))
                continue;
            seen.add(current);
            scanned += 1;
            if (Array.isArray(current)) {
                for (const item of current)
                    stack.push(item);
                continue;
            }
            const object = current;
            const idCandidate = typeof object._id === 'string'
                ? object._id
                : typeof object.id === 'string'
                    ? object.id
                    : null;
            const labelCandidate = typeof object.name === 'string'
                ? object.name
                : typeof object.title === 'string'
                    ? object.title
                    : null;
            if (idCandidate && labelCandidate && labelCandidate.trim()) {
                labels[idCandidate] = labelCandidate.trim();
            }
            for (const value of Object.values(object)) {
                if (value && typeof value === 'object')
                    stack.push(value);
            }
        }
        return labels;
    }
    function inspectJsonResponse(data) {
        if (!isObject(data))
            return;
        const dataNode = isObject(data.data) ? data.data : null;
        const question = dataNode && isObject(dataNode.question) ? dataNode.question : null;
        if (question &&
            typeof question._id === 'string' &&
            (question.type === 'singleCorrect' || question.type === 'numerical')) {
            emit('QUESTION_DATA', question);
        }
        const labels = collectLabels(data);
        if (Object.keys(labels).length)
            emit('ENTITY_LABELS', labels);
    }
    // fetch interception
    const nativeFetch = window.fetch.bind(window);
    window.fetch = async (...args) => {
        try {
            const request = args[0];
            const init = args[1];
            if (init?.body) {
                inspectRequestBody(init.body);
            }
            else if (request instanceof Request) {
                request
                    .clone()
                    .text()
                    .then(inspectRequestBody)
                    .catch(() => undefined);
            }
        }
        catch {
            // Never interfere with the host page.
        }
        const response = await nativeFetch(...args);
        try {
            const clone = response.clone();
            const contentType = clone.headers.get('content-type') || '';
            if (contentType.includes('application/json')) {
                clone
                    .json()
                    .then(inspectJsonResponse)
                    .catch(() => undefined);
            }
        }
        catch {
            // Ignore response parsing failures.
        }
        return response;
    };
    // XHR interception (MARKS currently uses XHR for the relevant requests).
    const nativeOpen = XMLHttpRequest.prototype.open;
    const nativeSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (method, url, async, username, password) {
        this.__mmlUrl = String(url);
        nativeOpen.call(this, method, url, async ?? true, username ?? null, password ?? null);
    };
    XMLHttpRequest.prototype.send = function (body) {
        try {
            inspectRequestBody(body);
        }
        catch {
            // Never interfere with the host page.
        }
        this.addEventListener('load', () => {
            try {
                let data = null;
                if (this.responseType === 'json') {
                    data = this.response;
                }
                else if (!this.responseType || this.responseType === 'text') {
                    const text = this.responseText;
                    if (text && (text.startsWith('{') || text.startsWith('[')))
                        data = JSON.parse(text);
                }
                if (data)
                    inspectJsonResponse(data);
            }
            catch {
                // Ignore non-JSON responses.
            }
        }, { once: true });
        nativeSend.call(this, body ?? null);
    };
})();
