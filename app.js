// app.js : アプリのコアシステム (データ管理・PFC計算・グラフ・体組成)
// ※AI通信やマイク制御は ai.js に分離しています。

let TG = { cal: 2000, p: 150, f: 44, c: 250, label: "👨男性減量", mode: "std", alcMode: false, autoReset: true, cheatReservedDate: null };
let lst = []; let fav = []; let myFoods = []; let hist = []; let bodyData = []; let chatHistory = []; let selIdx = -1; let editIdx = -1;
let deletedToday = { date: "", items: [] };
const toHira = s => s.replace(/[\u30a1-\u30f6]/g, m => String.fromCharCode(m.charCodeAt(0) - 0x60));

function parseNum(val) { if (typeof val !== 'string') return parseFloat(val) || 0; const half = val.replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0)); return parseFloat(half) || 0; }
function getAutoTime() { const h = new Date().getHours(); if (h >= 4 && h < 11) return "朝"; if (h >= 11 && h < 17) return "昼"; return "晩"; }

function getTodayKey() { const d = new Date(); return `${d.getFullYear()}-${("0" + (d.getMonth() + 1)).slice(-2)}-${("0" + d.getDate()).slice(-2)}`; }

function loadDeletedToday() {
    const today = getTodayKey();
    try {
        deletedToday = JSON.parse(localStorage.getItem('tf_deleted_today') || "{}");
    } catch (e) {
        deletedToday = {};
    }
    if (!deletedToday || deletedToday.date !== today || !Array.isArray(deletedToday.items)) {
        deletedToday = { date: today, items: [] };
        saveDeletedToday();
    }
}

function saveDeletedToday() {
    if (!deletedToday || !Array.isArray(deletedToday.items)) deletedToday = { date: getTodayKey(), items: [] };
    deletedToday.date = getTodayKey();
    localStorage.setItem('tf_deleted_today', JSON.stringify(deletedToday));
}

function moveDeletedItemsToTrash(items, source = "manual") {
    loadDeletedToday();
    const now = Date.now();
    const trashIds = [];
    items.forEach(item => {
        const trashId = now + Math.floor(Math.random() * 100000);
        trashIds.push(trashId);
        deletedToday.items.unshift({
            trashId,
            deletedAt: now,
            source,
            item: JSON.parse(JSON.stringify(item))
        });
    });
    saveDeletedToday();
    renderDeletedTodayPanel();
    return trashIds;
}

function showDeleteUndo(count, trashIds) {
    let bar = document.getElementById('delete-undo-bar');
    if (!bar) {
        bar = document.createElement('div');
        bar.id = 'delete-undo-bar';
        document.body.appendChild(bar);
    }
    bar.innerHTML = `<span>${count}件削除しました</span><button onclick="restoreDeletedTrashIds([${trashIds.join(',')}])">元に戻す</button>`;
    bar.classList.add('show');
    clearTimeout(bar._timer);
    bar._timer = setTimeout(() => bar.classList.remove('show'), 6500);
}

function deleteLogIds(ids, source = "manual", showUndo = true) {
    const targetIds = (ids || []).map(Number).filter(Boolean);
    if (targetIds.length === 0) return 0;
    const targets = lst.filter(item => targetIds.includes(Number(item.id)));
    if (targets.length === 0) return 0;
    const trashIds = moveDeletedItemsToTrash(targets, source);
    lst = lst.filter(item => !targetIds.includes(Number(item.id)));
    sv();
    ren();
    upd();
    if (showUndo) showDeleteUndo(targets.length, trashIds);
    return targets.length;
}

function restoreDeletedTrashIds(trashIds) {
    loadDeletedToday();
    const ids = (trashIds || []).map(Number);
    const restoreItems = deletedToday.items.filter(entry => ids.includes(Number(entry.trashId)));
    if (restoreItems.length === 0) return;
    restoreItems.reverse().forEach(entry => {
        const item = { ...entry.item, id: entry.item.id || Date.now() + Math.floor(Math.random() * 1000) };
        if (!lst.some(x => Number(x.id) === Number(item.id))) lst.push(item);
    });
    deletedToday.items = deletedToday.items.filter(entry => !ids.includes(Number(entry.trashId)));
    saveDeletedToday();
    sv();
    ren();
    renderDeletedTodayPanel();
    upd();
    if (typeof showToast === 'function') showToast(`${restoreItems.length}件を元に戻しました`);
}

function restoreDeletedItem(trashId) {
    restoreDeletedTrashIds([trashId]);
}

function renderDeletedTodayPanel() {
    const box = document.getElementById('deleted-today-panel');
    if (!box) return;
    loadDeletedToday();
    const items = deletedToday.items || [];
    if (items.length === 0) {
        box.style.display = 'none';
        box.innerHTML = '';
        return;
    }
    box.style.display = 'block';
    box.innerHTML = `
        <details class="trash-fold">
            <summary>
                <div>
                    <strong>今日削除した記録</strong>
                    <span>${items.length}件を一時保管中</span>
                </div>
                <em>開く</em>
            </summary>
            <div class="trash-list">
                ${items.map(entry => {
                    const x = entry.item;
                    return `<div class="trash-row">
                        <div>
                            <strong>${String(x.N || "").replace(/^🤖\s*/, "")}</strong>
                            <span>${x.time || "-"} / ${Math.round(x.Cal || 0)}kcal / P${Number(x.P || 0).toFixed(1)} F${Number(x.F || 0).toFixed(1)} C${Number(x.C || 0).toFixed(1)}</span>
                        </div>
                        <button onclick="restoreDeletedItem(${entry.trashId})">戻す</button>
                    </div>`;
                }).join('')}
            </div>
        </details>`;
}

function requestDeleteAllTodayConfirm() {
    const box = document.getElementById('delete-all-confirm');
    if (!box) return;
    box.style.display = 'flex';
}

function closeDeleteAllConfirm() {
    const box = document.getElementById('delete-all-confirm');
    if (box) box.style.display = 'none';
}

function confirmDeleteAllToday() {
    const ids = lst.map(item => item.id);
    const count = deleteLogIds(ids, "all-day", true);
    closeDeleteAllConfirm();
    if (typeof showToast === 'function') showToast(count > 0 ? "今日の記録を削除しました" : "削除する記録がありません");
}

window.onload = () => {
    if (localStorage.getItem('tf_tg')) {
        TG = JSON.parse(localStorage.getItem('tf_tg'));
        if (TG.alcMode === undefined) TG.alcMode = false;
        if (TG.autoReset === undefined) TG.autoReset = true;
        if (TG.cheatLastUsedDate === undefined) TG.cheatLastUsedDate = null;
        if (TG.cheatReservedDate === undefined) TG.cheatReservedDate = null;
    }
    if (localStorage.getItem('tf_fav')) fav = JSON.parse(localStorage.getItem('tf_fav'));
    if (localStorage.getItem('tf_my')) myFoods = JSON.parse(localStorage.getItem('tf_my'));
    if (localStorage.getItem('tf_hist')) hist = JSON.parse(localStorage.getItem('tf_hist'));
    if (localStorage.getItem('tf_body')) bodyData = JSON.parse(localStorage.getItem('tf_body'));
    loadDeletedToday();
    if (!TG.mode) TG.mode = "std";

    const savedData = localStorage.getItem('tf_dat');
    if (savedData) {
        let parsed = JSON.parse(savedData);
        lst = parsed.map((x, i) => ({ ...x, id: x.id || Date.now() + i }));
    }

    const todayStr = new Date().toLocaleDateString();
    let lastDateStr = localStorage.getItem('tf_last_date');
    if (!lastDateStr) { localStorage.setItem('tf_last_date', todayStr); lastDateStr = todayStr; }

    if (TG.autoReset && lastDateStr !== todayStr && lst.length > 0) {
        svHist(lastDateStr, JSON.parse(JSON.stringify(lst)));
        lst = [];
        localStorage.setItem('tf_dat', JSON.stringify(lst));
        if (typeof showToast === 'function') showToast(`📅 日付が変わったため、昨日（${lastDateStr}）の記録を自動保存してリセットしたたま！`);
    }

    // 【改善3】日付が変わっていれば、チートデイやハイカーボモードを強制的に解除
    if (lastDateStr !== todayStr) {
        if (typeof finishCheatDay === 'function') {
            finishCheatDay();
        } else {
            localStorage.setItem('tf_cheat_day', 'false');
            localStorage.setItem('tf_cheat_record', 'false');
            localStorage.setItem('tf_cheat_highcarb', 'false');
        }
    }

    localStorage.setItem('tf_last_date', todayStr);

    const d = new Date(); const today = `${d.getFullYear()}-${("0" + (d.getMonth() + 1)).slice(-2)}-${("0" + d.getDate()).slice(-2)}`;
    const setElVal = (id, v) => { const el = document.getElementById(id); if (el) { if (el.type === 'checkbox') el.checked = v; else el.value = v; } };
    setElVal('b-date', today); setElVal('reset-date', today);
    setElVal('auto-reset-chk', TG.autoReset); setElVal('alc-mode-chk', TG.alcMode);
    setElVal('pfc-mode', TG.mode); setElVal('cust-cal', TG.cal);

    toggleAlcMode(true);
    if (typeof setupChatEnterKey === 'function') setupChatEnterKey();
    mkCat(); mkTgt(); upd(); ren(); renderDeletedTodayPanel(); checkCheatTicketStatus();
};

// ▼▼▼ チートデイチケット管理 ▼▼▼
function getCheatLocalDateKey(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function formatCheatStatusDate(dateKey) {
    if (!dateKey) return "";
    const [y, m, d] = dateKey.split("-");
    return `${Number(m)}/${Number(d)}`;
}

function checkCheatTicketStatus() {
    const wrap = document.getElementById('premium-ticket-wrap');
    const badge = document.getElementById('ticket-count-badge');
    const subText = document.getElementById('ticket-cooldown-text');
    let inlineActions = document.getElementById('cheat-inline-actions');
    if (!wrap || !badge || !subText) return;
    if (!inlineActions && badge.parentElement) {
        inlineActions = document.createElement('div');
        inlineActions.id = 'cheat-inline-actions';
        inlineActions.className = 'cheat-inline-actions';
        badge.parentElement.appendChild(inlineActions);
    }

    if (TG.cheatTickets === undefined) {
        TG.cheatTickets = 1;
        if (TG.cheatLastUsedDate) {
            const lastUsed = new Date(TG.cheatLastUsedDate);
            const today = new Date();
            const diffDays = Math.ceil(Math.abs(today - lastUsed) / (1000 * 60 * 60 * 24));
            if (diffDays < 7) TG.cheatTickets = 0;
        }
    }

    if (TG.cheatReservedDate && TG.cheatReservedDate !== getCheatLocalDateKey()) {
        TG.cheatTickets = 0;
    }

    if (!TG.cheatReservedDate && TG.cheatLastUsedDate) {
        const lastUsed = new Date(TG.cheatLastUsedDate);
        const today = new Date();
        const diffDays = Math.ceil(Math.abs(today - lastUsed) / (1000 * 60 * 60 * 24));
        if (diffDays >= 7 && TG.cheatTickets === 0) {
            TG.cheatTickets = 1;
            TG.cheatLastUsedDate = null;
        }
    }

    if (TG.cheatTickets <= 0) {
        wrap.classList.add('disabled');
        wrap.onclick = null;
        badge.textContent = `x 0`;
        if (TG.cheatReservedDate && TG.cheatReservedDate !== getCheatLocalDateKey()) {
            subText.textContent = `${formatCheatStatusDate(TG.cheatReservedDate)}に予約済みです`;
            if (inlineActions) {
                inlineActions.style.display = 'flex';
                inlineActions.innerHTML = `
                    <button type="button" onclick="event.stopPropagation(); changeCheatReservation()">日程変更</button>
                    <button type="button" onclick="event.stopPropagation(); cancelCheatReservation()">取消</button>
                `;
            }
        } else if (TG.cheatLastUsedDate) {
            const today = new Date();
            const diffDays = Math.ceil(Math.abs(today - new Date(TG.cheatLastUsedDate)) / (1000 * 60 * 60 * 24));
            subText.textContent = `あと${Math.max(0, 7 - diffDays)}日で再利用できます`;
            if (inlineActions) inlineActions.style.display = 'none';
        } else {
            subText.textContent = `現在利用できるパスがありません`;
            if (inlineActions) inlineActions.style.display = 'none';
        }
    } else {
        wrap.classList.remove('disabled');
        wrap.onclick = () => { if (typeof openPreCheatModal === 'function') openPreCheatModal(); };
        badge.textContent = `x ${TG.cheatTickets}`;
        subText.textContent = "週に1回、ご褒美の日を設定できます";
        if (inlineActions) inlineActions.style.display = 'none';
    }

    const mgrTick = document.getElementById('mgr-ticket-count');
    if (mgrTick) mgrTick.textContent = TG.cheatTickets;
}

function consumeCheatTicket(usedDate = null) {
    if (TG.cheatTickets === undefined) TG.cheatTickets = 1;
    if (TG.cheatTickets > 0) TG.cheatTickets--;
    TG.cheatLastUsedDate = usedDate ? `${usedDate}T00:00:00` : new Date().toISOString();
    localStorage.setItem('tf_tg', JSON.stringify(TG));
    checkCheatTicketStatus();
}

function restoreCheatTicket() {
    if (TG.cheatTickets === undefined) TG.cheatTickets = 0;
    TG.cheatTickets++;
    TG.cheatLastUsedDate = null;
    TG.cheatReservedDate = null;
    localStorage.setItem('tf_tg', JSON.stringify(TG));
    checkCheatTicketStatus();
}
// ▲▲▲ チートデイチケット管理 ▲▲▲

function toggleAlcMode(isInit = false) {
    if (!isInit) { TG.alcMode = document.getElementById('alc-mode-chk').checked; localStorage.setItem('tf_tg', JSON.stringify(TG)); }
    const mtrA = document.getElementById('mtr-a'); const maWrap = document.getElementById('m-a-wrap');
    if (mtrA) mtrA.style.display = TG.alcMode ? 'block' : 'none';
    if (maWrap) maWrap.style.display = TG.alcMode ? 'block' : 'none';
    upd(); ren();
    if (!isInit) {
        if (typeof rHist === 'function' && document.getElementById('hist-area').style.display === 'block') rHist();
        if (typeof drawGraph === 'function' && document.getElementById('graph-area').style.display === 'block') { const actBtn = document.querySelector('.g-btn.act'); if (actBtn) drawGraph(actBtn.innerText.includes('月') ? 'month' : 'week', actBtn); }
    }
}

function mkCat() {
    const d = document.getElementById('cat-btns'); if (typeof DB === 'undefined' || !d) return;
    const cats = [...new Set(DB.map(i => i[0]))];
    d.innerHTML = `<div class="c-btn fav-cat-btn" onclick="shwList('⭐',this)">⭐ お気に入り</div><div class="c-btn my-cat-btn" onclick="shwList('📂',this)">📂 My食品</div>`;
    cats.forEach(c => { const b = document.createElement('div'); b.className = 'c-btn'; b.textContent = c; b.onclick = () => shwList(c, b); d.appendChild(b); });
}

function shwList(c, btn) {
    const l = document.getElementById('f-list'); document.querySelectorAll('.c-btn').forEach(x => x.classList.remove('act'));
    if (l.style.display === 'block' && l.dataset.cat === c) { l.style.display = 'none'; return; }
    btn.classList.add('act'); l.dataset.cat = c;
    l.innerHTML = `<div class="list-head"><span>${c === '⭐' ? 'お気に入り' : (c === '📂' ? 'My食品' : c)}</span><span class="cls-btn" onclick="clsList()">× 閉じる</span></div>`;
    let itms = [];
    if (c === '📂') { if (myFoods.length === 0) l.innerHTML += `<div style="padding:15px;text-align:center;color:#666;">My食品はまだありません。</div>`; else itms = myFoods.map((x, i) => ({ ...x, name: x.N, isMy: true, i: i })); }
    else { const allItems = DB.map((x, i) => ({ ...x, name: x[1], isMy: false, i: i })); if (c === '⭐') itms = allItems.filter(x => fav.includes(x.i)); else { itms = allItems.filter(x => x[0] === c); itms.sort((a, b) => (fav.includes(b.i) ? 1 : 0) - (fav.includes(a.i) ? 1 : 0)); } }
    itms.forEach(x => {
        const d = document.createElement('div'); d.className = 'f-btn'; d.innerHTML = `<span>${x.name}</span>`; d.onclick = () => x.isMy ? selMyFd(x.i) : selFd(x.i);
        const actBtn = document.createElement('span');
        if (x.isMy) { actBtn.className = 'del-icon'; actBtn.textContent = '削除'; actBtn.onclick = (e) => { e.stopPropagation(); delMyFood(x.i); }; }
        else { actBtn.className = 'fav-icon ' + (fav.includes(x.i) ? 'act' : ''); actBtn.textContent = '★'; actBtn.onclick = (e) => { e.stopPropagation(); togFav(x.i, actBtn); }; }
        d.appendChild(actBtn); l.appendChild(d);
    });
    l.style.display = 'block';
    positionFoodListOverlay();
}

function positionFoodListOverlay() {
    const l = document.getElementById('f-list');
    const cats = document.getElementById('cat-btns');
    const panel = document.getElementById('manual-inp-sec');
    if (!l || !cats || !panel || l.style.display !== 'block') return;
    const catRect = cats.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const side = Math.max(12, panelRect.left);
    l.style.position = 'fixed';
    l.style.left = side + 'px';
    l.style.right = Math.max(12, window.innerWidth - panelRect.right) + 'px';
    l.style.top = Math.min(catRect.bottom + 8, window.innerHeight - 180) + 'px';
    l.style.maxHeight = Math.max(180, window.innerHeight - catRect.bottom - 28) + 'px';
}

window.addEventListener('resize', positionFoodListOverlay);
window.addEventListener('scroll', positionFoodListOverlay, true);

function clsList() {
    const l = document.getElementById('f-list');
    if (l) {
        l.style.display = 'none';
        l.style.position = '';
        l.style.left = '';
        l.style.right = '';
        l.style.top = '';
        l.style.maxHeight = '';
    }
    document.querySelectorAll('.c-btn').forEach(x => x.classList.remove('act'));
}

function selFd(i) {
    selIdx = i; editIdx = -1; document.getElementById('btn-reg').textContent = "リストに追加する"; clsList(); document.getElementById('amt-area').style.display = 'block';
    const d = DB[i]; const r = document.getElementById('rice-btns'); const p = document.getElementById('pst-btns'); r.innerHTML = ''; p.innerHTML = ''; r.style.display = 'none';
    if (d[1].includes("白米") || d[1].includes("玄米") || d[1].includes("オート")) { r.style.display = 'grid';[{ l: "100", v: 100, s: "小盛" }, { l: "150", v: 150, s: "普通" }, { l: "250", v: 250, s: "大盛" }, { l: "200", v: 200, s: "" }, { l: "300", v: 300, s: "" }, { l: "400", v: 400, s: "" }].forEach(o => mkBtn(o.l, o.v, r, o.s)); }
    else if (d[3].includes('g')) { [50, 100, 150, 200, 250].forEach(v => mkBtn(v, v, p)); } else { [0.5, 1, 2, 3].forEach(v => mkBtn(v, v, p)); }
    const bx = document.createElement('div'); bx.className = 'dir-inp'; const unitLabel = d[3].includes('g') ? 'g' : (d[3].includes('杯') ? '杯' : '個/他');
    bx.innerHTML = `<input type="text" inputmode="decimal" placeholder="手入力" oninput="updBd(this.value)"><span class="unit-label">${unitLabel}</span>`; p.appendChild(bx);
    document.getElementById('m-time').value = getAutoTime();

    // 【改善1】自動的によく使う量を初期選択状態にする
    let autoVal = 1;
    if (d[1].includes("白米") || d[1].includes("玄米") || d[1].includes("オート")) { autoVal = 150; } // ご飯類は普通盛り
    else if (d[3].includes('g')) { autoVal = 100; } // グラム単位は100g
    updBd(autoVal); // 初期値をセット

    // 該当するボタンに'sel'クラスを付与
    setTimeout(() => {
        document.querySelectorAll('.a-btn').forEach(btn => {
            if (btn.querySelector('span:not(.sub-label)').textContent.startsWith(String(autoVal))) {
                btn.classList.add('sel');
            }
        });
        document.getElementById('amt-area').scrollIntoView({ behavior: 'smooth' });
    }, 100);
}

function selMyFd(i) {
    selIdx = -1; editIdx = -1; document.getElementById('btn-reg').textContent = "リストに追加する"; clsList(); document.getElementById('amt-area').style.display = 'block';
    const d = myFoods[i]; document.getElementById('rice-btns').style.display = 'none'; const p = document.getElementById('pst-btns'); p.innerHTML = '';
    [0.5, 1, 2, 3].forEach(v => { const b = document.createElement('div'); b.className = 'a-btn'; b.innerHTML = `<span>${v}個</span>`; b.onclick = () => { document.querySelectorAll('.a-btn').forEach(x => x.classList.remove('sel')); b.classList.add('sel'); document.getElementById('m-mul').value = v; calcM(); }; p.appendChild(b); });
    document.getElementById('reg-bd').style.display = 'block'; document.getElementById('m-time').value = getAutoTime(); document.getElementById('m-name').value = d.N; document.getElementById('m-p').value = d.P; document.getElementById('m-f').value = d.F; document.getElementById('m-c').value = d.C; document.getElementById('m-a').value = d.A || 0; document.getElementById('m-mul').value = 1; document.getElementById('m-cal').value = d.Cal;
    document.getElementById('pv-bar').style.display = 'block'; document.getElementById('pv-name').textContent = d.N;
    let aStr = (TG.alcMode && d.A > 0) ? ` A${d.A}` : ""; document.getElementById('pv-stat').textContent = `${d.Cal}kcal (P${d.P} F${d.F} C${d.C}${aStr})`;
    setTimeout(() => document.getElementById('amt-area').scrollIntoView({ behavior: 'smooth' }), 100);
}

function regMyFood() {
    const n = document.getElementById('m-name').value; if (!n) return alert("食品名を入力してください"); const m = parseNum(document.getElementById('m-mul').value) || 1;
    myFoods.push({ N: n, P: parseFloat(((parseNum(document.getElementById('m-p').value) || 0) / m).toFixed(1)), F: parseFloat(((parseNum(document.getElementById('m-f').value) || 0) / m).toFixed(1)), C: parseFloat(((parseNum(document.getElementById('m-c').value) || 0) / m).toFixed(1)), A: parseFloat(((parseNum(document.getElementById('m-a').value) || 0) / m).toFixed(1)), Cal: Math.round((parseNum(document.getElementById('m-cal').value) || 0) / m) });
    localStorage.setItem('tf_my', JSON.stringify(myFoods)); alert(`「${n}」をMy食品に登録しました！`);
}

function delMyFood(i) { if (!confirm(`「${myFoods[i].N}」を削除しますか？`)) return; myFoods.splice(i, 1); localStorage.setItem('tf_my', JSON.stringify(myFoods)); shwList('📂', document.querySelector('.my-cat-btn')); }

function mkBtn(lbl, v, par, subLbl = "") {
    const b = document.createElement('div'); b.className = 'a-btn'; const unit = DB[selIdx][3].includes('g') ? 'g' : '';
    b.innerHTML = (subLbl ? `<span class="sub-label">${subLbl}</span>` : '') + `<span>${lbl}${unit}</span>`;
    b.onclick = () => { document.querySelectorAll('.a-btn').forEach(x => x.classList.remove('sel')); b.classList.add('sel'); updBd(v); }; par.appendChild(b);
}

function updBd(v) {
    if (selIdx < 0) return; const d = DB[selIdx]; v = parseNum(v); let m = 1; if (d[3].includes('g')) { m = v / parseFloat(d[3]); } else { m = v; }
    document.getElementById('m-mul').value = parseFloat(m.toFixed(2));
    const P = d[4] * m, F = d[5] * m, C = d[6] * m;
    let unitPfcCal = (d[4] * 4) + (d[5] * 9) + (d[6] * 4);
    let unitA = Number.isFinite(Number(d[8]))
        ? Number(d[8])
        : ((d[0].includes("酒") || d[7] > unitPfcCal + 10) ? Math.max(0, (d[7] - unitPfcCal) / 7) : 0);
    let A = unitA * m; const Cal = Math.round((P * 4) + (F * 9) + (C * 4) + (A * 7));
    document.getElementById('pv-bar').style.display = 'block'; const dispUnit = d[3].includes('g') ? 'g' : (d[3].includes('杯') ? '杯' : '個');
    document.getElementById('pv-name').textContent = `${d[1]} (${v}${dispUnit})`;
    let aStr = (TG.alcMode && A > 0) ? ` A${A.toFixed(1)}` : "";
    document.getElementById('pv-stat').textContent = `${Cal}kcal (P${P.toFixed(1)} F${F.toFixed(1)} C${C.toFixed(1)}${aStr})`;
    document.getElementById('m-name').value = d[1]; document.getElementById('m-p').value = d[4]; document.getElementById('m-f').value = d[5]; document.getElementById('m-c').value = d[6];
    document.getElementById('m-a').value = parseFloat(unitA.toFixed(1)); document.getElementById('m-cal').value = Cal;
}

function togBd() { const b = document.getElementById('reg-bd'); b.style.display = b.style.display === 'block' ? 'none' : 'block'; }
function clsBd() { const bd = document.getElementById('reg-bd'); bd.style.display = 'none'; bd.classList.remove('editing'); editIdx = -1; document.getElementById('btn-reg').textContent = "リストに追加する"; }
function openMan() { selIdx = -1; editIdx = -1; document.getElementById('btn-reg').textContent = "リストに追加する"; document.getElementById('amt-area').style.display = 'block'; document.getElementById('reg-bd').style.display = 'block'; document.getElementById('m-time').value = getAutoTime(); setTimeout(() => document.getElementById('reg-bd').scrollIntoView({ behavior: 'smooth' }), 100); }

function calcM() {
    const p = parseNum(document.getElementById('m-p').value); const f = parseNum(document.getElementById('m-f').value); const c = parseNum(document.getElementById('m-c').value); const a = parseNum(document.getElementById('m-a').value); const m = parseNum(document.getElementById('m-mul').value) || 1;
    document.getElementById('m-cal').value = Math.round((p * 4 + f * 9 + c * 4 + a * 7) * m);
    if (selIdx < 0) document.getElementById('pv-name').textContent = document.getElementById('m-name').value;
}

function addM() {
    const n = document.getElementById('m-name').value || "未入力"; const time = document.getElementById('m-time').value || "朝"; const m = parseNum(document.getElementById('m-mul').value) || 1;
    if (typeof isCheatDay !== 'undefined' && isCheatDay && typeof recordOnCheatDay !== 'undefined' && !recordOnCheatDay) {
        if (typeof showToast === 'function') showToast("🎉 チートデイなのでゲージへの記録をスキップしたたま！");
        document.getElementById('m-name').value = ''; document.getElementById('m-cal').value = '';
        document.getElementById('amt-area').style.display = 'none'; clsBd();
        window.scrollTo(0, 0);
        return;
    }
    const p = parseNum(document.getElementById('m-p').value) * m; const f = parseNum(document.getElementById('m-f').value) * m; const c = parseNum(document.getElementById('m-c').value) * m; const a = parseNum(document.getElementById('m-a').value) * m;
    const cal = parseNum(document.getElementById('m-cal').value) || (p * 4 + f * 9 + c * 4 + a * 7);
    const unit = (editIdx >= 0) ? lst[editIdx].U : (selIdx >= 0 ? DB[selIdx][3] : "-");
    const newData = { id: Date.now(), N: n, P: p, F: f, C: c, A: a, Cal: Math.round(cal), U: unit, time: time };
    if (editIdx >= 0) { newData.id = lst[editIdx].id; lst[editIdx] = newData; editIdx = -1; document.getElementById('btn-reg').textContent = "リストに追加する"; document.getElementById('reg-bd').classList.remove('editing'); } else { lst.push(newData); }
    sv(); ren(); upd(); document.getElementById('amt-area').style.display = 'none'; clsBd(); document.getElementById('m-name').value = ''; document.getElementById('m-cal').value = ''; window.scrollTo(0, 0);
}

function ren() {
    const tlArea = document.getElementById('timeline-area'); if (!tlArea) return;
    const openMealKeys = new Set([...tlArea.querySelectorAll('details.meal-card[open]')].map(x => x.dataset.mealKey || ""));
    tlArea.innerHTML = ""; let totalCal = 0;
    const times = ["朝", "昼", "晩", "間食"]; const emojis = { "朝": "☀️", "昼": "☁️", "晩": "🌙", "間食": "☕" };
    const cleanFoodName = name => String(name || "").replace(/^🤖\s*/, "");
    const cleanUnit = unit => String(unit || "") === "AI" ? "" : String(unit || "");
    lst.forEach(x => { if (!times.includes(x.time)) x.time = "朝"; });
    const hasLunch = lst.some(x => x.time === "昼");
    const hasSnack = lst.some(x => x.time === "間食");
    const renderTimes = hasLunch ? ["朝", "昼", "晩"] : times;
    renderTimes.forEach(t => {
        const items = lst.map((x, i) => ({ ...x, i })).filter(x => t === "昼" && hasLunch ? (x.time === "昼" || x.time === "間食") : x.time === t); if (items.length === 0) return;
        let tCal = 0, tP = 0, tF = 0, tC = 0, tA = 0; items.forEach(x => { tCal += x.Cal; tP += x.P; tF += x.F; tC += x.C; tA += (x.A || 0); totalCal += x.Cal; });
        const sec = document.createElement('details'); sec.className = 'tl-sec meal-card'; sec.dataset.mealKey = t; if (openMealKeys.has(t)) sec.open = true; let aStr = (TG.alcMode && tA > 0) ? ` <span class="macro-a">A${tA.toFixed(0)}</span>` : "";
        const mealLabel = t === "昼" && hasLunch && hasSnack ? "昼食・間食" : (t === "間食" ? "間食" : `${t}食`);
        sec.innerHTML = `<summary class="meal-summary ${t}"><div class="meal-left"><div><div class="meal-title"><span>${mealLabel}</span></div></div></div><div class="meal-macro-line"><span>P ${tP.toFixed(0)}g</span><span>F ${tF.toFixed(0)}g</span><span>C ${tC.toFixed(0)}g</span>${aStr}</div><div class="tl-stats"><strong>${tCal.toLocaleString()}</strong><em>kcal</em></div><span class="meal-chevron">›</span></summary><ul class="f-list meal-detail-list">${items.map(x => {
            let aTag = (TG.alcMode && x.A > 0) ? ` <span style="color:var(--my)">A${x.A.toFixed(1)}</span>` : ""; let isAlcClass = (TG.alcMode && x.A > 0) ? "alc" : "";
            const unitText = cleanUnit(x.U);
            return `<li class="f-item ${isAlcClass}"><div class="food-info"><strong>${cleanFoodName(x.N)}</strong>${unitText ? `<small>${unitText}</small>` : ""}</div><div class="food-macros"><span>P ${x.P.toFixed(1)}g</span><span>F ${x.F.toFixed(1)}g</span><span>C ${x.C.toFixed(1)}g</span>${aTag}</div><div class="food-cal"><strong>${x.Cal}</strong><span>kcal</span></div><div class="act-btns"><button class="l-btn b-re" onclick="reAdd(${x.i})">複製</button><button class="l-btn b-ed" onclick="ed(${x.i})">編集</button><button class="l-btn b-del" onclick="del(${x.i})">消去</button></div></li>`;
        }).join('')}</ul>`; tlArea.appendChild(sec);
    });
    if (lst.length === 0) tlArea.innerHTML = "<div class='record-empty'>まだ記録がありません<br><span>音声・手入力・献立ガチャから食事を追加できます</span></div>";
    if (document.getElementById('tot-cal')) document.getElementById('tot-cal').textContent = totalCal.toLocaleString();
}

function del(i) { if (!lst[i]) return; deleteLogIds([lst[i].id], "manual", true); }
function reAdd(i) { lst.push({ ...lst[i], id: Date.now() + Math.floor(Math.random() * 1000) }); sv(); ren(); upd(); }
function ed(i) {
    const x = lst[i]; editIdx = i; selIdx = -1; document.getElementById('amt-area').style.display = 'block'; const bd = document.getElementById('reg-bd'); bd.style.display = 'block'; bd.classList.add('editing');
    document.getElementById('btn-reg').textContent = "更新して完了"; document.getElementById('m-time').value = x.time || getAutoTime(); document.getElementById('m-name').value = x.N; document.getElementById('m-p').value = x.P; document.getElementById('m-f').value = x.F; document.getElementById('m-c').value = x.C; document.getElementById('m-a').value = x.A || 0; document.getElementById('m-mul').value = 1; document.getElementById('m-cal').value = x.Cal;
    setTimeout(() => bd.scrollIntoView({ behavior: 'smooth' }), 100);
}

function sv() { localStorage.setItem('tf_dat', JSON.stringify(lst)); }

function toggleAutoReset() { TG.autoReset = document.getElementById('auto-reset-chk').checked; localStorage.setItem('tf_tg', JSON.stringify(TG)); }
function confirmReset() {
    const d = document.getElementById('reset-date').value;
    if (!d) return alert("日付を選択してください");
    const dateStr = new Date(d).toLocaleDateString();
    svHist(dateStr, JSON.parse(JSON.stringify(lst)));
    lst = []; sv(); ren(); upd();
    if (typeof closeResetModal === 'function') closeResetModal();
    if (typeof showToast === 'function') showToast(`${dateStr} の記録として保存し、\n画面をリセットしたたま！`); else alert(`${dateStr} の記録として保存し、リセットしました。`);
}

// ★バグ2修正：履歴（hist）に保存する時に、お酒（A）の合算も記録するようにしたたま！
function svHist(d, l) {
    const i = hist.findIndex(h => h.d === d);
    if (i >= 0) hist.splice(i, 1);
    const t = { Cal: 0, P: 0, F: 0, C: 0, A: 0 };
    l.forEach(x => { t.Cal += x.Cal; t.P += x.P; t.F += x.F; t.C += x.C; t.A += (x.A || 0); });
    hist.unshift({ d: d, s: t, l: l });
    if (hist.length > 30) hist.pop();
    localStorage.setItem('tf_hist', JSON.stringify(hist));
}

function togHist() { const a = document.getElementById('hist-area'); if (a.style.display === 'block') a.style.display = 'none'; else { a.style.display = 'block'; rHist(); } }

function rHist() {
    const d = document.getElementById('h-list'); if (!d) return; d.innerHTML = ""; if (!hist.length) d.innerHTML = "<p style='text-align:center'>履歴なし</p>";
    hist.forEach((h, i) => {
        const foodsHtml = h.l.map(f => `<div class="hf-row"><span class="hf-name">${f.time ? `[${f.time}] ` : ''}${f.N}</span><span class="hf-vals">${f.Cal}kcal</span></div>`).join('');
        const c = document.createElement('div'); c.className = 'h-card-wrap';
        let hAStr = (TG.alcMode && h.s.A > 0) ? ` A${h.s.A.toFixed(0)}` : "";
        c.innerHTML = `<div class="h-card"><div class="h-summary" onclick="document.getElementById('h-det-${i}').style.display = document.getElementById('h-det-${i}').style.display === 'block' ? 'none' : 'block'"><div class="h-info"><div><span class="h-date">${h.d}</span> <span class="h-meta">${h.s.Cal}kcal</span></div><div class="h-meta" style="font-size:10px;">(P${h.s.P.toFixed(0)} F${h.s.F.toFixed(0)} C${h.s.C.toFixed(0)}${hAStr})</div><div class="h-toggle-hint">▼ 詳細</div></div><div class="h-btns"><button class="h-btn h-b-res" onclick="event.stopPropagation(); resHist(${i})">復元</button><button class="h-btn h-b-cp" onclick="event.stopPropagation(); cpHist(${i})">コピー</button><button class="h-btn h-b-del" onclick="event.stopPropagation(); delHist(${i})">削除</button></div></div><div id="h-det-${i}" class="h-detail">${foodsHtml}</div></div>`; d.appendChild(c);
    });
}

function resHist(i) { if (!confirm("追加しますか？")) return; const addItems = hist[i].l.map((x, idx) => ({ ...x, id: Date.now() + idx })); lst = lst.concat(addItems); sv(); ren(); upd(); if (typeof showToast === 'function') showToast("履歴から復元したたま！"); else alert("復元しました"); }
function cpHist(i) { const h = hist[i]; let t = `【${h.d}】\n`; h.l.forEach(x => t += `${x.time ? `[${x.time}] ` : ''}${x.N} ${x.Cal}kcal\n`); navigator.clipboard.writeText(t).then(() => { if (typeof showToast === 'function') showToast("コピー完了したたま！"); else alert("コピーしました"); }); }
function delHist(i) { if (!confirm("削除しますか？")) return; hist.splice(i, 1); localStorage.setItem('tf_hist', JSON.stringify(hist)); rHist(); }
function togFav(i, el) { const x = fav.indexOf(i); if (x >= 0) fav.splice(x, 1); else fav.push(i); localStorage.setItem('tf_fav', JSON.stringify(fav)); el.classList.toggle('act'); }

function filterF() {
    const rawV = document.getElementById('s-inp').value.trim(); const r = document.getElementById('s-res'); r.innerHTML = ""; if (!rawV) { r.style.display = 'none'; return; }
    const query = toHira(rawV).toLowerCase(); const isPartialAllowed = query.length >= 2; let results = [];
    DB.forEach((x, i) => {
        const name = toHira(x[1]).toLowerCase(); const keys = x[2] ? toHira(x[2]).toLowerCase() : ""; let score = 0;
        if (name === query || keys.split(' ').includes(query)) score = 1000; else if (name.startsWith(query) || keys.split(' ').some(k => k.startsWith(query))) score = 500; else if (isPartialAllowed && (name.includes(query) || keys.includes(query))) score = 100;
        if (score > 0) results.push({ item: x, index: i, score: score });
    });
    if (results.length === 0) { r.style.display = 'none'; return; }
    results.sort((a, b) => b.score - a.score); r.style.display = 'block';
    results.forEach(res => { const d = document.createElement('div'); d.className = 's-item'; d.innerHTML = `<strong>${res.item[1]}</strong>`; d.onclick = () => { selFd(res.index); r.style.display = 'none'; }; r.appendChild(d); });
}

function mkTgt() {
    const b = document.getElementById('tgt-btns'); if (!b) return; b.innerHTML = "";
    [{ v: 1200, l: "女性小食" }, { v: 1600, l: "👩女性減量" }, { v: 2000, l: "👨男性減量" }, { v: 2400, l: "活動・増量" }].forEach(t => {
        const d = document.createElement('div'); d.className = 'tg-btn ' + (TG.cal === t.v ? 'act' : ''); d.innerHTML = `<span style="font-size:9px;color:#666">${t.l}</span><strong>${t.v}</strong>`;
        d.onclick = () => { TG = { cal: t.v, ...calcPFC(t.v, TG.mode), label: t.l, mode: TG.mode, alcMode: TG.alcMode, autoReset: TG.autoReset, cheatTickets: TG.cheatTickets, cheatLastUsedDate: TG.cheatLastUsedDate, cheatReservedDate: TG.cheatReservedDate }; localStorage.setItem('tf_tg', JSON.stringify(TG)); if (document.getElementById('cust-cal')) document.getElementById('cust-cal').value = t.v; if (document.getElementById('pfc-mode')) document.getElementById('pfc-mode').value = TG.mode; upd(); mkTgt(); }; b.appendChild(d);
    });
}
function toggleTgt() { const b = document.getElementById('tgt-btns'); const c = document.getElementById('cust-tgt'); const d = (b.style.display === 'grid'); b.style.display = d ? 'none' : 'grid'; c.style.display = d ? 'none' : 'flex'; }
function calcPFC(c, m) {
    let p = 0, f = 0;
    if (m === "lowfat") { p = c * 0.3 / 4; f = c * 0.1 / 9; } else if (m === "muscle") { p = c * 0.4 / 4; f = c * 0.2 / 9; } else if (m === "keto") { p = c * 0.3 / 4; f = c * 0.6 / 9; } else { p = c * 0.3 / 4; f = c * 0.2 / 9; }
    return { p: p, f: f, c: (c - (p * 4 + f * 9)) / 4 };
}
function upd() {
    const t = { Cal: 0, P: 0, F: 0, C: 0, A: 0 }; lst.forEach(x => { t.Cal += x.Cal; t.P += x.P; t.F += x.F; t.C += x.C; t.A += (x.A || 0); });
    if (document.getElementById('cur-cal')) document.getElementById('cur-cal').textContent = Math.round(t.Cal).toLocaleString();
    if (document.getElementById('cur-p')) document.getElementById('cur-p').textContent = t.P.toFixed(0);
    if (document.getElementById('cur-f')) document.getElementById('cur-f').textContent = t.F.toFixed(0);
    if (document.getElementById('cur-c')) document.getElementById('cur-c').textContent = t.C.toFixed(0);
    const setMacroCal = (id, kcal) => {
        const el = document.getElementById(id);
        if (el) el.textContent = `${Math.round(kcal).toLocaleString()} kcal`;
    };
    setMacroCal('macro-cal-p', t.P * 4);
    setMacroCal('macro-cal-f', t.F * 9);
    setMacroCal('macro-cal-c', t.C * 4);
    setMacroCal('macro-cal-a', t.A * 7);

    const setBar = (k, v, tg, u) => {
        const r = tg - v; const el = document.getElementById('bar-' + k.toLowerCase()); const tx = document.getElementById('rem-' + k.toLowerCase()); const tbox = document.getElementById('bar-text-' + k.toLowerCase());
        const rawPct = tg > 0 ? (v / tg) * 100 : 0;
        const pct = Math.min(rawPct, 100);
        if (el) { el.style.width = pct + '%'; el.className = 'bar ' + (r < 0 ? 'ov' : ''); }
        if (tx) {
            tx.className = (k === 'Cal' ? 'rem cal-rem ' : 'macro-goal ') + (r < 0 ? 'ov' : '');
            const remText = r < 0 ? `+${Math.abs(r).toFixed(0)}${u}` : `${r.toFixed(0)}${u}`;
            if (k === 'Cal') {
                const formatted = remText.replace(/\d+/, (n) => Number(n).toLocaleString());
                tx.classList.toggle('wide', formatted.replace(/[^\d]/g, '').length >= 4);
                tx.innerHTML = formatted.replace('kcal', '<small>kcal</small>');
            } else {
                tx.textContent = `目標 ${Math.round(tg)}${u}`;
            }
        }
        if (tbox) tbox.textContent = k === 'Cal' ? `${Math.round(rawPct)}%` : '';
        if (k === 'Cal') {
            const targetEl = document.getElementById('target-cal');
            const noteEl = document.getElementById('cal-rem-note');
            if (targetEl) targetEl.textContent = `目標 ${Math.round(tg).toLocaleString()} kcal`;
            if (noteEl) {
                if (r < 0) noteEl.textContent = "今日は目標を超えています";
                else if (rawPct >= 80) noteEl.textContent = "あと少しで目標達成！";
                else if (rawPct > 0) noteEl.textContent = "いいペースです";
                else noteEl.textContent = "まずは1食目を記録しよう";
            }
        }
    };

    // ハイカーボモード反映
    const currentIsHighCarb = (typeof isHighCarbMode !== 'undefined') ? isHighCarbMode : false;
    let dispCal = TG.cal;
    let dispP = TG.p;
    let dispF = TG.f;
    let dispC = TG.c;
    const highCarbMultiplier = 1.5;

    if (currentIsHighCarb) {
        dispCal = TG.cal * highCarbMultiplier;
        // P、Fは維持し、余ったカロリーをすべてCに
        dispP = TG.p;
        dispF = TG.f;
        dispC = (dispCal - (dispP * 4 + dispF * 9)) / 4;
    }

    setBar('Cal', t.Cal, dispCal, 'kcal'); setBar('P', t.P, dispP, 'g'); setBar('F', t.F, dispF, 'g'); setBar('C', t.C, dispC, 'g');

    if (TG.alcMode) {
        const alcoholTarget = 40;
        const elA = document.getElementById('bar-a');
        const tboxA = document.getElementById('bar-text-a');
        const remA = document.getElementById('rem-a');
        const goalA = document.getElementById('alc-goal');
        if (elA) {
            elA.style.width = Math.min((t.A / alcoholTarget) * 100, 100) + '%';
            elA.className = 'bar ' + (t.A > alcoholTarget ? 'ov' : '');
        }
        if (tboxA) tboxA.textContent = `${Math.round(Math.min((t.A / alcoholTarget) * 100, 100))}%`;
        if (remA) remA.textContent = `${t.A.toFixed(1)}g`;
        if (goalA) goalA.textContent = `目安 ${alcoholTarget}g`;
    }
    const modeNames = { std: "標準(3:2:5)", lowfat: "ローファット(3:1:6)", muscle: "筋肥大(4:2:4)", keto: "ケト(3:6:1)" }; const modeName = modeNames[TG.mode] || "カスタム";

    if (document.getElementById('tgt-disp')) {
        if (currentIsHighCarb) {
            document.getElementById('tgt-disp').textContent = `${Math.round(dispCal).toLocaleString()} kcal・ハイカーボ`;
        } else {
            document.getElementById('tgt-disp').textContent = `${Math.round(dispCal).toLocaleString()} kcal・${modeName.split('(')[0]}`;
        }
    }
    if (document.getElementById('dash-target-cal')) {
        document.getElementById('dash-target-cal').textContent = Math.round(dispCal).toLocaleString();
    }
    if (document.getElementById('pfc-ratio-disp')) {
        document.getElementById('pfc-ratio-disp').textContent = currentIsHighCarb ? `(ハイカーボ燃焼モード)` : modeName;
    }
}
function applyCust() {
    let inputCal = parseNum(document.getElementById('cust-cal').value); const c = inputCal > 0 ? inputCal : TG.cal; const selectedMode = document.getElementById('pfc-mode').value;
    TG = { cal: c, ...calcPFC(c, selectedMode), label: "カスタム", mode: selectedMode, alcMode: document.getElementById('alc-mode-chk').checked, autoReset: TG.autoReset, cheatTickets: TG.cheatTickets, cheatLastUsedDate: TG.cheatLastUsedDate, cheatReservedDate: TG.cheatReservedDate };
    localStorage.setItem('tf_tg', JSON.stringify(TG)); upd(); toggleTgt(); mkTgt();
}

function cpRes() { let t = `【${new Date().toLocaleDateString()}】\n`; lst.forEach(x => t += `${x.time ? `[${x.time}] ` : ''}${x.N} ${x.Cal}kcal\n`); navigator.clipboard.writeText(t).then(() => { if (typeof showToast === 'function') showToast("📝 コピー完了！"); }); }

// ★バグ2修正：旧データ復元（importData）の時にもA（アルコール）の履歴を確実に引き継ぐようにしたたま！
function importData(input) {
    const file = input.files[0]; if (!file) return; const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const data = JSON.parse(e.target.result); const safeNum = (v) => isNaN(parseFloat(v)) ? 0 : parseFloat(v);
            if (data.dat) { let rawLst = JSON.parse(data.dat); let fixedLst = rawLst.map(x => ({ id: x.id || Date.now() + Math.floor(Math.random() * 1000), N: x.N || x.n || "不明な食品", P: safeNum(x.P !== undefined ? x.P : x.p), F: safeNum(x.F !== undefined ? x.F : x.f), C: safeNum(x.C !== undefined ? x.C : x.c), A: safeNum(x.A !== undefined ? x.A : x.a), Cal: Math.round(safeNum(x.Cal !== undefined ? x.Cal : x.cal)), U: x.U || x.u || "-", time: x.time || "朝" })); localStorage.setItem('tf_dat', JSON.stringify(fixedLst)); localStorage.removeItem('tf_deleted_today'); localStorage.removeItem('tf_last_ai_added_ids'); }
            if (data.hist) { let rawHist = JSON.parse(data.hist); let fixedHist = rawHist.map(h => ({ d: h.d || "不明な日", s: { P: safeNum(h.s?.P !== undefined ? h.s.P : h.s?.p), F: safeNum(h.s?.F !== undefined ? h.s.F : h.s?.f), C: safeNum(h.s?.C !== undefined ? h.s.C : h.s?.c), A: safeNum(h.s?.A !== undefined ? h.s.A : h.s?.a), Cal: Math.round(safeNum(h.s?.Cal !== undefined ? h.s.Cal : h.s?.cal)) }, l: (h.l || []).map(x => ({ id: x.id || Date.now() + Math.floor(Math.random() * 1000), N: x.N || x.n || "不明", P: safeNum(x.P !== undefined ? x.P : x.p), F: safeNum(x.F !== undefined ? x.F : x.f), C: safeNum(x.C !== undefined ? x.C : x.c), A: safeNum(x.A !== undefined ? x.A : x.a), Cal: Math.round(safeNum(x.Cal !== undefined ? x.Cal : x.cal)), U: x.U || x.u || "-", time: x.time || "朝" })) })); localStorage.setItem('tf_hist', JSON.stringify(fixedHist)); }
            if (data.my) { let rawMy = JSON.parse(data.my); let fixedMy = rawMy.map(x => ({ N: x.N || x.n || "不明", P: safeNum(x.P !== undefined ? x.P : x.p), F: safeNum(x.F !== undefined ? x.F : x.f), C: safeNum(x.C !== undefined ? x.C : x.c), A: safeNum(x.A !== undefined ? x.A : x.a), Cal: Math.round(safeNum(x.Cal !== undefined ? x.Cal : x.cal)) })); localStorage.setItem('tf_my', JSON.stringify(fixedMy)); }
            if (data.tg) { let tgData = JSON.parse(data.tg); if (tgData.alcMode === undefined) tgData.alcMode = false; if (tgData.autoReset === undefined) tgData.autoReset = true; localStorage.setItem('tf_tg', JSON.stringify(tgData)); }
            if (data.fav) localStorage.setItem('tf_fav', data.fav); if (data.date) localStorage.setItem('tf_date', data.date); if (data.body) localStorage.setItem('tf_body', data.body);
            alert("✅ データの修復とお引越しが完了しました！リロードします。"); location.reload();
        } catch (err) { alert("ファイルが正しくありません。エラー: " + err.message); }
    }; reader.readAsText(file);
}

function exportData() {
    const data = { dat: localStorage.getItem('tf_dat'), tg: localStorage.getItem('tf_tg'), fav: localStorage.getItem('tf_fav'), my: localStorage.getItem('tf_my'), hist: localStorage.getItem('tf_hist'), date: localStorage.getItem('tf_date'), body: localStorage.getItem('tf_body') };
    const blob = new Blob([JSON.stringify(data)], { type: "text/json" }); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `pfc_backup_${new Date().toISOString().slice(0, 10)}.json`; link.click();
    if (typeof showToast === 'function') {
        showToast("💾 ダウンロードにバックアップしました！");
    } else {
        alert("ダウンロードにバックアップしました！");
    }
}

// ★バグ2修正：グラフ描画でお酒（A）のカロリーも高さに加算し、紫色のバーで表示するようにしたたま！
function drawGraph(type, btn) {
    document.querySelectorAll('.g-btn').forEach(b => b.classList.remove('act')); if (btn) btn.classList.add('act'); const box = document.getElementById('chart-box'); if (!box) return; box.innerHTML = ''; let data = []; const today = new Date();
    if (type === 'week') {
        for (let i = 6; i >= 0; i--) {
            const d = new Date(today); d.setDate(today.getDate() - i); const ds = d.toLocaleDateString(); const log = hist.find(h => h.d === ds);
            let s = log ? log.s : { Cal: 0, P: 0, F: 0, C: 0, A: 0 };
            if (i === 0 && lst.length > 0) {
                const t = { Cal: 0, P: 0, F: 0, C: 0, A: 0 };
                lst.forEach(x => { t.Cal += x.Cal; t.P += x.P; t.F += x.F; t.C += x.C; t.A += (x.A || 0); }); s = t;
            }
            data.push({ label: `${d.getMonth() + 1}/${d.getDate()}`, s: s, d: ds });
        }
    } else {
        const monthGroups = {};
        hist.forEach(h => {
            let dObj = new Date(h.d.replace(/\//g, '-'));
            if (isNaN(dObj.getTime())) {
                const parts = h.d.split('/');
                if (parts.length === 3) dObj = new Date(parts[0], parts[1] - 1, parts[2]);
                else return;
            }
            const mKey = `${dObj.getFullYear()}/${dObj.getMonth() + 1}`;
            if (!monthGroups[mKey]) monthGroups[mKey] = { count: 0, sum: { Cal: 0, P: 0, F: 0, C: 0, A: 0 }, dObj: dObj };
            monthGroups[mKey].count++;
            monthGroups[mKey].sum.Cal += h.s.Cal || 0;
            monthGroups[mKey].sum.P += h.s.P || 0;
            monthGroups[mKey].sum.F += h.s.F || 0;
            monthGroups[mKey].sum.C += h.s.C || 0;
            monthGroups[mKey].sum.A += h.s.A || 0;
        });

        const sortedMonths = Object.keys(monthGroups).sort((a, b) => {
            const [yA, mA] = a.split('/').map(Number);
            const [yB, mB] = b.split('/').map(Number);
            return yA !== yB ? yA - yB : mA - mB;
        });

        data = sortedMonths.slice(-12).map(mKey => {
            const g = monthGroups[mKey];
            const avg = {
                Cal: Math.round(g.sum.Cal / g.count),
                P: g.sum.P / g.count,
                F: g.sum.F / g.count,
                C: g.sum.C / g.count,
                A: g.sum.A / g.count
            };
            return { label: `${g.dObj.getMonth() + 1}月`, s: avg, d: mKey };
        });
    }

    if (data.length === 0) {
        box.innerHTML = `
        <div class="empty-state">
            <div class="icon">🔍</div>
            <p>まだデータがないたま！</p>
        </div>`;
        document.getElementById('stat-txt').innerHTML = '';
        return;
    }

    const total = data.reduce((acc, cur) => acc + cur.s.Cal, 0); const avg = data.length > 0 ? Math.round(total / data.length) : 0;

    // アニメーション付きで平均値をカウントアップさせる
    const statTxtEl = document.getElementById('stat-txt');
    statTxtEl.innerHTML = `期間平均: <span id="avg-cal-counter">0</span>kcal <span style="font-size:10px;color:#999">(合計: ${total}kcal)</span><br><span style="font-size:10px;">グラフの棒をタップで詳細</span>`;

    // カウントアップアニメーション関数
    let currentAvg = 0;
    const increment = Math.ceil(avg / 30); // 30フレームで到達
    const counterInterval = setInterval(() => {
        currentAvg += increment;
        if (currentAvg >= avg) {
            currentAvg = avg;
            clearInterval(counterInterval);
        }
        const counterEl = document.getElementById('avg-cal-counter');
        if (counterEl) counterEl.textContent = currentAvg;
    }, 20);

    const maxVal = Math.max(...data.map(d => d.s.Cal), TG.cal) || 2000;
    const line = document.createElement('div'); line.className = 'target-line'; line.style.bottom = (TG.cal / maxVal) * 100 + '%'; line.innerHTML = `<span class="target-val">${TG.cal}</span>`; box.appendChild(line);

    data.forEach((d, idx) => {
        const h = Math.min((d.s.Cal / maxVal) * 100, 100);
        const grp = document.createElement('div'); grp.className = 'bar-grp';
        const col = document.createElement('div'); col.className = 'bar-col';
        col.style.height = h + '%';

        // 【改善4】脂質が日標を超えている日は枠を赤くして警告（アラート）
        if (d.s.F > TG.f) {
            col.style.border = '2px solid #e74c3c';
            col.style.boxShadow = '0 0 8px rgba(231,76,60,0.5)';
        }
        // 順番に生えるようなディレイを設定
        col.style.animationDelay = `${idx * 0.05}s`;

        // P,F,Cに加えて、A（1g=7kcal）も全体カロリーの比率として計算するたま！
        const aCal = (d.s.A || 0) * 7;
        const totalCal = (d.s.P * 4 + d.s.F * 9 + d.s.C * 4 + aCal) || 1;

        let segHtml = `<div class="seg-p" style="height:${(d.s.P * 4 / totalCal) * 100}%;"></div><div class="seg-f" style="height:${(d.s.F * 9 / totalCal) * 100}%;"></div><div class="seg-c" style="height:${(d.s.C * 4 / totalCal) * 100}%;"></div>`;
        if (d.s.A > 0) {
            let alcColor = TG.alcMode ? "var(--my)" : "#bdc3c7";
            segHtml += `<div class="seg-a" style="height:${(aCal / totalCal) * 100}%; background:${alcColor};"></div>`;
        }
        col.innerHTML = segHtml;

        let aStr = (TG.alcMode && d.s.A > 0) ? `<span class="tooltip-val a">A:${d.s.A.toFixed(0)}</span>` : "";

        // ツールチップ要素を生成
        const tooltip = document.createElement('div');
        tooltip.className = 'chart-tooltip';
        tooltip.innerHTML = `${d.s.Cal}kcal<br><span class="tooltip-val p">P:${d.s.P.toFixed(0)}</span><span class="tooltip-val f">F:${d.s.F.toFixed(0)}</span><span class="tooltip-val c">C:${d.s.C.toFixed(0)}</span>${aStr}`;

        grp.innerHTML = `<span class="bar-lbl">${d.label}</span>`;
        grp.appendChild(col);
        grp.appendChild(tooltip);

        // タップ時に他のツールチップを消して自分を表示
        grp.onclick = () => {
            document.querySelectorAll('.bar-grp').forEach(g => g.classList.remove('sc-act'));
            grp.classList.add('sc-act');
            // 3秒後に自動で消える
            setTimeout(() => grp.classList.remove('sc-act'), 3000);
        };
        box.appendChild(grp);
    });
}

function saveBody() {
    const d = document.getElementById('b-date').value; const w = parseNum(document.getElementById('b-weight').value); const f = parseNum(document.getElementById('b-fat').value); const waist = parseNum(document.getElementById('b-waist').value);
    if (!d || (!w && !f && !waist)) return alert("日付と数値を入力してください");
    const idx = bodyData.findIndex(x => x.date === d); const rec = { date: d, w: w, f: f, waist: waist }; if (idx >= 0) bodyData[idx] = rec; else bodyData.push(rec);
    bodyData.sort((a, b) => new Date(a.date) - new Date(b.date)); localStorage.setItem('tf_body', JSON.stringify(bodyData)); if (typeof showToast === 'function') showToast("📉 体組成を記録したたま！"); document.querySelector('.body-inp-grid').classList.remove('editing-mode'); document.getElementById('b-weight').value = ''; document.getElementById('b-fat').value = ''; document.getElementById('b-waist').value = ''; drawBodyGraph('A', document.querySelector('.b-tog-btn')); renderBodyList();
}
function editBody(i) { const d = bodyData[i]; document.getElementById('b-date').value = d.date; document.getElementById('b-weight').value = d.w || ''; document.getElementById('b-fat').value = d.f || ''; document.getElementById('b-waist').value = d.waist || ''; const grid = document.querySelector('.body-inp-grid'); grid.scrollIntoView({ behavior: 'smooth', block: 'center' }); grid.classList.add('editing-mode'); }
function deleteBody(i) { if (!confirm("この記録を削除しますか？")) return; bodyData.splice(i, 1); localStorage.setItem('tf_body', JSON.stringify(bodyData)); drawBodyGraph('A', document.querySelector('.b-tog-btn')); renderBodyList(); }
function renderBodyList() { const d = document.getElementById('body-hist-list'); if (!d) return; d.innerHTML = bodyData.slice().reverse().map((x, i) => { const originalIdx = bodyData.length - 1 - i; return `<div class="b-hist-row" onclick="editBody(${originalIdx})"><span>${x.date}</span><span>${x.w ? x.w + 'kg' : '-'} / ${x.f ? x.f + '%' : '-'} / ${x.waist ? x.waist + 'cm' : '-'}</span><button class="b-del-btn" onclick="event.stopPropagation(); deleteBody(${originalIdx})">削除</button></div>`; }).join(''); }
function drawBodyGraph(mode, btn) {
    document.querySelectorAll('.b-tog-btn').forEach(b => b.classList.remove('act')); if (btn) btn.classList.add('act'); const box = document.getElementById('body-chart-area'); if (!box) return; box.innerHTML = ''; const legend = document.getElementById('body-legend'); legend.innerHTML = '';
    if (bodyData.length === 0) {
        box.innerHTML = `
        <div class="empty-state">
            <div class="icon">📉</div>
            <p>まだ体組成データがないたま！</p>
        </div>`;
        return;
    }
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg"); svg.setAttribute("viewBox", "0 0 300 150");

    // 超プレミアムなグラデーションの定義を追加
    const defsHTML = `<defs>
        <linearGradient id="grad-w" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#00C6FF" stop-opacity="0.6"/><stop offset="100%" stop-color="#00C6FF" stop-opacity="0"/></linearGradient>
        <linearGradient id="grad-f" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#FF9500" stop-opacity="0.6"/><stop offset="100%" stop-color="#FF9500" stop-opacity="0"/></linearGradient>
        <linearGradient id="grad-waist" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#00F260" stop-opacity="0.6"/><stop offset="100%" stop-color="#00F260" stop-opacity="0"/></linearGradient>
        <linearGradient id="grad-lbm" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#FF3154" stop-opacity="0.6"/><stop offset="100%" stop-color="#FF3154" stop-opacity="0"/></linearGradient>
        <linearGradient id="grad-fm" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#FFD300" stop-opacity="0.6"/><stop offset="100%" stop-color="#FFD300" stop-opacity="0"/></linearGradient>
    </defs>`;
    svg.insertAdjacentHTML('afterbegin', defsHTML);

    const datasets = [];
    if (mode === 'A') { datasets.push({ key: 'w', color: '#00C6FF', label: '体重', unit: 'kg' }); datasets.push({ key: 'f', color: '#FF9500', label: '体脂肪率', unit: '%' }); datasets.push({ key: 'waist', color: '#00F260', label: 'ウエスト', unit: 'cm' }); } else { datasets.push({ key: 'lbm', color: '#FF3154', label: '除脂肪', unit: 'kg' }); datasets.push({ key: 'fm', color: '#FFD300', label: '脂肪量', unit: 'kg' }); }
    const dataPoints = bodyData.slice(-14); const xStep = 260 / (dataPoints.length - 1 || 1);

    // X軸の目盛り線を引く
    for (let i = 0; i < 3; i++) {
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", 20); line.setAttribute("y1", 20 + (i * 55));
        line.setAttribute("x2", 280); line.setAttribute("y2", 20 + (i * 55));
        line.setAttribute("stroke", "#eee"); line.setAttribute("stroke-width", "1");
        svg.appendChild(line);
    }

    datasets.forEach((ds) => {
        let pts = "";
        let areaPts = ""; // 面チャート用の座標
        const vals = dataPoints.map(d => { let v = 0; if (ds.key === 'w') v = d.w; else if (ds.key === 'f') v = d.f; else if (ds.key === 'waist') v = d.waist; else if (ds.key === 'fm') v = (d.w && d.f) ? (d.w * d.f / 100) : 0; else if (ds.key === 'lbm') v = (d.w && d.f) ? (d.w - (d.w * d.f / 100)) : 0; return Number(v) || 0; });
        const max = Math.max(...vals) || 100;

        // 【改善5】最小値ぴったりだとグラフの底辺に張り付くため、少しだけパディング(余裕)を持たせる
        let rawMin = Math.min(...vals.filter(v => v > 0)) || 0;
        let min = rawMin > 0 ? (rawMin * 0.98) : 0; // 約2%の余裕を持たせる

        const range = max - min || 1; const current = vals[vals.length - 1] || 0;
        if (Math.max(...vals) > 0) { legend.innerHTML += `<div class="bl-item"><div class="bl-dot" style="background:${ds.color}"></div><span>${ds.label}: ${current.toFixed(1)}${ds.unit} <span style="color:#999;font-size:9px;">(${rawMin.toFixed(1)}~${max.toFixed(1)})</span></span></div>`; }

        let firstX = -1, lastX = -1;

        vals.forEach((v, i) => {
            if (v > 0) {
                const x = 20 + i * xStep; const y = 130 - ((v - min) / range * 110);
                pts += `${x},${y} `;
                areaPts += `${x},${y} `;
                if (firstX === -1) firstX = x;
                lastX = x;

                const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
                dot.setAttribute("cx", x); dot.setAttribute("cy", y); dot.setAttribute("r", "4");
                dot.setAttribute("fill", ds.color); dot.setAttribute("class", "g-dot");
                dot.onclick = () => {
                    const pop = document.getElementById('body-pop'); pop.style.display = 'block';
                    pop.style.left = (x / 300 * 100) + '%'; pop.style.top = '10px';
                    pop.innerHTML = `${dataPoints[i].date}<br>${ds.label}: ${v.toFixed(1)}`;
                    setTimeout(() => pop.style.display = 'none', 2000);
                };
                svg.appendChild(dot);
            }
        });

        if (pts !== "") {
            // エリア（面）を描画
            const areaPoly = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
            areaPoly.setAttribute("points", `${firstX},150 ` + areaPts + `${lastX},150`);
            areaPoly.setAttribute("fill", `url(#grad-${ds.key})`);
            areaPoly.setAttribute("class", "g-area");
            svg.insertBefore(areaPoly, svg.firstChild.nextSibling);

            // 線を描画
            const poly = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
            poly.setAttribute("points", pts); poly.setAttribute("stroke", ds.color); poly.setAttribute("class", "g-line");
            svg.appendChild(poly);
        }
    });
    if (dataPoints.length > 0) {
        const startTxt = document.createElementNS("http://www.w3.org/2000/svg", "text"); startTxt.setAttribute("x", 20); startTxt.setAttribute("y", 148); startTxt.setAttribute("class", "g-label"); startTxt.textContent = dataPoints[0].date.slice(5); svg.appendChild(startTxt);
        const endTxt = document.createElementNS("http://www.w3.org/2000/svg", "text"); endTxt.setAttribute("x", 280); endTxt.setAttribute("y", 148); endTxt.setAttribute("class", "g-label"); endTxt.setAttribute("text-anchor", "end"); endTxt.textContent = dataPoints[dataPoints.length - 1].date.slice(5); svg.appendChild(endTxt);
    }
    box.appendChild(svg);
}

// ▼▼▼ マネージャーモード (デバッグ用) ▼▼▼
function tryOpenManagerMode() {
    if (!confirm(
        "【警告】マニアック・開発者専用モードです。\n\n" +
        "ダミーデータの生成など、表示を無理やり切り替える機能が含まれます。\n" +
        "意図しない表示になる恐縮があります。進みますか？"
    )) return;

    document.getElementById('manager-modal').style.display = 'flex';
    const mgrTick = document.getElementById('mgr-ticket-count');
    if (mgrTick) mgrTick.textContent = TG.cheatTickets !== undefined ? TG.cheatTickets : (TG.cheatLastUsedDate ? 0 : 1);
    mgrUpdateSlidersFromCurrent();
}

function mgrAddTicket(diff) {
    if (TG.cheatTickets === undefined) TG.cheatTickets = (TG.cheatLastUsedDate ? 0 : 1);
    TG.cheatTickets += diff;
    if (TG.cheatTickets < 0) TG.cheatTickets = 0;
    if (TG.cheatTickets > 0) {
        TG.cheatLastUsedDate = null; // Clear cooldown if any
        TG.cheatReservedDate = null;
    }
    localStorage.setItem('tf_tg', JSON.stringify(TG));
    checkCheatTicketStatus();
}

function mgrUpdateSlidersFromCurrent() {
    const t = { P: 0, F: 0, C: 0 };
    // デバッグ用食品も含めて全体のPFCを計算
    lst.forEach(x => { t.P += x.P; t.F += x.F; t.C += x.C; });
    const pPct = Math.round((t.P / TG.p) * 100) || 0;
    const fPct = Math.round((t.F / TG.f) * 100) || 0;
    const cPct = Math.round((t.C / TG.c) * 100) || 0;

    document.getElementById('mgr-slide-p').value = Math.min(150, Math.max(0, pPct));
    document.getElementById('mgr-slide-f').value = Math.min(150, Math.max(0, fPct));
    document.getElementById('mgr-slide-c').value = Math.min(150, Math.max(0, cPct));

    document.getElementById('mgr-val-p').textContent = Math.min(150, Math.max(0, pPct));
    document.getElementById('mgr-val-f').textContent = Math.min(150, Math.max(0, fPct));
    document.getElementById('mgr-val-c').textContent = Math.min(150, Math.max(0, cPct));
}

function mgrApplyPFC() {
    const pPct = document.getElementById('mgr-slide-p').value;
    const fPct = document.getElementById('mgr-slide-f').value;
    const cPct = document.getElementById('mgr-slide-c').value;

    document.getElementById('mgr-val-p').textContent = pPct;
    document.getElementById('mgr-val-f').textContent = fPct;
    document.getElementById('mgr-val-c').textContent = cPct;

    // 既存のデバッグ用食品を削除
    lst = lst.filter(x => x.id !== 'mgr_debug_food');

    // デバッグ用食品を除いた現在のPFCを計算
    const t = { P: 0, F: 0, C: 0 };
    lst.forEach(x => { t.P += x.P; t.F += x.F; t.C += x.C; });

    const targetP = (parseFloat(pPct) / 100) * TG.p;
    const targetF = (parseFloat(fPct) / 100) * TG.f;
    const targetC = (parseFloat(cPct) / 100) * TG.c;

    const diffP = targetP - t.P;
    const diffF = targetF - t.F;
    const diffC = targetC - t.C;

    if (Math.abs(diffP) > 1 || Math.abs(diffF) > 1 || Math.abs(diffC) > 1) {
        let cal = Math.round(diffP * 4 + diffF * 9 + diffC * 4);
        lst.push({
            id: 'mgr_debug_food',
            N: "🛠️ [デバッグ用] PFC調整ダミー",
            P: diffP, F: diffF, C: diffC, A: 0, Cal: cal, U: "調整", time: "晩"
        });
    }
    sv(); ren(); upd();
}

function mgrGenerateFoodDummy(months) {
    if (!confirm(`過去${months}ヶ月分の食事ダミーデータを生成しますか？\n（既存の履歴に追加されます）`)) return;
    const today = new Date();
    const days = months * 30;
    let count = 0;

    for (let i = 1; i <= days; i++) {
        let d = new Date(today);
        d.setDate(today.getDate() - i);
        let dateStr = d.toLocaleDateString();

        // 既存の履歴を取得
        let existingObj = hist.find(h => h.d === dateStr);
        let historyLst = existingObj ? JSON.parse(JSON.stringify(existingObj.l)) : [];

        // 食事ダミーデータ (isDummy: true を付与)
        let dummyLst = [
            { id: Date.now() + i * 10 + 1, N: "🍞 ダミー朝食", P: 20, F: 10, C: 40, A: 0, Cal: 330, U: "食", time: "朝", isDummy: true },
            { id: Date.now() + i * 10 + 2, N: "🍱 ダミー昼食", P: 30, F: 15, C: 60, A: 0, Cal: 495, U: "食", time: "昼", isDummy: true },
            { id: Date.now() + i * 10 + 3, N: "🥩 ダミー夕食", P: 40, F: 20, C: 50, A: 0, Cal: 540, U: "食", time: "晩", isDummy: true }
        ];

        if (i % 3 === 0 && TG.alcMode) {
            dummyLst.push({ id: Date.now() + i * 10 + 4, N: "🍺 ダミー酒", P: 0, F: 0, C: 5, A: 20, Cal: 160, U: "杯", time: "晩", isDummy: true });
        }

        // 既存の履歴にダミーを追加
        let combined = historyLst.concat(dummyLst);
        svHist(dateStr, combined);
        count++;
    }
    if (typeof showToast === 'function') showToast(`${count}日分の食事ダミーを生成しました！`);
    rHist();
    const activeGBtn = document.querySelector('.g-btn.act');
    if (activeGBtn) drawGraph(activeGBtn.textContent === '週間' ? 'week' : 'month', activeGBtn);
}

function mgrGenerateBodyDummy(months) {
    if (!confirm(`過去${months}ヶ月分の体組成ダミーデータを生成しますか？\n（既存の記録に追加/上書きされます）`)) return;
    const today = new Date();
    const days = months * 30;
    let count = 0;

    // 体重の推移幅を設定 (例: 徐々に減っていくトレンドを追加)
    let baseWeight = 70.0;
    let baseFat = 22.0;

    for (let i = days; i >= 1; i--) {
        let d = new Date(today);
        d.setDate(today.getDate() - i);

        // YYYY-MM-DD local timezone format for b-date
        let yyyy = d.getFullYear();
        let mm = String(d.getMonth() + 1).padStart(2, '0');
        let dd = String(d.getDate()).padStart(2, '0');
        let dateStrISO = `${yyyy}-${mm}-${dd}`;

        // ランダム変動
        baseWeight += (Math.random() - 0.5) * 0.4;
        baseFat += (Math.random() - 0.5) * 0.3;

        // トレンド: 大体1ヶ月で1.5kg減るペース (0.05kg/day)
        baseWeight -= 0.05;
        baseFat -= 0.03;

        let idx = bodyData.findIndex(x => x.date === dateStrISO);
        let obj = {
            date: dateStrISO,
            w: Number(baseWeight.toFixed(1)),
            f: Number(baseFat.toFixed(1)),
            waist: Number((baseWeight * 1.1).toFixed(1)),
            isDummy: true
        };

        if (idx >= 0) {
            bodyData[idx] = obj;
        } else {
            bodyData.push(obj);
        }
        count++;
    }

    // 日付順にソートして保存
    bodyData.sort((a, b) => new Date(a.date) - new Date(b.date));
    localStorage.setItem('tf_body', JSON.stringify(bodyData));

    if (typeof showToast === 'function') showToast(`${count}日分の体組成ダミーを生成しました！`);
    if (typeof renderBodyList === 'function') renderBodyList();
    const activeBTog = document.querySelector('.b-tog-btn.act');
    if (activeBTog) drawBodyGraph(activeBTog.textContent.includes('A') ? 'A' : 'B', activeBTog);
}

function mgrResetDummyData() {
    if (!confirm("すべてのダミーデータ（食事・体組成）を削除しますか？\n（ご自身で記録したデータは残ります）")) return;
    let foodCount = 0;
    let bodyCount = 0;

    // 1. 食事履歴から isDummy=true を削除
    let originalLstLen = lst.length;
    lst = lst.filter(item => !item.isDummy);
    foodCount += (originalLstLen - lst.length);
    sv();

    let newHist = [];
    hist.forEach(h => {
        let oldLen = h.l.length;
        h.l = h.l.filter(item => !item.isDummy);
        if (h.l.length < oldLen) {
            foodCount += (oldLen - h.l.length);
        }
        if (h.l.length > 0) {
            const t = { Cal: 0, P: 0, F: 0, C: 0, A: 0 };
            h.l.forEach(x => { t.Cal += x.Cal; t.P += x.P; t.F += x.F; t.C += x.C; t.A += (x.A || 0); });
            h.s = t;
            newHist.push(h);
        }
    });
    hist = newHist;
    localStorage.setItem('tf_hist', JSON.stringify(hist));

    // 2. 体組成履歴から isDummy=true を削除
    let originalBodyLen = bodyData.length;
    bodyData = bodyData.filter(item => !item.isDummy);
    bodyCount = originalBodyLen - bodyData.length;
    localStorage.setItem('tf_body', JSON.stringify(bodyData));

    if (typeof showToast === 'function') showToast(`食事${foodCount}件、体組成${bodyCount}件のダミー記録を削除しました。`);
    rHist();
    if (typeof renderBodyList === 'function') renderBodyList();
    const activeGBtn = document.querySelector('.g-btn.act');
    if (activeGBtn) drawGraph(activeGBtn.textContent === '週間' ? 'week' : 'month', activeGBtn);
    const activeBTog = document.querySelector('.b-tog-btn.act');
    if (activeBTog) drawBodyGraph(activeBTog.textContent.includes('A') ? 'A' : 'B', activeBTog);
}

function mgrHardReset() {
    if (!confirm("【警告】\nlocalStorageのデータをすべて初期化します。\n体組成やMy食品、履歴など完全に消えます。\n本当によろしいですか？")) return;
    localStorage.clear();
    alert("全データを初期化しました。再読み込みします。");
    location.reload();
}

async function forceAppUpdate() {
    if (confirm("最新バージョンに更新しますか？\n（入力済みのデータは消えません）")) {
        // Service Workerの解除
        if ('serviceWorker' in navigator) {
            try {
                const registrations = await navigator.serviceWorker.getRegistrations();
                for (let registration of registrations) {
                    await registration.unregister();
                }
            } catch (e) {
                console.error('SW unregistration failed:', e);
            }
        }

        // Cache APIの全クリア (Workbox/PWAのキャッシュを持つ場合)
        if ('caches' in window) {
            try {
                const cacheNames = await caches.keys();
                await Promise.all(cacheNames.map(name => caches.delete(name)));
            } catch (e) {
                console.error('Cache deletion failed:', e);
            }
        }

        // 確実なリロードのためにクエリパラメータを付与してリダイレクト
        const url = new URL(window.location.href);
        url.searchParams.set('reload', new Date().getTime());
        window.location.href = url.href;
    }
}
