(function() {
    const results = new Set();

    // ===== 1. DYNAMIC MONITORING =====
    const originalXHROpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url) {
        const cleanUrl = normalizeUrl(url);
        console.log(`[XHR] ${method} -> ${cleanUrl}`);
        results.add(cleanUrl);
        return originalXHROpen.apply(this, arguments);
    };

    const originalFetch = window.fetch;
    window.fetch = function() {
        const cleanUrl = normalizeUrl(arguments[0]);
        console.log(`[Fetch] -> ${cleanUrl}`);
        results.add(cleanUrl);
        return originalFetch.apply(this, arguments);
    };

    // ===== 2. STATIC ANALYSIS =====
    const regex = /(?<=(\"|\%27|\`|\'|`|‘|“|”|‘))\/[a-zA-Z0-9_?&=\/\-\#\.]*(?=(\"|\'|\%60|`|’|”|‘|”))/g;
    const scripts = document.getElementsByTagName("script");

    for (let i = 0; i < scripts.length; i++) {
        const src = scripts[i].src;
        if (src) {
            fetch(src)
                .then(response => response.text())
                .then(content => {
                    const matches = content.matchAll(regex);
                    for (const match of matches) {
                        const cleanMatch = normalizeUrl(match[0]);
                        console.log(`[Static JS] -> ${cleanMatch}`);
                        results.add(cleanMatch);
                    }
                })
                .catch(err => console.log("Error fetching script:", src, err));
        }
    }

    const pageContent = document.documentElement.outerHTML;
    const pageMatches = pageContent.matchAll(regex);
    for (const match of pageMatches) {
        const cleanMatch = normalizeUrl(match[0]);
        console.log(`[Static HTML] -> ${cleanMatch}`);
        results.add(cleanMatch);
    }

    // ===== 3. NORMALIZE URL =====
    function normalizeUrl(url) {
        return url.split('?')[0];  // Removes query parameters
    }

    // ===== 4. OUTPUT RESULTS =====
    function displayResults() {
        console.log(`\n=== Discovered Endpoints (${results.size}) ===`);
        results.forEach(endpoint => console.log(endpoint));

        const output = document.createElement('div');
        output.style = 'position:fixed;top:0;left:0;width:100%;max-height:50%;overflow:auto;background:#111;color:#0f0;padding:10px;z-index:99999;font-size:12px;';
        output.innerHTML = `<strong>Discovered Endpoints (${results.size}):</strong><br>` + [...results].join('<br>');
        document.body.appendChild(output);
    }

    setTimeout(displayResults, 5000);
})();
