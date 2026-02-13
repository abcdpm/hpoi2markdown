// ==UserScript==
// @name         Hpoi to Markdown with Picsur & Wiki.js (v3.5 Manufacturer Title)
// @namespace    http://tampermonkey.net/
// @version      3.5
// @description  提取 Hpoi 手办信息上传图床，自动拼接厂商名到标题，支持多模式发布。
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
    // 1. 配置与样式
    // ============================================
    const CONFIG = {
        piscurUrl: GM_getValue('piscur_url', ''),
        apiKey: GM_getValue('api_key', ''),
        wikiUrl: GM_getValue('wiki_url', ''),
        wikiToken: GM_getValue('wiki_token', ''),
        wikiPath: GM_getValue('wiki_path', 'hobby'), // 默认路径前缀
    };

    const STYLES = `
        :root {
            --primary-color: #35CDFF;
            --bg-glass: rgba(0, 0, 0, 0.85);
            --text-color: #fff;
            --input-bg: #f9f9f9;
        }

        #hpoi-md-controls {
            position: fixed;
            bottom: 30px;
            right: 30px;
            z-index: 9999;
            display: flex;
            flex-direction: column;
            gap: 10px;
            align-items: flex-end;
        }

        .hpoi-btn-pill {
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 0 20px;
            height: 40px;
            border-radius: 20px;
            background: var(--bg-glass);
            color: var(--text-color);
            border: 1px solid rgba(255,255,255,0.2);
            backdrop-filter: blur(10px);
            cursor: pointer;
            font-size: 13px;
            font-weight: bold;
            transition: all 0.3s ease;
            box-shadow: 0 4px 15px rgba(0,0,0,0.3);
            text-decoration: none;
            width: auto;
            min-width: 120px;
        }
        .hpoi-btn-pill i { margin-right: 8px; font-size: 16px; font-style: normal; }
        .hpoi-btn-pill:hover {
            background: var(--primary-color);
            border-color: var(--primary-color);
            transform: translateX(-5px);
        }
        #btn-gen:hover { background: #f39c12; border-color: #f39c12; }
        #btn-pub:hover { background: #2ecc71; border-color: #2ecc71; }
        #btn-all:hover { background: #9b59b6; border-color: #9b59b6; }

        #hpoi-logger {
            position: fixed;
            top: 10px;
            right: 10px;
            width: 320px;
            max-height: 90vh;
            z-index: 2147483647;
            display: flex;
            flex-direction: column;
            gap: 5px;
            pointer-events: none;
        }
        
        .log-item {
            pointer-events: auto;
            padding: 8px 12px;
            border-radius: 6px;
            background: rgba(0, 0, 0, 0.9);
            color: #fff;
            font-size: 12px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            border-left: 3px solid #aaa;
            opacity: 1;
            transition: opacity 0.5s ease, transform 0.5s ease;
            animation: slideIn 0.2s ease;
            line-height: 1.4;
            word-break: break-all;
        }
        .log-item.success { border-left-color: #2ecc71; }
        .log-item.error { border-left-color: #e74c3c; }
        .log-item.info { border-left-color: #35CDFF; }
        .log-item.fading { opacity: 0; transform: translateX(20px); }

        @keyframes slideIn { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }

        /* 设置弹窗 */
        #hpoi-settings-modal {
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0,0,0,0.6);
            z-index: 10001;
            display: none;
            align-items: center;
            justify-content: center;
            backdrop-filter: blur(5px);
        }
        .settings-card {
            background: #fff;
            width: 450px;
            max-height: 90vh;
            overflow-y: auto;
            padding: 25px;
            border-radius: 12px;
            box-shadow: 0 25px 50px rgba(0,0,0,0.3);
        }
        .settings-card h3 { margin: 10px 0 15px 0; color: #333; font-size: 16px; border-bottom: 2px solid var(--primary-color); padding-bottom: 5px; display: inline-block; }
        .form-group { margin-bottom: 12px; }
        .form-group label { display: block; margin-bottom: 5px; font-weight: bold; color: #555; font-size: 12px; }
        .form-group input {
            width: 100%;
            padding: 8px;
            border: 1px solid #ddd;
            border-radius: 6px;
            font-size: 13px;
            outline: none;
            background: var(--input-bg);
        }
        .form-group input:focus { border-color: var(--primary-color); background: #fff; }
        .btn-row { display: flex; justify-content: flex-end; gap: 8px; margin-top: 20px; border-top: 1px solid #eee; padding-top: 15px; }
        .btn { padding: 6px 16px; border-radius: 6px; cursor: pointer; border: none; font-weight: bold; font-size: 12px; }
        .btn-test { background: #f39c12; color: #fff; }
        .btn-save { background: var(--primary-color); color: #fff; }
        .btn-cancel { background: #eee; color: #333; }
        .section-gap { margin-top: 20px; }
    `;

    GM_addStyle(STYLES);

    // ============================================
    // 2. UI 逻辑
    // ============================================
    const UI = {
        init: () => {
            const controls = document.createElement('div');
            controls.id = 'hpoi-md-controls';
            controls.innerHTML = `
                <button class="hpoi-btn-pill" id="btn-settings"><i>⚙️</i> 设置</button>
                <button class="hpoi-btn-pill" id="btn-gen"><i>🖼️</i> 仅生成 MD</button>
                <button class="hpoi-btn-pill" id="btn-pub"><i>🌐</i> 仅发布 Wiki</button>
                <button class="hpoi-btn-pill" id="btn-all"><i>🚀</i> 生成 & 发布</button>
            `;
            document.body.appendChild(controls);

            const logger = document.createElement('div');
            logger.id = 'hpoi-logger';
            document.body.appendChild(logger);

            const modal = document.createElement('div');
            modal.id = 'hpoi-settings-modal';
            modal.innerHTML = `
                <div class="settings-card">
                    <h3>Picsur 图床配置</h3>
                    <div class="form-group">
                        <label>图床地址 (URL)</label>
                        <input type="text" id="conf-url" placeholder="例如: https://img.paccu.cn" value="${CONFIG.piscurUrl}">
                    </div>
                    <div class="form-group">
                        <label>API Key</label>
                        <input type="password" id="conf-key" placeholder="Picsur API Key" value="${CONFIG.apiKey}">
                    </div>
                    <div class="btn-row" style="border:none; padding:0; justify-content:flex-start;">
                        <button class="btn btn-test" id="btn-test-piscur">⚡ 测试图床</button>
                    </div>

                    <div class="section-gap"></div>
                    <h3>Wiki.js 配置</h3>
                    <div class="form-group">
                        <label>Wiki 地址 (URL)</label>
                        <input type="text" id="conf-wiki-url" placeholder="例如: https://wiki.yoursite.com" value="${CONFIG.wikiUrl}">
                        <small style="color:#999;">无需 /graphql 后缀，脚本会自动拼接</small>
                    </div>
                    <div class="form-group">
                        <label>Token (Bearer)</label>
                        <input type="password" id="conf-wiki-token" placeholder="Wiki.js API Token" value="${CONFIG.wikiToken}">
                    </div>
                    <div class="form-group">
                        <label>发布路径前缀</label>
                        <input type="text" id="conf-wiki-path" placeholder="例如: hobby" value="${CONFIG.wikiPath}">
                        <small style="color:#999;">最终路径: 前缀/手办ID (如 hobby/117891)</small>
                    </div>
                    <div class="btn-row" style="border:none; padding:0; justify-content:flex-start;">
                         <button class="btn btn-test" id="btn-test-wiki">⚡ 测试 Wiki</button>
                    </div>

                    <div class="btn-row">
                        <button class="btn btn-cancel" id="btn-cancel">取消</button>
                        <button class="btn btn-save" id="btn-save">保存全部配置</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);

            document.getElementById('btn-settings').onclick = () => { modal.style.display = 'flex'; };
            document.getElementById('btn-cancel').onclick = () => { modal.style.display = 'none'; };
            
            document.getElementById('btn-gen').onclick = () => Core.start('gen');
            document.getElementById('btn-pub').onclick = () => Core.start('pub');
            document.getElementById('btn-all').onclick = () => Core.start('all');

            document.getElementById('btn-save').onclick = () => {
                let pUrl = document.getElementById('conf-url').value.trim();
                if (pUrl.endsWith('/')) pUrl = pUrl.slice(0, -1);
                const pKey = document.getElementById('conf-key').value.trim();

                let wUrl = document.getElementById('conf-wiki-url').value.trim();
                if (wUrl.endsWith('/')) wUrl = wUrl.slice(0, -1);
                const wToken = document.getElementById('conf-wiki-token').value.trim();
                const wPath = document.getElementById('conf-wiki-path').value.trim();

                GM_setValue('piscur_url', pUrl);
                GM_setValue('api_key', pKey);
                GM_setValue('wiki_url', wUrl);
                GM_setValue('wiki_token', wToken);
                GM_setValue('wiki_path', wPath);

                Object.assign(CONFIG, { piscurUrl: pUrl, apiKey: pKey, wikiUrl: wUrl, wikiToken: wToken, wikiPath: wPath });
                UI.log('配置已保存', 'success');
                setTimeout(() => modal.style.display = 'none', 500);
            };

            document.getElementById('btn-test-piscur').onclick = async () => {
                const btn = document.getElementById('btn-test-piscur');
                const orig = btn.textContent;
                btn.textContent = '连接中...'; btn.disabled = true;
                const pixel = atob('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7');
                const array = new Uint8Array(pixel.length);
                const blob = new Blob([array], {type: 'image/gif'});
                try {
                    const url = document.getElementById('conf-url').value.trim().replace(/\/$/, '');
                    const key = document.getElementById('conf-key').value.trim();
                    const res = await Core.uploadToPiscurDirect(blob, 'test.gif', url, key);
                    UI.log(`图床正常: ${res}`, 'success');
                } catch (e) { UI.log(`图床错误: ${e}`, 'error'); } 
                finally { btn.textContent = orig; btn.disabled = false; }
            };

            document.getElementById('btn-test-wiki').onclick = async () => {
                const btn = document.getElementById('btn-test-wiki');
                const orig = btn.textContent;
                btn.textContent = '连接中...'; btn.disabled = true;
                try {
                    const url = document.getElementById('conf-wiki-url').value.trim().replace(/\/$/, '');
                    const token = document.getElementById('conf-wiki-token').value.trim();
                    await Core.testWikiConnection(url, token);
                    UI.log(`Wiki 连接成功！Token 有效。`, 'success');
                } catch (e) { UI.log(`Wiki 错误: ${e}`, 'error'); }
                finally { btn.textContent = orig; btn.disabled = false; }
            };
        },

        log: (msg, type = 'info') => {
            const box = document.getElementById('hpoi-logger');
            const div = document.createElement('div');
            div.className = `log-item ${type}`;
            div.textContent = msg;
            box.appendChild(div);
            let timer = null;
            const remove = () => { div.classList.add('fading'); setTimeout(() => { if(div.parentNode) div.remove(); }, 500); };
            const start = () => { timer = setTimeout(remove, 8000); };
            div.addEventListener('mouseenter', () => { if (timer) clearTimeout(timer); div.classList.remove('fading'); });
            div.addEventListener('mouseleave', () => start());
            start();
        }
    };

    // ============================================
    // 3. 核心逻辑
    // ============================================
    const Core = {
        start: async (mode = 'all') => {
            if (!CONFIG.piscurUrl || !CONFIG.apiKey) {
                UI.log('请先配置图床信息！', 'error'); return;
            }

            UI.log(`开始任务 (模式: ${mode === 'gen' ? '仅生成' : mode === 'pub' ? '仅发布' : '生成&发布'})`, 'info');
            
            try {
                const { info: data, images: imagesToProcess } = Core.extractData();
                UI.log(`已识别: ${data.name}`, 'info');

                const uploadedImages = [];
                for (let i = 0; i < imagesToProcess.length; i++) {
                    const img = imagesToProcess[i];
                    uploadedImages.push(await Core.processImage(img));
                    UI.log(`图床上传: ${i + 1}/${imagesToProcess.length}`, 'info');
                }

                const markdown = Core.buildMarkdown(data, uploadedImages);

                if (mode === 'gen' || mode === 'all') {
                    GM_setClipboard(markdown);
                    UI.log('Markdown 已复制到剪贴板！', 'success');
                } else if (mode === 'pub') {
                     console.log("Markdown Content:", markdown);
                }

                if (mode === 'pub' || mode === 'all') {
                    if (CONFIG.wikiUrl && CONFIG.wikiToken) {
                        UI.log('正在发布到 Wiki.js ...', 'info');
                        await Core.publishToWiki(data, markdown);
                        UI.log('Wiki 发布成功！', 'success');
                    } else {
                        UI.log('Wiki 配置为空，无法发布。', 'error');
                    }
                }

            } catch (e) {
                console.error(e);
                UI.log(`错误: ${e.message}`, 'error');
            }
        },

        extractData: () => {
            const info = {};
            const imagesToProcess = [];
            
            info.url = window.location.href; 
            const urlParts = info.url.split('/');
            info.id = urlParts[urlParts.length - 1].split('?')[0] || 'unknown';

            const titleEl = document.querySelector('.hpoi-ibox-title p');
            info.name = titleEl ? titleEl.textContent.replace('中文名称：', '').trim() : 'Unknown';

            document.querySelectorAll('.hpoi-infoList-item').forEach(item => {
                const labelSpan = item.querySelector('span');
                const p = item.querySelector('p');
                if (labelSpan && p) {
                    const label = labelSpan.textContent.trim();
                    let value = '';

                    if (label === '属性') {
                        const attrs = Array.from(p.querySelectorAll('a')).map(a => a.textContent.trim()).filter(t => t);
                        value = attrs.length > 0 ? attrs.join('、') : p.textContent.replace(/\s+/g, ' ').trim();
                    }
                    else if (label === '外部链接' || label === '官网链接') {
                        const links = p.querySelectorAll('a');
                        const linkData = [];
                        links.forEach(aTag => {
                            let rawUrl = aTag.href;
                            if (rawUrl.includes('hprdrt?url=')) {
                                try { rawUrl = decodeURIComponent(new URLSearchParams(rawUrl.split('?')[1]).get('url')) || rawUrl; } catch (e) {}
                            }
                            const imgTag = aTag.querySelector('img');
                            if (imgTag) {
                                imagesToProcess.push({ type: 'icon', url: imgTag.src });
                                linkData.push({ type: 'icon', src: imgTag.src, href: rawUrl });
                            } else {
                                linkData.push({ type: 'text', text: aTag.textContent.trim() || '链接', href: rawUrl });
                            }
                        });
                        value = linkData;
                    }
                    else {
                        value = Array.from(p.childNodes).map(n => n.textContent.trim()).filter(t => t).join('、').replace(/、、/g, '、');
                    }
                    if (value) info[label] = value;
                }
            });

            const coverEl = document.querySelector('.hpoi-ibox-img img');
            if (coverEl) {
                const src = coverEl.src.split('?')[0];
                info.coverImg = src;
                imagesToProcess.push({ type: 'cover', url: src });
            }

            info.gallery = [];
            document.querySelectorAll('.swiper-gallery .swiper-slide img').forEach(img => {
                let src = img.src || img.getAttribute('data-src');
                if (src) {
                    src = src.split('?')[0].replace('/pic/s/', '/pic/n/');
                    info.gallery.push(src);
                    imagesToProcess.push({ type: 'gallery', url: src });
                }
            });

            // [新增] 拼接厂商名到标题
            if (info['制作']) {
                info.name = `${info['制作']} ${info.name}`;
            }

            return { info, images: imagesToProcess };
        },

        processImage: async (imgObj) => {
            try {
                const blob = await Core.fetchBlob(imgObj.url);
                let ext = 'jpg';
                if (blob.type === 'image/png') ext = 'png';
                else if (blob.type === 'image/gif') ext = 'gif';
                else if (blob.type === 'image/webp') ext = 'webp';
                
                const prefix = imgObj.type === 'icon' ? 'icon_' : 'hpoi_';
                const filename = `${prefix}${Date.now()}_${Math.random().toString(36).substr(2, 5)}.${ext}`;
                const uploadedUrl = await Core.uploadToPiscurDirect(blob, filename, CONFIG.piscurUrl, CONFIG.apiKey);
                return { original: imgObj.url, newUrl: uploadedUrl, type: imgObj.type };
            } catch (e) {
                return { original: imgObj.url, newUrl: imgObj.url, type: imgObj.type, error: true };
            }
        },

        fetchBlob: (url) => {
            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: "GET",
                    url: url,
                    headers: { "Referer": "https://www.hpoi.net/" },
                    responseType: "blob",
                    onload: (res) => {
                        if (res.status === 200) resolve(res.response);
                        else reject(`HTTP ${res.status}`);
                    },
                    onerror: () => reject('网络错误')
                });
            });
        },

        uploadToPiscurDirect: (blob, filename, host, key) => {
            return new Promise((resolve, reject) => {
                const formData = new FormData();
                formData.append('image', blob, filename);
                GM_xmlhttpRequest({
                    method: "POST",
                    url: `${host}/api/image/upload`,
                    headers: { "Authorization": `Api-Key ${key}`, "Accept": "application/json" },
                    data: formData,
                    onload: (res) => {
                        try {
                            const json = JSON.parse(res.responseText);
                            if (json.success || json.status) {
                                let url = json.data?.url || (json.data?.id ? `${host}/i/${json.data.id}.jpg` : json.data?.links?.url);
                                if (url) { resolve(url.replace(/\.[^.]+$/, '.webp')); return; }
                            }
                            reject(json.message || 'API Error');
                        } catch { reject('JSON Error'); }
                    },
                    onerror: () => reject('Net Error')
                });
            });
        },

        buildMarkdown: (data, uploadedImages) => {
            const getUrl = (orig) => {
                const img = uploadedImages.find(i => i.original === orig);
                return (img && !img.error) ? img.newUrl : orig;
            };

            const cover = uploadedImages.find(i => i.type === 'cover');
            
            let md = `## ${data.name}\n\n`;
            
            if (cover && !cover.error) md += `![封面](${cover.newUrl})\n\n`;
            else if (data.coverImg) md += `![封面](${data.coverImg})\n\n`;

            md += `| 项目 | 内容 |\n| :--- | :--- |\n`;
            
            const keys = ['名称', '属性', '定价', '出货日', '比例', '制作', '系列', '角色', '作品', '官网链接', '外部链接'];
            keys.forEach(key => {
                if (data[key]) {
                    let val = data[key];
                    if (Array.isArray(val)) {
                        val = val.map(item => {
                            if (item.type === 'icon') {
                                const newSrc = getUrl(item.src);
                                return `<a href="${item.href}" target="_blank"><img src="${newSrc}" height="12px"/></a>`;
                            } else return `[${item.text}](${item.href})`;
                        }).join(' ');
                    }
                    md += `| ${key} | ${val} |\n`;
                }
            });

            for (let [k, v] of Object.entries(data)) {
                if (!keys.includes(k) && !['name','coverImg','gallery','url','id'].includes(k) && typeof v === 'string') {
                    md += `| ${k} | ${v} |\n`;
                }
            }
            
            md += `\n[${data.url}](${data.url})\n\n`;

            md += `### 官方图片\n\n`;
            uploadedImages.filter(i => i.type === 'gallery').forEach(img => {
                md += `![官图](${img.newUrl || img.original})\n`;
            });
            return md;
        },

        testWikiConnection: (url, token) => {
            return new Promise((resolve, reject) => {
                const query = `query { pages { list(limit: 1) { id title } } }`;
                GM_xmlhttpRequest({
                    method: "POST",
                    url: `${url}/graphql`,
                    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
                    data: JSON.stringify({ query }),
                    onload: (res) => {
                        if (res.status === 200) {
                            const json = JSON.parse(res.responseText);
                            if (json.errors) reject(json.errors[0].message);
                            else resolve(true);
                        }
                        else reject(`HTTP ${res.status}: ${res.responseText}`);
                    },
                    onerror: () => reject('Wiki 连接网络错误')
                });
            });
        },

        publishToWiki: (data, content) => {
            return new Promise((resolve, reject) => {
                const tags = ['手办']; 
                if (data['制作']) tags.push(data['制作']);
                if (data['作品']) tags.push(data['作品']);
                if (data['角色']) tags.push(data['角色']);
                const cleanTags = [...new Set(tags)].map(t => t.replace(/[、,，\s]/g, '')).filter(t => t);

                const path = `${CONFIG.wikiPath}/${data.id}`;

                const mutation = `
                    mutation ($content: String!, $description: String!, $editor: String!, $isPrivate: Boolean!, $isPublished: Boolean!, $locale: String!, $path: String!, $tags: [String]!, $title: String!) {
                        pages {
                            create (content: $content, description: $description, editor: $editor, isPrivate: $isPrivate, isPublished: $isPublished, locale: $locale, path: $path, tags: $tags, title: $title) {
                                responseResult {
                                    succeeded
                                    errorCode
                                    message
                                }
                            }
                        }
                    }
                `;

                const variables = {
                    content: content,
                    description: `Hpoi ID: ${data.id} - ${data.name}`,
                    editor: "markdown",
                    isPrivate: false,
                    isPublished: true,
                    locale: "zh",
                    path: path,
                    tags: cleanTags,
                    title: data.name
                };

                GM_xmlhttpRequest({
                    method: "POST",
                    url: `${CONFIG.wikiUrl}/graphql`,
                    headers: { "Authorization": `Bearer ${CONFIG.wikiToken}`, "Content-Type": "application/json" },
                    data: JSON.stringify({ query: mutation, variables }),
                    onload: (res) => {
                        try {
                            const json = JSON.parse(res.responseText);
                            if (json.errors) {
                                reject('Wiki API Error: ' + json.errors[0].message);
                            } else if (json.data && json.data.pages && json.data.pages.create.responseResult.succeeded) {
                                resolve(true);
                            } else {
                                const msg = json.data?.pages?.create?.responseResult?.message || '未知错误 (可能是页面已存在)';
                                reject('发布失败: ' + msg);
                            }
                        } catch (e) { reject('Wiki Response Parse Error'); }
                    },
                    onerror: () => reject('Wiki Publish Network Error')
                });
            });
        }
    };

    UI.init();

})();