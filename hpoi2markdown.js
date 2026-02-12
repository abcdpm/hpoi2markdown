// ==UserScript==
// @name         Hpoi to Markdown with Picsur (v2.6 WebP Force)
// @namespace    http://tampermonkey.net/
// @version      2.6
// @description  提取 Hpoi 手办信息上传至 Picsur (强制WebP后缀/修复Icon/500错误)，单线程稳定版。
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
    };

    const STYLES = `
        :root {
            --primary-color: #35CDFF;
            --bg-glass: rgba(0, 0, 0, 0.85);
            --text-color: #fff;
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
            height: 48px;
            border-radius: 24px;
            background: var(--bg-glass);
            color: var(--text-color);
            border: 1px solid rgba(255,255,255,0.2);
            backdrop-filter: blur(10px);
            cursor: pointer;
            font-size: 14px;
            font-weight: bold;
            transition: all 0.3s ease;
            box-shadow: 0 4px 15px rgba(0,0,0,0.3);
            text-decoration: none;
            width: auto;
            min-width: 100px;
        }
        .hpoi-btn-pill i { margin-right: 8px; font-size: 18px; font-style: normal; }
        .hpoi-btn-pill:hover {
            background: var(--primary-color);
            border-color: var(--primary-color);
            transform: translateX(-5px);
        }

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

        .log-item.fading {
            opacity: 0;
            transform: translateX(20px);
        }

        @keyframes slideIn { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }

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
            width: 420px;
            padding: 30px;
            border-radius: 12px;
            box-shadow: 0 25px 50px rgba(0,0,0,0.3);
        }
        .settings-card h3 { margin: 0 0 20px 0; color: #333; font-size: 18px; border-bottom: 1px solid #eee; padding-bottom: 10px; }
        .form-group { margin-bottom: 15px; }
        .form-group label { display: block; margin-bottom: 8px; font-weight: bold; color: #555; font-size: 13px; }
        .form-group input {
            width: 100%;
            padding: 10px;
            border: 1px solid #ddd;
            border-radius: 6px;
            font-size: 14px;
            outline: none;
        }
        .form-group input:focus { border-color: var(--primary-color); }
        .btn-row { display: flex; justify-content: flex-end; gap: 10px; margin-top: 25px; }
        .btn { padding: 8px 20px; border-radius: 6px; cursor: pointer; border: none; font-weight: bold; font-size: 13px; }
        .btn-test { background: #f39c12; color: #fff; margin-right: auto; }
        .btn-save { background: var(--primary-color); color: #fff; }
        .btn-cancel { background: #eee; color: #333; }
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
                <button class="hpoi-btn-pill" id="btn-generate"><i>⬇️</i> 生成 Markdown</button>
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
                        <small style="color:#999; display:block; margin-top:5px;">请输入完整域名，脚本会自动拼接 /api/image/upload</small>
                    </div>
                    <div class="form-group">
                        <label>API Key</label>
                        <input type="password" id="conf-key" placeholder="在此输入 API Key" value="${CONFIG.apiKey}">
                    </div>
                    <div class="btn-row">
                        <button class="btn btn-test" id="btn-test-conn">⚡ 测试连接</button>
                        <button class="btn btn-cancel" id="btn-cancel">取消</button>
                        <button class="btn btn-save" id="btn-save">保存配置</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);

            document.getElementById('btn-settings').onclick = () => { modal.style.display = 'flex'; };
            document.getElementById('btn-cancel').onclick = () => { modal.style.display = 'none'; };
            document.getElementById('btn-generate').onclick = Core.start;

            document.getElementById('btn-save').onclick = () => {
                let url = document.getElementById('conf-url').value.trim();
                if (url.endsWith('/')) url = url.slice(0, -1);
                const key = document.getElementById('conf-key').value.trim();

                GM_setValue('piscur_url', url);
                GM_setValue('api_key', key);
                CONFIG.piscurUrl = url;
                CONFIG.apiKey = key;
                UI.log('配置已保存', 'success');
                setTimeout(() => modal.style.display = 'none', 500);
            };

            document.getElementById('btn-test-conn').onclick = async () => {
                const btn = document.getElementById('btn-test-conn');
                const origText = btn.textContent;
                btn.textContent = '连接中...';
                btn.disabled = true;

                let url = document.getElementById('conf-url').value.trim();
                if (url.endsWith('/')) url = url.slice(0, -1);
                const key = document.getElementById('conf-key').value.trim();

                const pixel = atob('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7');
                const array = new Uint8Array(pixel.length);
                for (let i = 0; i < pixel.length; i++) array[i] = pixel.charCodeAt(i);
                const blob = new Blob([array], {type: 'image/gif'});

                try {
                    const resultUrl = await Core.uploadToPiscurDirect(blob, 'test_pixel.gif', url, key);
                    UI.log(`连接成功！测试图: ${resultUrl}`, 'success');
                } catch (e) {
                    UI.log(`连接测试失败: ${e}`, 'error');
                } finally {
                    btn.textContent = origText;
                    btn.disabled = false;
                }
            };
        },

        log: (msg, type = 'info') => {
            const box = document.getElementById('hpoi-logger');
            const div = document.createElement('div');
            div.className = `log-item ${type}`;
            div.textContent = msg;
            box.appendChild(div);

            let timer = null;
            const removeLog = () => {
                div.classList.add('fading');
                setTimeout(() => { if(div.parentNode) div.remove(); }, 500);
            };
            const startTimer = () => { timer = setTimeout(removeLog, 10000); };
            div.addEventListener('mouseenter', () => { if (timer) clearTimeout(timer); div.classList.remove('fading'); });
            div.addEventListener('mouseleave', () => { startTimer(); });
            startTimer();
        }
    };

    // ============================================
    // 3. 核心逻辑
    // ============================================
    const Core = {
        start: async () => {
            if (!CONFIG.piscurUrl || !CONFIG.apiKey) {
                UI.log('请先点击“设置”配置图床信息！', 'error');
                return;
            }

            UI.log('正在解析页面数据...', 'info');

            try {
                // 1. 获取数据 (包含Icon提取逻辑)
                const { info: data, images: imagesToProcess } = Core.extractData();
                UI.log(`已识别手办：${data.name}`, 'info');

                if (imagesToProcess.length === 0) {
                     UI.log('注意：未检测到任何图片', 'info');
                } else {
                     UI.log(`共 ${imagesToProcess.length} 张图片(含图标)，开始上传...`, 'info');
                }

                // 2. 批量上传 (强制单线程)
                const uploadedImages = [];
                const batchSize = 1;

                for (let i = 0; i < imagesToProcess.length; i += batchSize) {
                    const batch = imagesToProcess.slice(i, i + batchSize);
                    const results = await Promise.all(batch.map(img => Core.processImage(img)));
                    uploadedImages.push(...results);
                    UI.log(`上传进度: ${Math.min(i + batchSize, imagesToProcess.length)} / ${imagesToProcess.length}`, 'info');
                }

                // 3. 生成 Markdown
                const markdown = Core.buildMarkdown(data, uploadedImages);
                GM_setClipboard(markdown);
                UI.log('Markdown 生成成功！已写入剪贴板。', 'success');

            } catch (e) {
                console.error(e);
                UI.log(`流程异常: ${e.message}`, 'error');
            }
        },

        extractData: () => {
            const info = {};
            const imagesToProcess = [];

            // 标题
            const titleEl = document.querySelector('.hpoi-ibox-title p');
            info.name = titleEl ? titleEl.textContent.replace('中文名称：', '').trim() : 'Unknown';

            // 信息列表
            document.querySelectorAll('.hpoi-infoList-item').forEach(item => {
                const labelSpan = item.querySelector('span');
                const p = item.querySelector('p');
                if (labelSpan && p) {
                    const label = labelSpan.textContent.trim();
                    let value = '';

                    // === 1. 属性 (修复双逗号) ===
                    if (label === '属性') {
                        // 只提取 A 标签内的文本，忽略 P 标签内的逗号文本节点
                        const attrs = Array.from(p.querySelectorAll('a'))
                                           .map(a => a.textContent.trim())
                                           .filter(t => t);
                        if (attrs.length > 0) {
                            value = attrs.join('、');
                        } else {
                            // 兜底：如果没有链接，则暴力清理
                            value = p.textContent.replace(/\s+/g, ' ').replace(/、+/g, '、').trim();
                        }
                    }
                    // === 2. 外部链接 (提取 Icon) ===
                    else if (label === '外部链接' || label === '官网链接') {
                        const links = p.querySelectorAll('a');
                        const linkData = []; // 暂存结构化数据，生成时再拼接

                        links.forEach(aTag => {
                            let rawUrl = aTag.href;
                            // 解码 Hpoi 跳转链接
                            if (rawUrl.includes('hprdrt?url=')) {
                                try {
                                    const params = new URLSearchParams(rawUrl.split('?')[1]);
                                    rawUrl = decodeURIComponent(params.get('url')) || rawUrl;
                                } catch (e) { }
                            }

                            const imgTag = aTag.querySelector('img');
                            if (imgTag) {
                                // 发现图标：加入上传队列
                                imagesToProcess.push({ type: 'icon', url: imgTag.src });
                                linkData.push({
                                    type: 'icon',
                                    src: imgTag.src, // 原始地址作为 Key
                                    href: rawUrl
                                });
                            } else {
                                const text = aTag.textContent.trim() || '链接';
                                linkData.push({
                                    type: 'text',
                                    text: text,
                                    href: rawUrl
                                });
                            }
                        });
                        value = linkData; // 存为对象数组，buildMarkdown 时处理
                    }
                    // === 3. 普通文本 ===
                    else {
                        value = Array.from(p.childNodes)
                            .map(n => n.textContent.trim())
                            .filter(t => t)
                            .join('、')
                            .replace(/、、/g, '、');
                    }

                    if (value) info[label] = value;
                }
            });

            // 封面图
            const coverEl = document.querySelector('.hpoi-ibox-img img');
            if (coverEl) {
                const src = coverEl.src.split('?')[0];
                info.coverImg = src;
                imagesToProcess.push({ type: 'cover', url: src });
            }

            // 官图
            info.gallery = [];
            document.querySelectorAll('.swiper-gallery .swiper-slide img').forEach(img => {
                let src = img.src || img.getAttribute('data-src');
                if (src) {
                    src = src.split('?')[0];
                    if (src.includes('/pic/s/')) src = src.replace('/pic/s/', '/pic/n/');
                    info.gallery.push(src); // 存入信息以便预览（可选）
                    imagesToProcess.push({ type: 'gallery', url: src });
                }
            });

            return { info, images: imagesToProcess };
        },

        processImage: async (imgObj) => {
            try {
                // 下载 Blob (含防盗链处理)
                const blob = await Core.fetchBlob(imgObj.url);

                // 类型检查
                let ext = 'jpg';
                if (blob.type === 'image/jpeg') ext = 'jpg';
                else if (blob.type === 'image/png') ext = 'png';
                else if (blob.type === 'image/webp') ext = 'webp';
                else if (blob.type === 'image/gif') ext = 'gif';
                else {
                    const urlExt = imgObj.url.split('.').pop().toLowerCase();
                    if (['jpg','jpeg','png','webp','gif'].includes(urlExt)) {
                        ext = urlExt === 'jpeg' ? 'jpg' : urlExt;
                    }
                }

                // Icon 可能很小，文件名加个标识
                const prefix = imgObj.type === 'icon' ? 'icon_' : 'hpoi_';
                const filename = `${prefix}${Date.now()}_${Math.random().toString(36).substr(2, 5)}.${ext}`;

                const uploadedUrl = await Core.uploadToPiscurDirect(blob, filename, CONFIG.piscurUrl, CONFIG.apiKey);

                return { original: imgObj.url, newUrl: uploadedUrl, type: imgObj.type };
            } catch (e) {
                UI.log(`上传失败 [${imgObj.type}]: ${e}`, 'error');
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
                    onload: (response) => {
                        if (response.status === 200) {
                             // 简单校验
                             const type = response.response.type;
                             if (type && (type.startsWith('image/') || type === 'application/octet-stream')) {
                                 resolve(response.response);
                             } else {
                                 reject(`非图片内容 (${type})`);
                             }
                        } else {
                            reject(`HTTP ${response.status}`);
                        }
                    },
                    onerror: (err) => reject('网络请求失败')
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
                    headers: {
                        "Authorization": `Api-Key ${key}`,
                        "Accept": "application/json"
                    },
                    data: formData,
                    onload: (response) => {
                        try {
                            const json = JSON.parse(response.responseText);
                            if (json.success === true || json.status === true) {
                                let finalUrl = "";

                                // 提取 URL 或 ID
                                if (json.data && json.data.url) {
                                    finalUrl = json.data.url;
                                } else if (json.data && json.data.id) {
                                    // ID 模式
                                    finalUrl = `${host}/i/${json.data.id}.jpg`; // 默认占位，下面会强转
                                } else if (json.data && json.data.links && json.data.links.url) {
                                    finalUrl = json.data.links.url;
                                }

                                // === 强制替换后缀为 .webp ===
                                if (finalUrl) {
                                    // 无论原后缀是什么，都替换为 .webp
                                    finalUrl = finalUrl.replace(/\.[^.]+$/, '.webp');
                                    resolve(finalUrl);
                                    return;
                                }
                            }
                            const errorMsg = (json.data && json.data.message) || json.message || '未知错误';
                            reject(`API 错误: ${errorMsg}`);
                        } catch (e) {
                            reject('JSON 解析错误');
                        }
                    },
                    onerror: (err) => reject('网络层错误')
                });
            });
        },

        buildMarkdown: (data, uploadedImages) => {
            // 辅助函数：根据原始 URL 查找上传后的 URL
            const getUrl = (originalUrl) => {
                const img = uploadedImages.find(i => i.original === originalUrl);
                return (img && !img.error) ? img.newUrl : originalUrl;
            };

            const cover = uploadedImages.find(i => i.type === 'cover');

            let md = `## ${data.name}\n\n`;

            if (cover && !cover.error) {
                md += `![封面](${cover.newUrl})\n\n`;
            } else if (data.coverImg) {
                md += `![封面](${data.coverImg})\n\n`;
            }

            md += `| 项目 | 内容 |\n| :--- | :--- |\n`;

            const specificKeys = ['名称', '属性', '定价', '出货日', '比例', '制作', '系列', '角色', '作品', '官网链接', '外部链接'];
            specificKeys.forEach(key => {
                if (data[key]) {
                    let val = data[key];

                    // 特殊处理链接数组
                    if (Array.isArray(val)) {
                        val = val.map(item => {
                            if (item.type === 'icon') {
                                const newSrc = getUrl(item.src);
                                // HTML img 标签限制高度为 12px
                                return `<a href="${item.href}" target="_blank"><img src="${newSrc}" height="12px"/></a>`;
                            } else {
                                return `[${item.text}](${item.href})`;
                            }
                        }).join(' ');
                    }

                    md += `| ${key} | ${val} |\n`;
                }
            });

            for (let [k, v] of Object.entries(data)) {
                if (!specificKeys.includes(k) && k !== 'name' && k !== 'coverImg' && k !== 'gallery') {
                    if (typeof v === 'string') md += `| ${k} | ${v} |\n`;
                }
            }

            md += `\n### 官方图片\n\n`;
            const gallery = uploadedImages.filter(i => i.type === 'gallery');
            if (gallery.length > 0) {
                gallery.forEach(img => {
                    md += `![官图](${img.newUrl || img.original})\n`;
                });
            } else {
                md += `> (未检测到官方图片)\n`;
            }
            return md;
        }
    };

    UI.init();

})();