(function () {
    'use strict';

    const DEFAULT_HEADERS = {
        'Host': 'kards.live.1939api.com',
        'Accept-Encoding': 'deflate, gzip',
        'Accept': 'application/json',
        'X-Api-Key': '1939-kards-5dcda429f:Kards 1.46.24673.launcher',
        'Drift-Api-Key': '1939-kards-5dcda429f:Kards 1.46.24673.launcher',
        'Content-Type': 'application/json',
        'User-Agent': 'kards/++UE5+Release-5.6-CL-44394996 (http-eventloop) Windows/10.0.22000.1.256.64bit'
    };

    let authToken = null;
    let currentUserId = null;
    let currentPlayerId = null;
    let selectedDeckId = null;
    let decksData = [];

    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    const loginSection = $('#loginSection');
    const dashboardSection = $('#dashboardSection');
    const loginForm = $('#loginForm');
    const loginBtn = $('#loginBtn');
    const logoutBtn = $('#logoutBtn');
    const usernameInput = $('#usernameInput');
    const passwordInput = $('#passwordInput');
    const statusMessage = $('#statusMessage');
    const userIdDisplay = $('#userIdDisplay');
    const playerIdDisplay = $('#playerIdDisplay');
    const deckList = $('#deckList');
    const refreshDecksBtn = $('#refreshDecksBtn');
    const deckDetailPanel = $('#deckDetailPanel');
    const detailName = $('#detailName');
    const detailId = $('#detailId');
    const detailFaction = $('#detailFaction');
    const deckCodeInput = $('#deckCodeInput');
    const updateDeckBtn = $('#updateDeckBtn');
    const cancelUpdateBtn = $('#cancelUpdateBtn');

    function showStatus(message, type) {
        statusMessage.textContent = message;
        statusMessage.className = 'status-message show ' + (type || 'info');
    }

    function hideStatus() {
        statusMessage.className = 'status-message';
        statusMessage.textContent = '';
    }

    function setLoading(btn, loading) {
        if (loading) {
            btn.classList.add('loading');
            btn.disabled = true;
        } else {
            btn.classList.remove('loading');
            btn.disabled = false;
        }
    }

    function generateUUID() {
        const hex = '0123456789abcdef';
        let uuid = '';
        for (let i = 0; i < 32; i++) {
            uuid += hex[Math.floor(Math.random() * 16)];
        }
        return uuid.toUpperCase();
    }

    function generateDevicePassword() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let pwd = '';
        for (let i = 0; i < 32; i++) {
            pwd += chars[Math.floor(Math.random() * chars.length)];
        }
        return pwd;
    }

    function buildHeaders(extra) {
        const h = Object.assign({}, DEFAULT_HEADERS);
        if (authToken) {
            h['Authorization'] = 'JWT ' + authToken;
        }
        if (extra) {
            Object.assign(h, extra);
        }
        return h;
    }

    async function apiRequest(method, path, body) {
        const url = '/api' + path;
        const options = {
            method: method,
            headers: buildHeaders()
        };
        if (body !== undefined) {
            options.body = JSON.stringify(body);
        }
        const response = await fetch(url, options);
        const contentType = response.headers.get('content-type') || '';
        let data;
        if (contentType.includes('application/json')) {
            data = await response.json();
        } else {
            data = await response.text();
        }
        if (!response.ok) {
            const errMsg = (data && data.message) ? data.message : (typeof data === 'string' ? data : JSON.stringify(data));
            throw new Error(errMsg || '请求失败 (HTTP ' + response.status + ')');
        }
        return data;
    }

    async function handleLogin(username, password) {
        const deviceId = generateUUID();
        const devicePassword = generateDevicePassword();

        const loginData = {
            "provider": "device_id",
            "provider_details": {
                "payment_provider": "XSOLLA"
            },
            "client_type": "UE5",
            "build": "Kards 1.46.24673.launcher",
            "platform_type": "Windows",
            "app_guid": "Kards",
            "version": "Kards 1.46.24673.launcher",
            "platform_info": JSON.stringify({
                "device_profile": "Windows",
                "cpu_vendor": "GenuineIntel",
                "cpu_brand": "Intel(R) Xeon(R) CPU E5-2680 v2 @ 2.80GHz",
                "gpu_brand": "NVIDIA GeForce GTX 1060 6GB",
                "num_cores_physical": 10,
                "num_cores_logical": 20,
                "physical_memory_gb": 16,
                "hash": "4d74228ed8d8db8684cc5817ab7d12b10d3decc6b4f16b8756",
                "locale": "zh-CN"
            }, null, "\t"),
            "platform_version": "Windows 11 (21H2) [10.0.22000.2538] ",
            "account_linking": JSON.stringify({
                "username": username,
                "password": password
            }, null, "\t"),
            "language": "zh-Hans",
            "automatic_account_creation": true,
            "username": "device:Windows-" + deviceId,
            "password": devicePassword
        };

        const sessionResult = await apiRequest('POST', '/session', loginData);

        if (sessionResult.jwt) {
            authToken = sessionResult.jwt;
        } else if (sessionResult.token) {
            authToken = sessionResult.token;
        } else if (sessionResult.access_token) {
            authToken = sessionResult.access_token;
        } else {
            const possibleToken = sessionResult.token || sessionResult.jwt || sessionResult.access_token || sessionResult.session_id || (sessionResult.session && sessionResult.session.token);
            if (possibleToken) {
                authToken = possibleToken;
            } else {
                throw new Error('登录响应中未找到 JWT token');
            }
        }

        const authResult = await apiRequest('GET', '/');
        let userId = null;
        let playerId = null;

        if (authResult.current_user) {
            userId = authResult.current_user.user_id;
            playerId = authResult.current_user.player_id;
        } else if (authResult.user_id !== undefined) {
            userId = authResult.user_id;
            playerId = authResult.player_id;
        }

        if (authResult.user && authResult.user.id !== undefined) {
            userId = authResult.user.id;
        }
        if (authResult.player && authResult.player.id !== undefined) {
            playerId = authResult.player.id;
        }

        if (playerId === null) {
            const fallback = await apiRequest('GET', '/players');
            if (Array.isArray(fallback) && fallback.length > 0) {
                playerId = fallback[0].id || fallback[0].player_id;
            }
        }

        if (playerId === null) {
            throw new Error('无法获取玩家ID，请检查账号');
        }

        currentUserId = userId;
        currentPlayerId = playerId;

        userIdDisplay.textContent = userId || '-';
        playerIdDisplay.textContent = playerId;
    }

    async function fetchDecks() {
        if (!currentPlayerId) return;
        const data = await apiRequest('GET', '/players/' + currentPlayerId + '/decks');
        let decks = [];
        if (Array.isArray(data)) {
            decks = data;
        } else if (data.decks && Array.isArray(data.decks)) {
            decks = data.decks;
        } else if (data.data && Array.isArray(data.data)) {
            decks = data.data;
        } else if (data.items && Array.isArray(data.items)) {
            decks = data.items;
        } else if (data.results && Array.isArray(data.results)) {
            decks = data.results;
        }
        decksData = decks;
        return decks;
    }

    function getFactionName(faction) {
        if (!faction) return '通用';
        const map = {
            'america': '美国',
            'britain': '英国',
            'germany': '德国',
            'japan': '日本',
            'soviet': '苏联',
            'france': '法国',
            'italy': '意大利',
            'poland': '波兰',
            'finland': '芬兰',
            'croatia': '克罗地亚',
            'hungary': '匈牙利',
            'bulgaria': '保加利亚',
            'romania': '罗马尼亚',
            'czechoslovakia': '捷克斯洛伐克',
            'belgium': '比利时',
            'netherlands': '荷兰',
            'china': '中国',
            'australia': '澳大利亚',
            'canada': '加拿大',
            'newzealand': '新西兰',
            'greece': '希腊',
            'norway': '挪威',
            'yugoslavia': '南斯拉夫',
            'taiwan': '中华民国'
        };
        const lower = faction.toLowerCase();
        return map[lower] || faction;
    }

    function renderDeckList(decks) {
        if (!decks || decks.length === 0) {
            deckList.innerHTML = '<div class="loading-placeholder">暂无卡组</div>';
            return;
        }

        deckList.innerHTML = '';
        decks.forEach(function (deck) {
            const item = document.createElement('div');
            item.className = 'deck-item';
            if (selectedDeckId && (deck.id === selectedDeckId || deck.deck_id === selectedDeckId)) {
                item.classList.add('selected');
            }

            const deckId = deck.id || deck.deck_id;
            const deckName = deck.name || deck.deck_name || ('卡组 #' + deckId);
            const faction = deck.faction || deck.faction_id || deck.nationality || '';
            const isFavorite = deck.is_favorite || deck.favorite || false;

            const infoDiv = document.createElement('div');
            infoDiv.className = 'deck-item-info';

            const nameDiv = document.createElement('div');
            nameDiv.className = 'deck-item-name';
            nameDiv.textContent = deckName;

            const metaDiv = document.createElement('div');
            metaDiv.className = 'deck-item-meta';

            const factionSpan = document.createElement('span');
            factionSpan.className = 'deck-item-faction';
            factionSpan.textContent = getFactionName(faction);
            metaDiv.appendChild(factionSpan);

            infoDiv.appendChild(nameDiv);
            infoDiv.appendChild(metaDiv);
            item.appendChild(infoDiv);

            if (isFavorite) {
                const starSpan = document.createElement('span');
                starSpan.className = 'deck-item-favorite';
                starSpan.textContent = '\u2605';
                item.appendChild(starSpan);
            }

            item.addEventListener('click', function () {
                selectDeck(deck);
            });

            deckList.appendChild(item);
        });
    }

    function selectDeck(deck) {
        const deckId = deck.id || deck.deck_id;
        selectedDeckId = deckId;

        const items = $$('.deck-item');
        items.forEach(function (el) {
            el.classList.remove('selected');
        });

        const selectedEl = deckList.querySelector('.deck-item:nth-child(' + (decksData.indexOf(deck) + 1) + ')');
        if (selectedEl) {
            selectedEl.classList.add('selected');
        } else {
            const allItems = $$('.deck-item');
            allItems.forEach(function (item) {
                const nameEl = item.querySelector('.deck-item-name');
                if (nameEl && nameEl.textContent === (deck.name || deck.deck_name)) {
                    item.classList.add('selected');
                }
            });
        }

        detailName.textContent = deck.name || deck.deck_name || ('卡组 #' + deckId);
        detailId.textContent = deckId;
        const faction = deck.faction || deck.faction_id || deck.nationality || '';
        detailFaction.textContent = getFactionName(faction);
        deckCodeInput.value = '';
        deckDetailPanel.classList.remove('hidden');
    }

    async function updateDeck(deckId, deckCode) {
        const body = {
            action: 'fill',
            deck_code: deckCode + '~;;;|ce1j'
        };
        const result = await apiRequest('PUT', '/players/' + currentPlayerId + '/decks/' + deckId, body);
        return result;
    }

    function showLoginSection() {
        loginSection.classList.remove('hidden');
        dashboardSection.classList.add('hidden');
        deckDetailPanel.classList.add('hidden');
        authToken = null;
        currentUserId = null;
        currentPlayerId = null;
        selectedDeckId = null;
        decksData = [];
        usernameInput.value = '';
        passwordInput.value = '';
        hideStatus();
    }

    function showDashboard() {
        loginSection.classList.add('hidden');
        dashboardSection.classList.remove('hidden');
        hideStatus();
    }

    loginForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        const username = usernameInput.value.trim();
        const password = passwordInput.value;

        if (!username || !password) {
            showStatus('请输入用户名和密码', 'error');
            return;
        }

        setLoading(loginBtn, true);
        hideStatus();
        showStatus('正在登录...', 'info');

        try {
            await handleLogin(username, password);
            showStatus('登录成功！正在加载卡组...', 'success');
            showDashboard();
            await loadDecks();
        } catch (err) {
            console.error('Login error:', err);
            showStatus('登录失败：' + err.message, 'error');
        } finally {
            setLoading(loginBtn, false);
        }
    });

    logoutBtn.addEventListener('click', function () {
        showLoginSection();
        showStatus('已退出登录', 'info');
    });

    async function loadDecks() {
        setLoading(refreshDecksBtn, true);
        deckList.innerHTML = '<div class="loading-placeholder">加载卡组中...</div>';

        try {
            const decks = await fetchDecks();
            renderDeckList(decks);
            showStatus('共加载 ' + decks.length + ' 套卡组', 'success');
        } catch (err) {
            console.error('Load decks error:', err);
            deckList.innerHTML = '<div class="loading-placeholder">加载卡组失败</div>';
            showStatus('加载卡组失败：' + err.message, 'error');
        } finally {
            setLoading(refreshDecksBtn, false);
        }
    }

    refreshDecksBtn.addEventListener('click', function () {
        if (currentPlayerId) {
            loadDecks();
        }
    });

    cancelUpdateBtn.addEventListener('click', function () {
        deckDetailPanel.classList.add('hidden');
        selectedDeckId = null;
        deckCodeInput.value = '';
        const items = $$('.deck-item');
        items.forEach(function (el) {
            el.classList.remove('selected');
        });
        showStatus('已取消更新', 'info');
    });

    updateDeckBtn.addEventListener('click', async function () {
        if (!selectedDeckId) {
            showStatus('请先选择要更新的卡组', 'error');
            return;
        }

        const deckCode = deckCodeInput.value.trim();
        if (!deckCode) {
            showStatus('请输入卡组代码', 'error');
            return;
        }

        setLoading(updateDeckBtn, true);
        hideStatus();
        showStatus('正在更新卡组...', 'info');

        try {
            const result = await updateDeck(selectedDeckId, deckCode);
            showStatus('卡组更新成功！', 'success');
            setLoading(updateDeckBtn, false);

            const continueUpdate = confirm('卡组更新成功！\n\n是否继续更新其他卡组？\n\n点击"确定"继续，点击"取消"返回卡组列表。');

            if (continueUpdate) {
                deckCodeInput.value = '';
                hideStatus();
                showStatus('卡组更新成功！请选择下一套卡组继续更新。', 'success');
            } else {
                deckDetailPanel.classList.add('hidden');
                selectedDeckId = null;
                document.querySelectorAll('.deck-item').forEach(function (el) {
                    el.classList.remove('selected');
                });
                await loadDecks();
            }
        } catch (err) {
            console.error('Update deck error:', err);
            showStatus('更新失败：' + err.message, 'error');
            setLoading(updateDeckBtn, false);
        }
    });

    console.log('KARDS 卡组更新工具已加载');
})();