(function () {

    // ===== STORAGE =====
    // Map: normalizedUrl -> { sources: Set, methods: Set, rawUrls: Set, firstSeen: Date }
    const results = new Map();

    function addResult(rawUrl, source, method = '-') {
        if (!rawUrl || typeof rawUrl !== 'string' || rawUrl.trim() === '') return;
        const normalized = normalizeUrl(rawUrl);
        if (!normalized || normalized.length < 2) return;

        if (!results.has(normalized)) {
            results.set(normalized, {
                sources: new Set(),
                methods: new Set(),
                rawUrls: new Set(),
                firstSeen: new Date().toISOString()
            });
        }
        const entry = results.get(normalized);
        entry.sources.add(source);
        entry.methods.add(method.toUpperCase());
        entry.rawUrls.add(rawUrl);
    }


    // ===== 1. XHR INTERCEPTION =====
    const originalXHROpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url) {
        addResult(url, 'XHR', method);
        return originalXHROpen.apply(this, arguments);
    };


    // ===== 2. FETCH INTERCEPTION =====
    const originalFetch = window.fetch;
    window.fetch = function (input, init) {
        const url = input instanceof Request ? input.url : String(input);
        const method = (init && init.method) || (input instanceof Request && input.method) || 'GET';
        addResult(url, 'Fetch', method);
        return originalFetch.apply(this, arguments);
    };


    // ===== 3. WEBSOCKET INTERCEPTION =====
    const OriginalWebSocket = window.WebSocket;
    window.WebSocket = function (url, protocols) {
        addResult(url, 'WebSocket', 'WS');
        return protocols ? new OriginalWebSocket(url, protocols) : new OriginalWebSocket(url);
    };
    Object.assign(window.WebSocket, OriginalWebSocket);


    // ===== 4. BEACON INTERCEPTION =====
    const originalBeacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = function (url, data) {
        addResult(url, 'Beacon', 'POST');
        return originalBeacon(url, data);
    };


    // ===== 5. EVENTSOURCE INTERCEPTION =====
    const OriginalEventSource = window.EventSource;
    window.EventSource = function (url, config) {
        addResult(url, 'EventSource', 'GET');
        return config ? new OriginalEventSource(url, config) : new OriginalEventSource(url);
    };
    Object.assign(window.EventSource, OriginalEventSource);


    // ===== 6. WINDOW.OPEN INTERCEPTION =====
    const originalWindowOpen = window.open;
    window.open = function (url) {
        if (url) addResult(url, 'window.open', 'GET');
        return originalWindowOpen.apply(this, arguments);
    };


    // ===== 7. ANCHOR CLICK INTERCEPTION =====
    document.addEventListener('click', function (e) {
        const anchor = e.target.closest('a[href]');
        if (anchor) addResult(anchor.href, 'AnchorClick', 'GET');
    }, true);


    // ===== 8. STATIC ANALYSIS (regex) =====
    const ENDPOINT_REGEX = /https?:\/\/[^\s"'`<>\]\[(){},]+|(?<=['"`\/])\/[a-zA-Z0-9_\-][a-zA-Z0-9_?&=\/\-#.]*(?=['"`\s])/g;

    function scanText(text, source) {
        const matches = text.matchAll(ENDPOINT_REGEX);
        for (const match of matches) {
            addResult(match[0], source);
        }
    }

    // Inline scripts
    const scripts = document.getElementsByTagName('script');
    for (let i = 0; i < scripts.length; i++) {
        if (!scripts[i].src && scripts[i].innerText) {
            scanText(scripts[i].innerText, 'StaticInlineJS');
        }
    }

    // External scripts
    for (let i = 0; i < scripts.length; i++) {
        if (scripts[i].src) {
            fetch(scripts[i].src)
                .then(r => r.text())
                .then(content => scanText(content, 'StaticExternalJS'))
                .catch(() => { });
        }
    }

    // HTML page content
    scanText(document.documentElement.outerHTML, 'StaticHTML');


    // ===== 9. MUTATION OBSERVER (dynamically injected scripts) =====
    new MutationObserver(mutations => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node.tagName === 'SCRIPT') {
                    if (node.src) {
                        fetch(node.src)
                            .then(r => r.text())
                            .then(content => scanText(content, 'DynamicExternalJS'))
                            .catch(() => { });
                    } else if (node.innerText) {
                        scanText(node.innerText, 'DynamicInlineJS');
                    }
                }
            }
        }
    }).observe(document, { childList: true, subtree: true });


    // ===== 10. NORMALIZE URL =====
    function normalizeUrl(url) {
        if (!url || typeof url !== 'string') return '';
        try {
            const parsed = new URL(url, location.origin);
            return (parsed.pathname).replace(/\/$/, '').toLowerCase() || '/';
        } catch {
            return url.split('?')[0].toLowerCase();
        }
    }


    // ===== 11. EXPORT (no external dependencies — CSP safe) =====
    // Encodes a single CSV cell value: wraps in quotes and escapes inner quotes
    function csvCell(val) {
        const s = String(val ?? '').replace(/"/g, '""');
        return `"${s}"`;
    }

    function exportToCSV() {
        const header = ['#', 'Endpoint', 'HTTP Methods', 'Sources', 'Raw URLs', 'First Seen'];
        const lines = [header.map(csvCell).join(',')];
        let idx = 1;
        results.forEach((entry, endpoint) => {
            lines.push([
                idx++,
                endpoint,
                [...entry.methods].join(', '),
                [...entry.sources].join(', '),
                [...entry.rawUrls].join(' | '),
                entry.firstSeen
            ].map(csvCell).join(','));
        });

        const csv = '\uFEFF' + lines.join('\r\n'); // BOM ensures Excel opens with correct encoding
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `endpoints_${location.hostname}_${Date.now()}.csv`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }


    // ===== 12. UI =====
    function displayResults() {
        document.getElementById('__ep_scanner__')?.remove();

        const panel = document.createElement('div');
        panel.id = '__ep_scanner__';
        panel.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 50vh;
            background: #0d1117; color: #c9d1d9; font-family: monospace;
            font-size: 12px; z-index: 2147483647; display: flex;
            flex-direction: column; border-bottom: 2px solid #30363d;
            box-shadow: 0 4px 24px rgba(0,0,0,0.5);
        `;

        // --- Toolbar ---
        const toolbar = document.createElement('div');
        toolbar.style.cssText = `
            display: flex; align-items: center; gap: 10px;
            padding: 8px 12px; background: #161b22;
            border-bottom: 1px solid #30363d; flex-shrink: 0;
        `;

        const title = document.createElement('span');
        title.style.cssText = 'color:#58a6ff; font-weight:bold; font-size:13px; flex:1;';
        title.textContent = `🔍 Endpoint Scanner — ${results.size} endpoints discovered on ${location.hostname}`;

        const filterInput = document.createElement('input');
        filterInput.placeholder = 'Filter endpoints…';
        filterInput.style.cssText = `
            background: #0d1117; border: 1px solid #30363d; color: #c9d1d9;
            padding: 4px 8px; border-radius: 4px; font-size: 12px; width: 200px;
        `;

        const exportBtn = document.createElement('button');
        exportBtn.textContent = '⬇ Export CSV';
        exportBtn.style.cssText = `
            background: #238636; color: #fff; border: none; padding: 5px 12px;
            border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: bold;
        `;
        exportBtn.onclick = exportToCSV;

        const closeBtn = document.createElement('button');
        closeBtn.textContent = '✕';
        closeBtn.style.cssText = `
            background: #da3633; color: #fff; border: none; padding: 5px 10px;
            border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: bold;
        `;
        closeBtn.onclick = () => panel.remove();

        toolbar.append(title, filterInput, exportBtn, closeBtn);

        // --- Table ---
        const tableWrap = document.createElement('div');
        tableWrap.style.cssText = 'overflow: auto; flex: 1;';

        const table = document.createElement('table');
        table.style.cssText = `
            width: 100%; border-collapse: collapse; font-size: 11px;
        `;

        const thead = document.createElement('thead');
        thead.innerHTML = `
            <tr style="background:#161b22; position:sticky; top:0;">
                <th style="padding:6px 10px; text-align:left; color:#8b949e; border-bottom:1px solid #30363d; width:30px">#</th>
                <th style="padding:6px 10px; text-align:left; color:#8b949e; border-bottom:1px solid #30363d;">Endpoint</th>
                <th style="padding:6px 10px; text-align:left; color:#8b949e; border-bottom:1px solid #30363d; width:90px">Methods</th>
                <th style="padding:6px 10px; text-align:left; color:#8b949e; border-bottom:1px solid #30363d;">Sources</th>
                <th style="padding:6px 10px; text-align:left; color:#8b949e; border-bottom:1px solid #30363d; width:180px">First Seen</th>
            </tr>
        `;
        table.appendChild(thead);

        const tbody = document.createElement('tbody');

        function renderRows(filter = '') {
            tbody.innerHTML = '';
            let idx = 1;
            results.forEach((entry, endpoint) => {
                if (filter && !endpoint.includes(filter.toLowerCase())) return;
                const tr = document.createElement('tr');
                tr.style.cssText = 'border-bottom:1px solid #21262d;';
                tr.onmouseenter = () => tr.style.background = '#161b22';
                tr.onmouseleave = () => tr.style.background = '';

                const methods = [...entry.methods].join(', ');
                const sources = [...entry.sources].join(', ');
                const methodColor = methods.includes('GET') ? '#3fb950' : methods.includes('POST') ? '#f78166' : '#d29922';

                tr.innerHTML = `
                    <td style="padding:5px 10px; color:#8b949e;">${idx++}</td>
                    <td style="padding:5px 10px; color:#58a6ff; word-break:break-all;">${endpoint}</td>
                    <td style="padding:5px 10px; color:${methodColor};">${methods}</td>
                    <td style="padding:5px 10px; color:#8b949e;">${sources}</td>
                    <td style="padding:5px 10px; color:#8b949e;">${new Date(entry.firstSeen).toLocaleTimeString()}</td>
                `;
                tbody.appendChild(tr);
            });
        }

        filterInput.addEventListener('input', () => renderRows(filterInput.value));
        renderRows();

        table.appendChild(tbody);
        tableWrap.appendChild(table);
        panel.append(toolbar, tableWrap);
        document.body.appendChild(panel);
    }

    // ===== 13. TRIGGER =====
    // Press F2 to open/refresh the panel at any time
    document.addEventListener('keydown', e => {
        if (e.key === 'F2') displayResults();
    });

    // Also show after 5 seconds automatically on first load
    setTimeout(displayResults, 5000);

    console.log('[EndpointScanner] Running. Press F2 at any time to refresh results.');

})();
