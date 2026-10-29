// ==UserScript==
// @name         学堂在线自动播放助手
// @namespace    http://tampermonkey.net/
// @version      1.3
// @description  学堂在线视频自动播放、自动切换下一集、自定义倍速（突破2x上限）
// @author       sfo
// @match        https://www.xuetangx.com/learn/*
// @match        https://next.xuetangx.com/learn/*
// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    // ==================== 配置 ====================
    const CONFIG = {
        defaultSpeed: GM_getValue('xtx_speed', 2),      // 默认倍速
        autoPlay: GM_getValue('xtx_autoplay', true),      // 自动播放
        autoNext: GM_getValue('xtx_autonext', true),      // 自动切换下一集
        skipCompleted: GM_getValue('xtx_skipcompleted', true), // 跳过已完成的视频
        checkInterval: 2000,                               // 检查间隔(ms)
        maxSpeed: 16,                                      // 最大倍速
    };

    // 可选倍速列表（突破原站2x上限）
    const SPEED_OPTIONS = [0.5, 1, 1.25, 1.5, 2, 2.5, 3, 4, 6, 8, 16];

    // ==================== 工具函数 ====================
    function log(...args) {
        console.log('[学堂在线助手]', ...args);
    }

    function getVideo() {
        return document.querySelector('video.xt_video_player') || document.querySelector('video');
    }

    // 等待元素出现
    function waitForElement(selector, timeout = 15000) {
        return new Promise((resolve) => {
            const el = document.querySelector(selector);
            if (el) return resolve(el);

            const observer = new MutationObserver(() => {
                const el = document.querySelector(selector);
                if (el) {
                    observer.disconnect();
                    resolve(el);
                }
            });
            observer.observe(document.body, { childList: true, subtree: true });

            setTimeout(() => {
                observer.disconnect();
                resolve(null);
            }, timeout);
        });
    }

    // ==================== 倍速控制 ====================
    function setSpeed(rate) {
        const video = getVideo();
        if (video) {
            video.playbackRate = rate;
            log('倍速设置为:', rate);
        }
        // 更新播放器UI显示
        updateSpeedDisplay(rate);
    }

    function updateSpeedDisplay(rate) {
        // 尝试更新播放器自带的倍速显示
        const speedValue = document.querySelector('xt-speedvalue');
        if (speedValue) {
            speedValue.textContent = rate.toFixed(2) + 'X';
        }
        // 更新倍速列表选中状态
        const speedItems = document.querySelectorAll('li[data-speed]');
        speedItems.forEach(item => {
            if (parseFloat(item.dataset.speed) === rate) {
                item.classList.add('xt_video_player_common_active');
            } else {
                item.classList.remove('xt_video_player_common_active');
            }
        });
    }

    // ==================== 防后台暂停 ====================
    // 浏览器在标签页不可见时会节流定时器甚至暂停视频，这里做对抗
    function setupAntiBackgroundThrottle() {
        // 1. 使用 Web Audio API 保持页面"活跃"，防止浏览器深度节流
        try {
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();
            gainNode.gain.value = 0; // 静音，不产生实际声音
            oscillator.connect(gainNode);
            gainNode.connect(audioCtx.destination);
            oscillator.frequency.value = 1;
            oscillator.start();
            log('已启用 Web Audio 保活机制');
        } catch (e) {
            log('Web Audio 保活失败（不影响核心功能）:', e.message);
        }

        // 2. 监听页面可见性变化，回到前台时立即恢复播放
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                log('页面回到前台，检查播放状态');
                const video = getVideo();
                if (video && CONFIG.autoPlay && video.paused && !video.ended && !video.dataset.userPaused) {
                    video.play().catch(() => {});
                }
            }
        });

        // 3. 使用更频繁的检查（后台时浏览器会节流到最低1次/秒，但仍可工作）
        // 使用 requestAnimationFrame + setInterval 双保险
        let lastCheck = 0;
        function rafCheck() {
            const now = Date.now();
            if (now - lastCheck >= CONFIG.checkInterval) {
                lastCheck = now;
                checkAndPlay();
            }
            requestAnimationFrame(rafCheck);
        }
        requestAnimationFrame(rafCheck);
    }

    function checkAndPlay() {
        if (!CONFIG.autoPlay) return;
        const video = getVideo();
        if (!video) return;

        // 视频暂停且非结束时自动恢复播放
        if (video.paused && !video.ended) {
            if (!video.dataset.userPaused) {
                video.play().catch(() => {});
            }
        }

        // 检测视频是否卡在缓冲状态（后台时可能出现）
        if (video.readyState < 3 && !video.paused) {
            log('视频缓冲中，readyState:', video.readyState);
        }
    }

    // ==================== 自动播放 ====================
    let playCheckTimer = null;

    function startAutoPlay() {
        if (playCheckTimer) clearInterval(playCheckTimer);

        playCheckTimer = setInterval(() => {
            checkAndPlay();
        }, CONFIG.checkInterval);

        // 启用防后台节流
        setupAntiBackgroundThrottle();
    }

    // ==================== 自动切换下一集 ====================
    function setupAutoNext() {
        const video = getVideo();
        if (!video) return;

        // 避免重复绑定
        if (video.dataset.autoNextBound) return;
        video.dataset.autoNextBound = 'true';

        video.addEventListener('ended', () => {
            if (!CONFIG.autoNext) return;
            log('视频播放结束，准备切换下一集');
            setTimeout(() => goToNextLesson(), 1000);
        });

        // 备用方案：监听视频接近结束时主动触发
        video.addEventListener('timeupdate', () => {
            if (!CONFIG.autoNext) return;
            if (video.duration && video.currentTime > 0) {
                const remaining = video.duration - video.currentTime;
                // 剩余不到3秒时准备切换
                if (remaining < 3 && remaining > 0 && !video.dataset.switching) {
                    video.dataset.switching = 'true';
                    log('视频即将结束，准备切换...');
                }
            }
        });

        video.addEventListener('play', () => {
            delete video.dataset.switching;
        });
    }

    // ==================== 视频完成状态检测 ====================
    // 获取所有"视频"类型的章节项
    function getVideoItems() {
        const allItems = document.querySelectorAll('[id^="unit-item-"]');
        return Array.from(allItems).filter(item => {
            const typeEl = item.querySelector('.item-type');
            return typeEl && typeEl.textContent.trim() === '视频';
        });
    }

    // 检查某个章节项是否已完成
    // 已完成：.item-status 内有 .is-finish 图标
    // 进行中：.item-status 内有 .status-pie（部分进度）
    // 未开始：.item-status 为空
    function isVideoCompleted(item) {
        const statusEl = item.querySelector('.item-status');
        if (!statusEl) return false;
        return statusEl.querySelector('.is-finish') !== null;
    }

    // 展开指定项的所有折叠父级菜单
    function expandParentMenus(item) {
        let parent = item.parentElement;
        while (parent) {
            if (parent.classList.contains('menu-content') && parent.style.display === 'none') {
                const menuTitle = parent.previousElementSibling;
                if (menuTitle && menuTitle.classList.contains('menu-title')) {
                    menuTitle.click();
                    log('展开折叠目录:', menuTitle.textContent.trim());
                }
            }
            parent = parent.parentElement;
        }
    }

    // 点击某个章节项（先展开父级菜单，再点击）
    function clickLessonItem(item) {
        expandParentMenus(item);
        setTimeout(() => {
            log('点击章节项:', item.id);
            item.click();
        }, 300);
    }

    function goToNextLesson() {
        log('正在切换到下一集（跳过作业题）...');

        const videoItems = getVideoItems();
        const activeIndex = videoItems.findIndex(item => item.classList.contains('is-active'));
        log(`当前视频项索引: ${activeIndex}, 总视频数: ${videoItems.length}`);

        if (activeIndex < 0) {
            log('未找到当前激活的视频项');
            return;
        }

        // 寻找下一个未完成的视频项（如果开启了跳过已完成）
        let nextItem = null;
        for (let i = activeIndex + 1; i < videoItems.length; i++) {
            if (CONFIG.skipCompleted && isVideoCompleted(videoItems[i])) {
                log(`视频 ${videoItems[i].id} 已完成，跳过`);
                continue;
            }
            nextItem = videoItems[i];
            break;
        }

        if (nextItem) {
            clickLessonItem(nextItem);
        } else {
            log('已经是最后一集了（或后续视频均已完成）');
        }
    }

    // ==================== 跳过已完成视频 ====================
    // 初始化时：如果当前视频已完成，自动跳到第一个未完成的视频
    function skipToFirstUncompleted() {
        if (!CONFIG.skipCompleted) return;

        const videoItems = getVideoItems();
        if (videoItems.length === 0) {
            log('未找到视频项，稍后重试');
            return false;
        }

        const activeIndex = videoItems.findIndex(item => item.classList.contains('is-active'));
        if (activeIndex < 0) {
            log('未找到当前激活项');
            return false;
        }

        // 检查当前视频是否已完成
        if (isVideoCompleted(videoItems[activeIndex])) {
            log('当前视频已完成，寻找第一个未完成的视频...');

            // 找到第一个未完成的视频
            const firstUncompleted = videoItems.find(item => !isVideoCompleted(item));
            if (firstUncompleted && firstUncompleted !== videoItems[activeIndex]) {
                log('跳转到第一个未完成视频:', firstUncompleted.id);
                clickLessonItem(firstUncompleted);
                return true;
            } else {
                log('所有视频均已完成');
            }
        } else {
            log('当前视频未完成，无需跳转');
        }
        return false;
    }

    // ==================== 悬浮控制面板 ====================
    function createPanel() {
        const panel = document.createElement('div');
        panel.id = 'xtx-helper-panel';
        panel.innerHTML = `
            <div class="xtx-header">
                <span>学堂在线助手</span>
                <span class="xtx-toggle">-</span>
            </div>
            <div class="xtx-body">
                <div class="xtx-row">
                    <label>倍速</label>
                    <select class="xtx-speed-select">
                        ${SPEED_OPTIONS.map(s => `<option value="${s}" ${s === CONFIG.defaultSpeed ? 'selected' : ''}>${s}x</option>`).join('')}
                    </select>
                </div>
                <div class="xtx-row">
                    <label>自定义倍速</label>
                    <input type="number" class="xtx-speed-input" min="0.1" max="${CONFIG.maxSpeed}" step="0.1" value="${CONFIG.defaultSpeed}" placeholder="0.1~${CONFIG.maxSpeed}">
                </div>
                <div class="xtx-row">
                    <label class="xtx-switch-label">
                        <input type="checkbox" class="xtx-autoplay-cb" ${CONFIG.autoPlay ? 'checked' : ''}>
                        <span>自动播放</span>
                    </label>
                </div>
                <div class="xtx-row">
                    <label class="xtx-switch-label">
                        <input type="checkbox" class="xtx-autonext-cb" ${CONFIG.autoNext ? 'checked' : ''}>
                        <span>自动下一集</span>
                    </label>
                </div>
                <div class="xtx-row">
                    <label class="xtx-switch-label">
                        <input type="checkbox" class="xtx-skipcompleted-cb" ${CONFIG.skipCompleted ? 'checked' : ''}>
                        <span>跳过已完成</span>
                    </label>
                </div>
                <div class="xtx-row xtx-shortcuts">
                    <div>快捷键说明:</div>
                    <div>←/→ 倍速 -0.5/+0.5</div>
                    <div>空格 暂停/播放</div>
                    <div>N 下一集</div>
                </div>
            </div>
        `;

        const style = document.createElement('style');
        style.textContent = `
            #xtx-helper-panel {
                position: fixed;
                top: 80px;
                right: 20px;
                z-index: 99999;
                background: #fff;
                border-radius: 8px;
                box-shadow: 0 2px 12px rgba(0,0,0,0.15);
                font-family: "Microsoft YaHei", sans-serif;
                font-size: 13px;
                color: #333;
                overflow: hidden;
                user-select: none;
            }
            #xtx-helper-panel .xtx-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 8px 12px;
                background: #2c5dc4;
                color: #fff;
                cursor: move;
                font-weight: bold;
            }
            #xtx-helper-panel .xtx-toggle {
                cursor: pointer;
                width: 20px;
                text-align: center;
                font-size: 16px;
            }
            #xtx-helper-panel .xtx-body {
                padding: 10px 12px;
                min-width: 200px;
            }
            #xtx-helper-panel.xtx-collapsed .xtx-body {
                display: none;
            }
            #xtx-helper-panel .xtx-row {
                margin-bottom: 8px;
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 8px;
            }
            #xtx-helper-panel .xtx-row label {
                white-space: nowrap;
            }
            #xtx-helper-panel select,
            #xtx-helper-panel input[type="number"] {
                width: 80px;
                padding: 2px 4px;
                border: 1px solid #ddd;
                border-radius: 4px;
                font-size: 12px;
            }
            #xtx-helper-panel .xtx-switch-label {
                display: flex;
                align-items: center;
                gap: 4px;
                cursor: pointer;
            }
            #xtx-helper-panel .xtx-shortcuts {
                flex-direction: column;
                align-items: flex-start;
                font-size: 11px;
                color: #999;
                border-top: 1px solid #eee;
                padding-top: 8px;
            }
            #xtx-helper-panel .xtx-shortcuts div {
                line-height: 1.6;
            }
        `;

        document.head.appendChild(style);
        document.body.appendChild(panel);

        // 折叠/展开
        const toggle = panel.querySelector('.xtx-toggle');
        toggle.addEventListener('click', () => {
            panel.classList.toggle('xtx-collapsed');
            toggle.textContent = panel.classList.contains('xtx-collapsed') ? '+' : '-';
        });

        // 拖拽
        makeDraggable(panel, panel.querySelector('.xtx-header'));

        // 倍速下拉选择
        const speedSelect = panel.querySelector('.xtx-speed-select');
        speedSelect.addEventListener('change', () => {
            const rate = parseFloat(speedSelect.value);
            CONFIG.defaultSpeed = rate;
            GM_setValue('xtx_speed', rate);
            setSpeed(rate);
            panel.querySelector('.xtx-speed-input').value = rate;
        });

        // 自定义倍速输入
        const speedInput = panel.querySelector('.xtx-speed-input');
        speedInput.addEventListener('change', () => {
            let rate = parseFloat(speedInput.value);
            if (isNaN(rate) || rate < 0.1) rate = 0.1;
            if (rate > CONFIG.maxSpeed) rate = CONFIG.maxSpeed;
            CONFIG.defaultSpeed = rate;
            GM_setValue('xtx_speed', rate);
            setSpeed(rate);
            speedInput.value = rate;
            // 更新下拉框
            const option = Array.from(speedSelect.options).find(o => parseFloat(o.value) === rate);
            speedSelect.value = option ? option.value : '';
        });

        // 自动播放开关
        const autoplayCb = panel.querySelector('.xtx-autoplay-cb');
        autoplayCb.addEventListener('change', () => {
            CONFIG.autoPlay = autoplayCb.checked;
            GM_setValue('xtx_autoplay', autoplayCb.checked);
            log('自动播放:', CONFIG.autoPlay);
        });

        // 自动下一集开关
        const autonextCb = panel.querySelector('.xtx-autonext-cb');
        autonextCb.addEventListener('change', () => {
            CONFIG.autoNext = autonextCb.checked;
            GM_setValue('xtx_autonext', autonextCb.checked);
            log('自动下一集:', CONFIG.autoNext);
        });

        // 跳过已完成开关
        const skipCompletedCb = panel.querySelector('.xtx-skipcompleted-cb');
        skipCompletedCb.addEventListener('change', () => {
            CONFIG.skipCompleted = skipCompletedCb.checked;
            GM_setValue('xtx_skipcompleted', skipCompletedCb.checked);
            log('跳过已完成:', CONFIG.skipCompleted);
        });

        return panel;
    }

    function makeDraggable(panel, handle) {
        let isDragging = false;
        let startX, startY, startLeft, startTop;

        handle.addEventListener('mousedown', (e) => {
            if (e.target.classList.contains('xtx-toggle')) return;
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            const rect = panel.getBoundingClientRect();
            startLeft = rect.left;
            startTop = rect.top;
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            panel.style.left = (startLeft + e.clientX - startX) + 'px';
            panel.style.top = (startTop + e.clientY - startY) + 'px';
            panel.style.right = 'auto';
        });

        document.addEventListener('mouseup', () => {
            isDragging = false;
        });
    }

    // ==================== 快捷键 ====================
    function setupShortcuts() {
        document.addEventListener('keydown', (e) => {
            // 忽略输入框中的按键
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;

            const video = getVideo();
            if (!video) return;

            switch (e.key) {
                case 'ArrowLeft':
                    e.preventDefault();
                    adjustSpeed(-0.5);
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    adjustSpeed(0.5);
                    break;
                case ' ':
                    e.preventDefault();
                    if (video.paused) {
                        video.play();
                        if (video.dataset.userPaused) delete video.dataset.userPaused;
                    } else {
                        video.pause();
                        video.dataset.userPaused = 'true';
                    }
                    break;
                case 'n':
                case 'N':
                    e.preventDefault();
                    goToNextLesson();
                    break;
            }
        });
    }

    function adjustSpeed(delta) {
        let newSpeed = CONFIG.defaultSpeed + delta;
        if (newSpeed < 0.1) newSpeed = 0.1;
        if (newSpeed > CONFIG.maxSpeed) newSpeed = CONFIG.maxSpeed;
        // 取整到0.1
        newSpeed = Math.round(newSpeed * 10) / 10;
        CONFIG.defaultSpeed = newSpeed;
        GM_setValue('xtx_speed', newSpeed);
        setSpeed(newSpeed);

        // 更新面板
        const input = document.querySelector('.xtx-speed-input');
        const select = document.querySelector('.xtx-speed-select');
        if (input) input.value = newSpeed;
        if (select) {
            const option = Array.from(select.options).find(o => parseFloat(o.value) === newSpeed);
            select.value = option ? option.value : '';
        }
        log('倍速调整为:', newSpeed);
    }

    // ==================== 首次播放提示 ====================
    function tryAutoPlay(video) {
        // 策略1：直接播放（页面已有用户交互时通常成功）
        video.play().then(() => {
            log('视频已自动开始播放');
        }).catch(() => {
            log('自动播放被浏览器拦截，尝试静音播放后恢复声音...');
            // 策略2：静音后播放（浏览器允许静音自动播放），再取消静音
            video.muted = true;
            video.play().then(() => {
                setTimeout(() => {
                    video.muted = false;
                    log('已恢复声音');
                }, 1000);
            }).catch(() => {
                log('需要手动点击一次播放按钮（浏览器策略限制）');
                showPlayHint();
            });
        });
    }

    function showPlayHint() {
        const hint = document.createElement('div');
        hint.id = 'xtx-play-hint';
        hint.textContent = '点击此处开始自动播放';
        hint.style.cssText = `
            position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
            z-index: 100000; background: rgba(44,93,196,0.95); color: #fff;
            padding: 16px 32px; border-radius: 8px; font-size: 16px;
            cursor: pointer; box-shadow: 0 4px 20px rgba(0,0,0,0.3);
            font-family: "Microsoft YaHei", sans-serif;
        `;
        hint.addEventListener('click', () => {
            const video = getVideo();
            if (video) {
                video.muted = false;
                video.play().catch(() => {});
            }
            hint.remove();
        });
        document.body.appendChild(hint);
        // 10秒后自动消失
        setTimeout(() => { if (hint.parentNode) hint.remove(); }, 10000);
    }

    // ==================== 切换章节列表筛选为"视频" ====================
    function switchToVideoFilter() {
        // 章节列表上方的筛选按钮触发器（显示"全部"的下拉）
        const filterTrigger = document.querySelector('.unit-box-title-reference');
        if (!filterTrigger) {
            log('未找到筛选按钮，跳过');
            return;
        }

        // 检查当前是否已经是"视频"筛选
        const currentText = filterTrigger.textContent.trim();
        if (currentText.includes('视频')) {
            log('已经是视频筛选模式，无需切换');
            return;
        }

        // 点击触发器打开筛选弹出框
        filterTrigger.click();
        log('点击筛选按钮');

        // 等待弹出框出现，点击"视频"选项
        setTimeout(() => {
            const popover = document.querySelector('.popover-course-action-lesson-left');
            if (!popover) {
                log('筛选弹出框未出现，重试...');
                // 备用：直接在文档中查找
                const videoOption = Array.from(document.querySelectorAll('.testDetail_j p')).find(p => p.textContent.trim() === '视频');
                if (videoOption) {
                    videoOption.click();
                    log('已切换为视频筛选（备用方式）');
                }
                return;
            }

            const videoOption = Array.from(popover.querySelectorAll('.testDetail_j p')).find(p => p.textContent.trim() === '视频');
            if (videoOption) {
                videoOption.click();
                log('已切换为视频筛选模式');
            } else {
                log('未找到"视频"筛选选项');
            }
        }, 500);
    }

    // ==================== 开启内置自动连播 ====================
    function enableBuiltinAutoNext() {
        const autoNextToggle = document.querySelector('li[data-switch="turns"] .onoff-btn');
        if (autoNextToggle && autoNextToggle.classList.contains('off')) {
            autoNextToggle.click();
            log('已开启内置自动连播');
        }
    }

    // ==================== 监听页面切换（SPA） ====================
    function setupSPAWatcher() {
        let lastUrl = location.href;

        // 监听 URL 变化（SPA 路由切换）
        const checkUrlChange = () => {
            if (location.href !== lastUrl) {
                lastUrl = location.href;
                log('页面切换:', lastUrl);
                setTimeout(() => initOnPageChange(), 2000);
            }
        };

        setInterval(checkUrlChange, 1000);

        // 监听 video 元素变化
        const videoObserver = new MutationObserver(() => {
            const video = getVideo();
            if (video && !video.dataset.autoNextBound) {
                setupAutoNext();
            }
        });
        videoObserver.observe(document.body, { childList: true, subtree: true });
    }

    function initOnPageChange() {
        // 切换为视频筛选模式（跳过作业/考试）
        switchToVideoFilter();

        // 延迟检查是否需要跳过已完成的视频
        setTimeout(() => {
            if (!skipToFirstUncompleted()) {
                // 没有跳转，正常初始化当前视频
                const video = getVideo();
                if (video) {
                    setSpeed(CONFIG.defaultSpeed);
                    setupAutoNext();
                    if (CONFIG.autoPlay && video.paused) {
                        tryAutoPlay(video);
                    }
                }
            } else {
                // 跳转后等待新视频加载
                setTimeout(() => {
                    const video = getVideo();
                    if (video) {
                        setSpeed(CONFIG.defaultSpeed);
                        setupAutoNext();
                        if (CONFIG.autoPlay && video.paused) {
                            tryAutoPlay(video);
                        }
                    }
                }, 3000);
            }
        }, 1500);
    }

    // ==================== 主初始化 ====================
    async function init() {
        log('脚本启动，等待页面加载...');

        // 创建控制面板
        createPanel();

        // 设置快捷键
        setupShortcuts();

        // 等待视频元素出现
        await waitForElement('video', 30000);

        log('检测到视频元素，初始化完成');

        // 切换为视频筛选模式（跳过作业/考试）
        switchToVideoFilter();

        // 跳到第一个未完成的视频（如果当前视频已完成）
        setTimeout(() => {
            if (!skipToFirstUncompleted()) {
                // 如果没有跳转（当前视频未完成），则正常初始化播放
                setSpeed(CONFIG.defaultSpeed);
                startAutoPlay();
                setupAutoNext();
                enableBuiltinAutoNext();

                const video = getVideo();
                if (video && CONFIG.autoPlay && video.paused) {
                    tryAutoPlay(video);
                }
            } else {
                // 跳转后等待新页面加载，再初始化
                setTimeout(() => {
                    setSpeed(CONFIG.defaultSpeed);
                    startAutoPlay();
                    setupAutoNext();
                    enableBuiltinAutoNext();

                    const video = getVideo();
                    if (video && CONFIG.autoPlay && video.paused) {
                        tryAutoPlay(video);
                    }
                }, 3000);
            }
        }, 1500);

        // 监听 SPA 页面切换
        setupSPAWatcher();

        log('初始化全部完成');
    }

    // 启动
    init();
})();
