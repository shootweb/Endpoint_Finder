# Website Endpoint Discovery Tool

This JavaScript tool helps you **discover hidden and active API endpoints** of any website. It combines **dynamic monitoring** (capturing live network requests) with **static analysis** (scanning HTML and JavaScript files for hardcoded URLs).

## Features
- **Real-Time API Monitoring:** Captures API calls made using `fetch` and `XMLHttpRequest`.
- **Static Analysis:** Scans embedded JavaScript and page content for hardcoded URLs.
- **Unified Output:** Displays all discovered endpoints without duplicates.

---

## How to Use

1. **Open Developer Tools:**  
   Press `F12` or `Ctrl + Shift + I` in your browser.

2. **Go to the Console Tab.**

3. **Paste the Script Below** and press **Enter**.

4. **Interact with the Website:**  
   Click around to trigger API calls.

5. **View Results:**  
   Endpoints will appear in the console and as an overlay on the webpage.

---

## Script

```javascript
(function() {
    const results = new Set();

    // ===== 1. DYNAMIC MONITORING =====
    const originalXHROpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url) {
        console.log(`[XHR] ${method} -> ${url}`);
        results.add(url);
        return originalXHROpen.apply(this, arguments);
    };

    const originalFetch = window.fetch;
    window.fetch = function() {
        console.log(`[Fetch] -> ${arguments[0]}`);
        results.add(arguments[0]);
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
                        console.log(`[Static JS] -> ${match[0]}`);
                        results.add(match[0]);
                    }
                })
                .catch(err => console.log("Error fetching script:", src, err));
        }
    }

    const pageContent = document.documentElement.outerHTML;
    const pageMatches = pageContent.matchAll(regex);
    for (const match of pageMatches) {
        console.log(`[Static HTML] -> ${match[0]}`);
        results.add(match[0]);
    }

    // ===== 3. OUTPUT RESULTS =====
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
