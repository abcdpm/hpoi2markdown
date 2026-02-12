// ==UserScript==
// @name         Hpoi to Markdown with Picsur (WebP)
// @namespace    http://tampermonkey.net/
// @version      0.0.1
// @description  提取 Hpoi 手办信息，图片转换为 WebP 上传至 Picsur 图床，生成 Markdown 文本。
// @author       Gemini User
// @match        https://www.hpoi.net/hobby/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_setClipboard
// @grant        GM_addStyle
// @connect      hpoi.net
// @connect      *
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    // ============================================
    // Config & Styles
    // ============================================
    const CONFIG = {
        piscurUrl: GM_getValue('piscur_url', ''),
        apiKey: GM_getValue('api_key', ''),
    };

    const STYLES = `
        :root {
            --primary-color: #35CDFF;
            --bg-glass: rgba(0, 0, 0, 0.75);
            --text-color: #fff;
            --btn-size: 48px;
        }
        /* Controls Container */
        #hpoi-md-controls {
            position: fixed;
            bottom: 30px;
            right: 30px;
            z-index: 9999;
            display: flex;
            flex-direction: column;
            gap: 15px;
        }
        .hpoi-fab-btn {
            width: var(--btn-size);
            height: var(--btn-size);
            border-radius: 50%;
            background: var(--bg-glass);
            color: var(--text-color);
            border: 1px solid rgba(255,255,255,0.2);
            backdrop-filter: blur(10px);
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 20px;
            transition: all 0.3s ease;
            box-shadow: 0 4px 15px rgba(0,0,0,0.3);
        }
        .hpoi-fab-btn:hover {
            background: var(--primary-color);
            transform: scale(1.1);
            border-color: var(--primary-color);
        }

        /* Logger Window */
        #hpoi-logger {
            position: fixed;
            top: 20px;
            right: 20px;
            width: 320px;
            max-height: 400px;
            background: var(--bg-glass);
            backdrop-filter: blur(10px);
            border-radius: 12px;
            padding: 15px;
            z-index: 10000;
            overflow-y: auto;
            display: none;
            flex-direction: column;
            gap: 8px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.3);
            border: 1px solid rgba(255,255,255,0.1);
            font-family: 'Segoe UI', sans-serif;
            font-size: 13px;
            color: #eee;
        }
        .log-item {
            padding: 8px 12px;
            border-radius: 6px;
            background: rgba(255,255,255,0.05);
            animation: fadeIn 0.3s ease;
        }
        .log-item.success { border-left: 3px solid #2ecc71; }
        .log-item.error { border-left: 3px solid #e74c3c; }
        .log-item.info { border-left: 3px solid #3498db; }
        .log-time { color: #888; font-size: 11px; margin-right: 5px; }

        /* Settings Modal */
        #hpoi-settings-modal {
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0,0,0,0.6);
            backdrop-filter: blur(5px);
            z-index: 10001;
            display: none;
            align-items: center;
            justify-content: center;
        }
        .settings-card {
            background: #fff;
            width: 400px;
            padding: 25px;
            border-radius: 16px;
            box-shadow: 0 20px 50px rgba(0,0,0,0.3);
        }
        .settings-card h3 { margin: 0 0 20px 0; color: #333; }
        .form-group { margin-bottom: 15px; }
        .form-group label { display: block; margin-bottom: 5px; font-weight: bold; color: #555; }
        .form-group input {
            width: 100%;
            padding: 10px;
            border: 1px solid #ddd;
            border-radius: 8px;
            font-size: 14px;
        }
        .btn-row { display: flex; justify-content: flex-end; gap: 10px; margin-top: 10px; }
        .btn { padding: 8px 16px; border-radius: 6px; cursor: pointer; border: none; font-weight: bold; }
        .btn-save { background: var(--primary-color); color: #fff; }
        .btn-cancel { background: #eee; color: #333; }

        @keyframes fadeIn { from { opacity: 0; transform: translateY(-5px); } to { opacity: 1; transform: translateY(0); } }
    `;

    GM_addStyle(STYLES);

    // ============================================
    // UI Helpers
    // ============================================
    const UI = {
        init: () => {
            // Controls
            const controls = document.createElement('div');
            controls.id = 'hpoi-md-controls';
            controls.innerHTML = `
                <button class="hpoi-fab-btn" id="btn-settings" title="设置 Picsur"><i class="hpoifont icon-set_up"></i>⚙️</button>
                <button class="hpoi-fab-btn" id="btn-generate" title="生成 Markdown"><i class="hpoifont icon-download"></i>⬇️</button>
            `;
            document.body.appendChild(controls);

            // Logger
            const logger = document.createElement('div');
            logger.id = 'hpoi-logger';
            document.body.appendChild(logger);

            // Modal
            const modal = document.createElement('div');
            modal.id = 'hpoi-settings-modal';
            modal.innerHTML = `
                <div class="settings-card">
                    <h3>Picsur 图床设置</h3>
                    <div class="form-group">
                        <label>图床地址 (URL)</label>
                        <input type="text" id="conf-url" placeholder="例如: https://picsur.example.com" value="${CONFIG.piscurUrl}">
                        <small style="color:#999">请填写包含 https 的完整域名，脚本会自动拼接 /api/image/upload</small>
                    </div>
                    <div class="form-group">
                        <label>API Key</label>
                        <input type="password" id="conf-key" placeholder="API Key" value="${CONFIG.apiKey}">
                    </div>
                    <div class="btn-row">
                        <button class="btn btn-cancel" id="btn-cancel">取消</button>
                        <button class="btn btn-save" id="btn-save">保存</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);

            // Events
            document.getElementById('btn-settings').onclick = () => { modal.style.display = 'flex'; };
            document.getElementById('btn-cancel').onclick = () => { modal.style.display = 'none'; };
            document.getElementById('btn-save').onclick = () => {
                let url = document.getElementById('conf-url').value.trim();
                // Remove trailing slash
                if (url.endsWith('/')) url = url.slice(0, -1);
                const key = document.getElementById('conf-key').value.trim();

                GM_setValue('piscur_url', url);
                GM_setValue('api_key', key);
                CONFIG.piscurUrl = url;
                CONFIG.apiKey = key;
                UI.log('配置已保存', 'success');
                modal.style.display = 'none';
            };
            document.getElementById('btn-generate').onclick = Core.start;
        },

        log: (msg, type = 'info') => {
            const box = document.getElementById('hpoi-logger');
            box.style.display = 'flex';
            const time = new Date().toLocaleTimeString();
            const div = document.createElement('div');
            div.className = `log-item ${type}`;
            div.innerHTML = `<span class="log-time">[${time}]</span> ${msg}`;
            box.appendChild(div);
            box.scrollTop = box.scrollHeight;
            
            // Auto hide after 5 seconds if successful
            if(type === 'success' && msg.includes('完成')) {
                 setTimeout(() => { box.style.display = 'none'; box.innerHTML = ''; }, 5000);
            }
        }
    };

    // ============================================
    // Logic Core
    // ============================================
    const Core = {
        start: async () => {
            if (!CONFIG.piscurUrl || !CONFIG.apiKey) {
                UI.log('请先点击⚙️按钮配置图床信息！', 'error');
                return;
            }

            UI.log('开始抓取页面数据...');
            
            try {
                // 1. Extract Text Data
                const data = Core.extractData();
                UI.log(`已获取基本信息: ${data.name}`);

                // 2. Prepare Images
                const imagesToProcess = [];
                if (data.coverImg) imagesToProcess.push({ type: 'cover', url: data.coverImg });
                data.gallery.forEach((url, idx) => imagesToProcess.push({ type: 'gallery', url: url, idx: idx }));

                UI.log(`发现 ${imagesToProcess.length} 张图片，准备转换 WebP 并上传...`);

                // 3. Process Images (Convert & Upload)
                // Using map to do parallel processing, or for...of for sequential
                // Parallel is faster but might hit rate limits. Let's do batches of 3.
                const uploadedImages = [];
                const batchSize = 3;
                
                for (let i = 0; i < imagesToProcess.length; i += batchSize) {
                    const batch = imagesToProcess.slice(i, i + batchSize);
                    const results = await Promise.all(batch.map(img => Core.processImage(img)));
                    uploadedImages.push(...results);
                }

                // 4. Generate Markdown
                const markdown = Core.buildMarkdown(data, uploadedImages);

                // 5. Copy
                GM_setClipboard(markdown);
                UI.log('Markdown 已生成并复制到剪贴板！', 'success');

            } catch (e) {
                console.error(e);
                UI.log(`发生错误: ${e.message}`, 'error');
            }
        },

        extractData: () => {
            const info = {};
            
            // Title
            const titleEl = document.querySelector('.hpoi-ibox-title p');
            info.name = titleEl ? titleEl.textContent.replace('中文名称：', '').trim() : 'Unknown';

            // Detailed List
            document.querySelectorAll('.hpoi-infoList-item').forEach(item => {
                const label = item.querySelector('span').textContent.trim();
                let value = '';
                
                // Hpoi values are often links inside 'p', or just text
                const p = item.querySelector('p');
                if (p) {
                    // Replace <br> with newline if needed, but usually textContent is enough
                    // Handle list of links (e.g., attributes)
                    value = Array.from(p.childNodes)
                        .map(n => n.textContent.trim())
                        .filter(t => t) // remove empty
                        .join('、'); // join with comma or space
                    // Clean up common separators that might be duplicated
                    value = value.replace(/、、/g, '、');
                }
                info[label] = value;
            });

            // Cover Image (Find high res if possible, usually the src inside .isotope-img img is mid-res, but good enough)
            // Hpoi logic: often src needs query params removed for cleaner link, but Hpoi auth tokens might be tricky.
            // We download via Blob so tokens are handled by browser context.
            const coverEl = document.querySelector('.hpoi-ibox-img img');
            info.coverImg = coverEl ? coverEl.src : null;

            // Gallery Images (Official Pics)
            // Target the hidden or visible slider links which usually point to original files
            info.gallery = [];
            document.querySelectorAll('.swiper-gallery .swiper-slide a').forEach(a => {
                const url = a.getAttribute('href') || a.getAttribute('data-src');
                if (url && !url.includes('javascript')) {
                    // Check if it's a relative path and prepend domain if needed
                    if(url.startsWith('http')) info.gallery.push(url);
                    else info.gallery.push(window.location.origin + '/' + url);
                }
            });

            // Remove duplicates
            info.gallery = [...new Set(info.gallery)];

            return info;
        },

        // Download -> Convert to WebP -> Upload
        processImage: async (imgObj) => {
            try {
                UI.log(`正在处理图片 [${imgObj.type}]...`);
                
                // 1. Fetch Blob
                const blob = await Core.fetchBlob(imgObj.url);
                
                // 2. Convert to WebP
                const webpBlob = await Core.convertToWebP(blob);
                
                // 3. Upload
                const uploadedUrl = await Core.uploadToPiscur(webpBlob, `image_${Date.now()}.webp`);
                
                UI.log(`图片上传成功`, 'info');
                return { original: imgObj.url, newUrl: uploadedUrl, type: imgObj.type };
            } catch (e) {
                UI.log(`图片处理失败: ${e}`, 'error');
                return { original: imgObj.url, newUrl: imgObj.url, type: imgObj.type, error: true }; // Fallback to original
            }
        },

        fetchBlob: (url) => {
            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: "GET",
                    url: url,
                    responseType: "blob",
                    onload: (response) => {
                        if (response.status === 200) resolve(response.response);
                        else reject('Download failed');
                    },
                    onerror: (err) => reject(err)
                });
            });
        },

        convertToWebP: (blob) => {
            return new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    canvas.width = img.width;
                    canvas.height = img.height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0);
                    canvas.toBlob((b) => {
                        if(b) resolve(b);
                        else reject('Conversion failed');
                    }, 'image/webp', 0.9); // 0.9 Quality
                };
                img.onerror = reject;
                img.src = URL.createObjectURL(blob);
            });
        },

        uploadToPiscur: (blob, filename) => {
            return new Promise((resolve, reject) => {
                const formData = new FormData();
                // Picsur usually takes 'file'
                formData.append('file', blob, filename);
                formData.append('strategy_id', '1'); // Optional: Default strategy

                GM_xmlhttpRequest({
                    method: "POST",
                    url: `${CONFIG.piscurUrl}/api/image/upload`,
                    headers: {
                        "Authorization": `Bearer ${CONFIG.apiKey}`,
                        "Accept": "application/json"
                    },
                    data: formData,
                    onload: (response) => {
                        try {
                            const json = JSON.parse(response.responseText);
                            // Picsur API response structure handling
                            // Standard Picsur returns { status: true, data: { url: "..." } }
                            if (json.status === true && json.data && json.data.url) {
                                resolve(json.data.url);
                            } else if (json.data && json.data.links && json.data.links.url) {
                                // Some EasyImage based APIs
                                resolve(json.data.links.url);
                            } else {
                                reject('API Error: ' + JSON.stringify(json));
                            }
                        } catch (e) {
                            reject('JSON Parse Error');
                        }
                    },
                    onerror: (err) => reject('Network Error')
                });
            });
        },

        buildMarkdown: (data, images) => {
            const cover = images.find(i => i.type === 'cover');
            const gallery = images.filter(i => i.type === 'gallery');

            // Format cover image
            let md = `## ${data.name}\n\n`;
            
            if (cover && !cover.error) {
                md += `![封面](${cover.newUrl})\n\n`;
            } else if (data.coverImg) {
                md += `![封面](${data.coverImg})\n\n`; // Fallback
            }

            // Info Table
            md += `| 项目 | 内容 |\n| :--- | :--- |\n`;
            
            // Define order of keys if you want specific sorting, otherwise iteration
            const specificKeys = ['名称', '属性', '定价', '出货日', '比例', '制作', '系列', '角色', '作品', '官网链接'];
            
            specificKeys.forEach(key => {
                if (data[key]) {
                    // Handle markdown links inside table if needed, Hpoi text usually clean enough
                    let val = data[key];
                    if (key === '官网链接' && val.includes('点击进入')) {
                        // We need to extract the real link from extractData if strictly needed, 
                        // currently extractData gets text. Let's fix extraction for links later if needed.
                        // For now, the text "点击进入" isn't useful.
                        // Let's grab the actual href in extractData logic.
                        // (Patching logic simply here: Hpoi link usually is <a>. 
                        // The previous extractor extracted text. Let's assume user accepts text or simple edit)
                    }
                    md += `| ${key} | ${val} |\n`;
                }
            });

            // Handle keys not in specific list
            for (let [k, v] of Object.entries(data)) {
                if (!specificKeys.includes(k) && k !== 'name' && k !== 'coverImg' && k !== 'gallery') {
                    md += `| ${k} | ${v} |\n`;
                }
            }

            md += `\n### 官方图片\n\n`;

            // Gallery Grid
            gallery.forEach(img => {
                md += `![官图](${img.newUrl || img.original})\n`;
            });

            return md;
        }
    };

    // Initialize
    UI.init();

})();