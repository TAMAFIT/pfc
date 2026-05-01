// ▼ IndexedDB (体型写真保存用) セットアップ ▼
const DB_NAME = 'TamaFitPhotoDB';
const DB_VERSION = 1;
const STORE_NAME = 'BodyPhotos';
let photoDb;

function initPhotoDb() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror = (e) => reject('IndexedDB error: ' + e.target.error);
        request.onsuccess = (e) => {
            photoDb = e.target.result;
            resolve(photoDb);
        };
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
        };
    });
}

async function saveBodyPhotoToDb(dataUrl) {
    if (!photoDb) await initPhotoDb();
    return new Promise((resolve, reject) => {
        const transaction = photoDb.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const record = {
            id: Date.now().toString(), // タイムスタンプをIDに
            timestamp: Date.now(),
            imageData: dataUrl
        };
        const request = store.add(record);
        request.onsuccess = () => resolve(record.id);
        request.onerror = (e) => reject(e.target.error);
    });
}

async function getAllBodyPhotos() {
    if (!photoDb) await initPhotoDb();
    return new Promise((resolve, reject) => {
        const transaction = photoDb.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();
        request.onsuccess = () => {
            // 最新順にソートして返す
            const photos = request.result || [];
            photos.sort((a, b) => b.timestamp - a.timestamp);
            resolve(photos);
        };
        request.onerror = (e) => reject(e.target.error);
    });
}
async function deleteBodyPhoto(id) {
    if (!photoDb) await initPhotoDb();
    return new Promise((resolve, reject) => {
        const transaction = photoDb.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = (e) => reject(e.target.error);
    });
}

// ページロード時にDB初期化
document.addEventListener('DOMContentLoaded', () => {
    initPhotoDb().catch(console.error);
});

// ▼ UI制御用スクリプト ▼
(function () {
    const todayStr = new Date().toLocaleDateString();
    const lastD = localStorage.getItem('tf_last_date');
    if (lastD && lastD !== todayStr) {
        localStorage.setItem('tf_cheat_day', 'false');
        localStorage.setItem('tf_cheat_record', 'false');
        localStorage.setItem('tf_cheat_highcarb', 'false');
    }
})();
let isCheatDay = localStorage.getItem('tf_cheat_day') === 'true';
let recordOnCheatDay = localStorage.getItem('tf_cheat_record') === 'true';
let isHighCarbMode = localStorage.getItem('tf_cheat_highcarb') === 'true';

let pendingCheatAction = null;
let pendingCheatDate = null;
let cheatReserveReturnToChoice = true;

function getLocalDateKey(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function formatCheatDate(dateKey) {
    if (!dateKey) return "";
    const [y, m, d] = dateKey.split("-");
    return `${Number(m)}/${Number(d)}`;
}

function openPreCheatModal() { openCheatModal(); }
function closePreCheatModal() { document.getElementById('cheat-pre-modal').style.display = 'none'; }

function openCheatConfirm(action, dateKey = null) {
    pendingCheatAction = action;
    pendingCheatDate = dateKey;
    const text = document.getElementById('cheat-confirm-text');
    if (text) {
        text.textContent = action === 'reserve'
            ? `${formatCheatDate(dateKey)}にチートデイパスを予約します。`
            : "今日、チートデイパスを使用します。";
    }
    document.getElementById('cheat-pre-modal').style.display = 'flex';
}

function confirmPreCheatModal() {
    closePreCheatModal();
    if (pendingCheatAction === 'reserve') {
        reserveCheatDay(pendingCheatDate);
    } else if (pendingCheatAction === 'today') {
        startCheatDay(true);
    }
    pendingCheatAction = null;
    pendingCheatDate = null;
}

function openCheatModal() { document.getElementById('cheat-ticket-modal').style.display = 'flex'; }
function closeCheatModal() { document.getElementById('cheat-ticket-modal').style.display = 'none'; }

function prepareCheatToday() {
    closeCheatModal();
    openCheatConfirm('today');
}

function openCheatReserveModal(returnToChoice = true) {
    cheatReserveReturnToChoice = returnToChoice;
    closeCheatModal();
    const input = document.getElementById('cheat-reserve-date');
    if (input) {
        const today = getLocalDateKey();
        input.min = today;
        input.value = TG.cheatReservedDate || today;
    }
    document.getElementById('cheat-reserve-modal').style.display = 'flex';
}

function closeCheatReserveModal() {
    document.getElementById('cheat-reserve-modal').style.display = 'none';
    if (cheatReserveReturnToChoice) openCheatModal();
}

function prepareCheatReserve() {
    const input = document.getElementById('cheat-reserve-date');
    const dateKey = input ? input.value : "";
    if (!dateKey) {
        if (typeof showToast === 'function') showToast("予約日を選んでください。");
        return;
    }
    document.getElementById('cheat-reserve-modal').style.display = 'none';
    openCheatConfirm('reserve', dateKey);
}

function reserveCheatDay(dateKey) {
    if (!dateKey) return;
    if (dateKey === getLocalDateKey()) {
        startCheatDay(true);
        return;
    }
    TG.cheatReservedDate = dateKey;
    if (typeof consumeCheatTicket === 'function') consumeCheatTicket(dateKey);
    localStorage.setItem('tf_tg', JSON.stringify(TG));
    if (typeof showToast === 'function') showToast(`${formatCheatDate(dateKey)}にチートデイを予約しました。`);
    if (typeof checkCheatTicketStatus === 'function') checkCheatTicketStatus();
}

function changeCheatReservation() {
    openCheatReserveModal(false);
}

function cancelCheatReservation() {
    if (!confirm("チートデイの予約を取り消しますか？\nチケットは戻ります。")) return;
    TG.cheatReservedDate = null;
    if (typeof restoreCheatTicket === 'function') restoreCheatTicket();
    localStorage.setItem('tf_tg', JSON.stringify(TG));
    if (typeof checkCheatTicketStatus === 'function') checkCheatTicketStatus();
    if (typeof showToast === 'function') showToast("チートデイ予約を取り消しました。");
}

function startCheatDay(active, consumeTicket = true) {
    isCheatDay = active;
    localStorage.setItem('tf_cheat_day', active);
    if (active) {
        document.body.classList.add('cheat-mode');
        document.getElementById('cheat-panel').style.display = 'block';
        TG.cheatReservedDate = null;
        localStorage.setItem('tf_tg', JSON.stringify(TG));
        if (consumeTicket && typeof consumeCheatTicket === 'function') consumeCheatTicket();
        if (typeof showToast === 'function') showToast("🎉 チートデイ発動！今日は楽しむたま！\n（1週間使えなくなりました）");
        toggleCheatRecord();
    }
    closeCheatModal();
}

function cancelCheatDay() {
    isCheatDay = false;
    localStorage.setItem('tf_cheat_day', 'false');
    localStorage.setItem('tf_cheat_record', 'false');
    localStorage.setItem('tf_cheat_highcarb', 'false');
    document.body.classList.remove('cheat-mode');
    document.getElementById('cheat-panel').style.display = 'none';

    document.querySelector('.dash').style.display = 'block';
    document.querySelector('.tgt-sec').style.display = 'block';

    if (typeof restoreCheatTicket === 'function') restoreCheatTicket();

    if (typeof showToast === 'function') showToast("チートデイをパスしたたま！チケットを戻したよ！");

    // リセット
    recordOnCheatDay = false;
    document.getElementById('cheat-record-toggle').checked = false;
    isHighCarbMode = false;
    document.getElementById('high-carb-toggle').checked = false;
    if (typeof upd === 'function') upd();
}

function finishCheatDay() {
    isCheatDay = false;
    localStorage.setItem('tf_cheat_day', 'false');
    localStorage.setItem('tf_cheat_record', 'false');
    localStorage.setItem('tf_cheat_highcarb', 'false');
    document.body.classList.remove('cheat-mode');
    const cp = document.getElementById('cheat-panel');
    if (cp) cp.style.display = 'none';

    const dash = document.querySelector('.dash');
    if (dash) dash.style.display = 'block';
    const tgt = document.querySelector('.tgt-sec');
    if (tgt) tgt.style.display = 'block';

    recordOnCheatDay = false;
    const crt = document.getElementById('cheat-record-toggle');
    if (crt) crt.checked = false;

    isHighCarbMode = false;
    const hct = document.getElementById('high-carb-toggle');
    if (hct) hct.checked = false;
    if (typeof upd === 'function') upd();
}

document.addEventListener('DOMContentLoaded', () => {
    if (!isCheatDay && TG.cheatReservedDate === getLocalDateKey()) {
        startCheatDay(true, false);
    }
    if (isCheatDay) {
        document.body.classList.add('cheat-mode');
        document.getElementById('cheat-panel').style.display = 'block';

        // 記録モードの復元とUI同期
        document.getElementById('cheat-record-toggle').checked = recordOnCheatDay;
        document.getElementById('high-carb-toggle').checked = isHighCarbMode;
        toggleCheatRecord(true);
    }
});

function toggleCheatRecord(skipUpd = false) {
    recordOnCheatDay = document.getElementById('cheat-record-toggle').checked;
    localStorage.setItem('tf_cheat_record', recordOnCheatDay);

    const hcArea = document.getElementById('high-carb-area');
    const dashArea = document.querySelector('.dash');
    const tgtArea = document.querySelector('.tgt-sec');

    if (recordOnCheatDay) {
        if (hcArea) hcArea.style.display = 'block';
        if (dashArea) dashArea.style.display = 'block';
        if (tgtArea) tgtArea.style.display = 'block';
    } else {
        if (hcArea) hcArea.style.display = 'none';
        if (dashArea) dashArea.style.display = 'none';
        if (tgtArea) tgtArea.style.display = 'none';

        isHighCarbMode = false;
        localStorage.setItem('tf_cheat_highcarb', 'false');
        if (document.getElementById('high-carb-toggle')) document.getElementById('high-carb-toggle').checked = false;
    }
    if (!skipUpd && typeof upd === 'function') upd();
}

function toggleHighCarb() {
    isHighCarbMode = document.getElementById('high-carb-toggle').checked;
    localStorage.setItem('tf_cheat_highcarb', isHighCarbMode);
    if (typeof upd === 'function') upd();
}

function toggleManualPanel() {
    const el = document.getElementById('manual-inp-sec');
    if (el.style.display === 'block') {
        el.style.display = 'none';
    } else {
        el.style.display = 'block';
        setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    }
}

const MEAL_GACHA_BANK = {
    keto: [
        { q: "\u30b5\u30fc\u30e2\u30f3 \u30a2\u30dc\u30ab\u30c9", note: "\u30b1\u30c8\u4e2d\u3067\u3082\u4f7f\u3044\u3084\u3059\u3044\u8102\u8cea\u6e90\u3092\u8db3\u3057\u3084\u3059\u3044\u7d44\u307f\u5408\u308f\u305b\u3067\u3059\u3002" },
        { q: "\u725b\u30b9\u30c6\u30fc\u30ad \u30d0\u30bf\u30fc", note: "\u7cd6\u8cea\u3092\u6291\u3048\u3064\u3064\u3001\u8102\u8cea\u3068\u305f\u3093\u3071\u304f\u8cea\u3092\u3057\u3063\u304b\u308a\u5165\u308c\u3084\u3059\u3044\u5019\u88dc\u3067\u3059\u3002" },
        { q: "\u9d8f\u3082\u3082 \u30c1\u30fc\u30ba\u713c\u304d", note: "\u4f4e\u7cd6\u8cea\u3067\u6e80\u8db3\u611f\u3092\u51fa\u3057\u3084\u3059\u3044\u30e1\u30cb\u30e5\u30fc\u3067\u3059\u3002" },
        { q: "\u30b5\u30d0 \u5869\u713c\u304d", note: "\u9b5a\u306e\u8102\u3092\u4f7f\u3048\u3066\u3001\u7cd6\u8cea\u3092\u304b\u306a\u308a\u6291\u3048\u3084\u3059\u3044\u5019\u88dc\u3067\u3059\u3002" },
        { q: "\u5375 \u30c1\u30fc\u30ba \u30aa\u30e0\u30ec\u30c4", note: "\u624b\u8efd\u3067\u7cd6\u8cea\u304c\u5165\u308a\u306b\u304f\u304f\u3001\u671d\u3084\u8efd\u98df\u306b\u3082\u56de\u3057\u3084\u3059\u3044\u5019\u88dc\u3067\u3059\u3002" },
        { q: "\u304d\u306e\u3053 \u30d0\u30bf\u30fc\u7092\u3081", note: "\u4f4e\u7cd6\u8cea\u306e\u526f\u83dc\u3068\u3057\u3066\u8102\u8cea\u3092\u8db3\u3057\u3084\u3059\u3044\u5019\u88dc\u3067\u3059\u3002" },
        { q: "\u8c5a\u30d0\u30e9 \u30ad\u30e3\u30d9\u30c4 \u84b8\u3057", note: "\u91ce\u83dc\u3092\u5c11\u3057\u5165\u308c\u306a\u304c\u3089\u3001\u7cd6\u8cea\u3092\u6291\u3048\u3066\u8102\u8cea\u3092\u78ba\u4fdd\u3057\u3084\u3059\u3044\u5019\u88dc\u3067\u3059\u3002" },
        { q: "\u9d8f\u3082\u3082 \u5869\u713c\u304d", note: "\u5473\u4ed8\u3051\u3092\u30b7\u30f3\u30d7\u30eb\u306b\u3059\u308c\u3070\u7cd6\u8cea\u3092\u304b\u306a\u308a\u6291\u3048\u3084\u3059\u3044\u5019\u88dc\u3067\u3059\u3002" },
        { q: "\u30d6\u30ea \u7167\u308a\u713c\u304d \u7cd6\u8cea\u30aa\u30d5", note: "\u9b5a\u306e\u8102\u3092\u4f7f\u3044\u3084\u3059\u304f\u3001\u30bf\u30ec\u3092\u63a7\u3048\u308c\u3070\u30b1\u30c8\u4e2d\u306b\u3082\u5bc4\u305b\u3084\u3059\u3044\u5019\u88dc\u3067\u3059\u3002" },
        { q: "\u8c5a\u3057\u3083\u3076 \u30ec\u30bf\u30b9", note: "\u7cd6\u8cea\u3092\u5897\u3084\u3055\u305a\u3001\u8089\u3068\u91ce\u83dc\u3067\u98df\u3079\u3084\u3059\u3044\u5019\u88dc\u3067\u3059\u3002" },
        { q: "\u539a\u63da\u3052 \u30c1\u30fc\u30ba\u713c\u304d", note: "\u7cd6\u8cea\u3092\u6291\u3048\u3064\u3064\u3001\u98df\u3079\u3054\u305f\u3048\u3092\u51fa\u3057\u3084\u3059\u3044\u5019\u88dc\u3067\u3059\u3002" },
        { q: "\u30c4\u30ca \u30de\u30e8 \u5375", note: "\u624b\u8efd\u306b\u8102\u8cea\u3068\u305f\u3093\u3071\u304f\u8cea\u3092\u8db3\u3057\u3084\u3059\u3044\u5019\u88dc\u3067\u3059\u3002" },
    ],
    lowfat: [
        { q: "\u9d8f\u3080\u306d \u84b8\u3057\u9d8f", note: "\u8102\u8cea\u3092\u6291\u3048\u3064\u3064\u3001\u305f\u3093\u3071\u304f\u8cea\u3092\u5897\u3084\u3057\u3084\u3059\u3044\u738b\u9053\u5019\u88dc\u3067\u3059\u3002" },
        { q: "\u3055\u3055\u307f \u6885\u3057\u305d", note: "\u8efd\u304f\u98df\u3079\u3084\u3059\u304f\u3001\u30ed\u30fc\u30d5\u30a1\u30c3\u30c8\u4e2d\u3067\u3082\u4f7f\u3044\u3084\u3059\u3044\u5019\u88dc\u3067\u3059\u3002" },
        { q: "\u767d\u8eab\u9b5a \u30db\u30a4\u30eb\u713c\u304d", note: "\u8102\u8cea\u3092\u6291\u3048\u306a\u304c\u3089\u3001\u9b5a\u3092\u5165\u308c\u305f\u3044\u65e5\u306b\u5411\u3044\u3066\u3044\u307e\u3059\u3002" },
        { q: "\u8c5a\u30d2\u30ec \u751f\u59dc\u713c\u304d", note: "\u8102\u8cea\u3092\u63a7\u3048\u3081\u306b\u3057\u3064\u3064\u3001\u8089\u30e1\u30cb\u30e5\u30fc\u611f\u3092\u6b8b\u305b\u307e\u3059\u3002" },
        { q: "\u30ce\u30f3\u30aa\u30a4\u30eb \u30c4\u30ca \u30b5\u30e9\u30c0", note: "\u3042\u3068\u5c11\u3057P\u3092\u8db3\u3057\u305f\u3044\u6642\u306b\u4f7f\u3044\u3084\u3059\u3044\u5019\u88dc\u3067\u3059\u3002" },
        { q: "\u9d8f\u3080\u306d \u7167\u308a\u713c\u304d", note: "\u76ae\u306a\u3057\u3067\u4f5c\u308c\u3070\u8102\u8cea\u3092\u6291\u3048\u306a\u304c\u3089\u6e80\u8db3\u611f\u3092\u51fa\u3057\u3084\u3059\u3044\u5019\u88dc\u3067\u3059\u3002" },
        { q: "\u9d8f\u3080\u306d \u30d4\u30ab\u30bf", note: "\u8102\u8cea\u3092\u6291\u3048\u3064\u3064\u3001\u5375\u3067\u98df\u3079\u3084\u3059\u3055\u3082\u8db3\u305b\u308b\u5019\u88dc\u3067\u3059\u3002" },
        { q: "\u3055\u3055\u307f \u30d5\u30e9\u30a4\u30d1\u30f3", note: "\u63da\u3052\u7269\u306b\u5bc4\u305b\u305a\u3001\u8efd\u3081\u306b\u305f\u3093\u3071\u304f\u8cea\u3092\u8db3\u3057\u3084\u3059\u3044\u5019\u88dc\u3067\u3059\u3002" },
        { q: "\u30bf\u30e9 \u91ce\u83dc\u84b8\u3057", note: "\u304b\u306a\u308a\u8efd\u3081\u306b\u6e08\u307e\u305b\u305f\u3044\u65e5\u306b\u4f7f\u3044\u3084\u3059\u3044\u5019\u88dc\u3067\u3059\u3002" },
        { q: "\u30a8\u30d3 \u30d6\u30ed\u30c3\u30b3\u30ea\u30fc", note: "\u8102\u8cea\u3092\u6291\u3048\u306a\u304c\u3089\u3001\u305f\u3093\u3071\u304f\u8cea\u3092\u8db3\u3057\u3084\u3059\u3044\u5b9a\u756a\u5019\u88dc\u3067\u3059\u3002" },
        { q: "\u30a4\u30ab \u5927\u6839 \u716e\u7269", note: "\u8102\u8cea\u3092\u6291\u3048\u3084\u3059\u304f\u3001\u548c\u98df\u5bc4\u308a\u3067\u7d9a\u3051\u3084\u3059\u3044\u5019\u88dc\u3067\u3059\u3002" },
        { q: "\u9d8f\u3080\u306d \u5357\u86ee\u6f2c\u3051", note: "\u6cb9\u3092\u63a7\u3048\u3081\u306b\u3059\u308c\u3070\u3001\u3055\u3063\u3071\u308a\u98df\u3079\u3084\u3059\u3044\u5019\u88dc\u3067\u3059\u3002" },
    ],
    protein: [
        { q: "\u8c5a\u3057\u3083\u3076 \u30b5\u30e9\u30c0", note: "\u305f\u3093\u3071\u304f\u8cea\u3092\u8db3\u3057\u3064\u3064\u3001\u91cd\u304f\u306a\u308a\u3059\u304e\u306a\u3044\u5019\u88dc\u3067\u3059\u3002" },
        { q: "\u8c46\u8150 \u30cf\u30f3\u30d0\u30fc\u30b0", note: "\u3084\u3055\u3057\u3081\u306bP\u3092\u8db3\u3057\u3084\u3059\u304f\u3001\u98df\u3079\u3084\u3059\u3044\u5019\u88dc\u3067\u3059\u3002" },
        { q: "\u9bad \u30db\u30a4\u30eb\u713c\u304d", note: "\u305f\u3093\u3071\u304f\u8cea\u3068\u8102\u8cea\u306e\u30d0\u30e9\u30f3\u30b9\u304c\u53d6\u308a\u3084\u3059\u3044\u5019\u88dc\u3067\u3059\u3002" },
        { q: "\u9d8f\u3082\u3082 \u5869\u713c\u304d", note: "\u305f\u3093\u3071\u304f\u8cea\u3092\u8db3\u3057\u306a\u304c\u3089\u6e80\u8db3\u611f\u3082\u51fa\u3057\u3084\u3059\u3044\u5019\u88dc\u3067\u3059\u3002" },
        { q: "\u9d8f\u3080\u306d \u89aa\u5b50\u716e", note: "\u9d8f\u8089\u3068\u5375\u3067\u3001\u305f\u3093\u3071\u304f\u8cea\u3092\u307e\u3068\u3081\u3066\u8db3\u3057\u3084\u3059\u3044\u5019\u88dc\u3067\u3059\u3002" },
        { q: "\u725b\u8d64\u8eab \u30b9\u30c6\u30fc\u30ad", note: "\u8102\u8cea\u3092\u5897\u3084\u3057\u3059\u304e\u305a\u3001\u3057\u3063\u304b\u308aP\u3092\u5165\u308c\u305f\u3044\u65e5\u306b\u4f7f\u3044\u3084\u3059\u3044\u5019\u88dc\u3067\u3059\u3002" },
        { q: "\u30ab\u30c4\u30aa \u305f\u305f\u304d", note: "\u3055\u3063\u3071\u308a\u98df\u3079\u306a\u304c\u3089\u3001\u305f\u3093\u3071\u304f\u8cea\u3092\u8db3\u3057\u3084\u3059\u3044\u5019\u88dc\u3067\u3059\u3002" },
        { q: "\u307e\u3050\u308d \u5c71\u304b\u3051", note: "\u9b5a\u3067P\u3092\u8db3\u3057\u305f\u3044\u6642\u306b\u691c\u7d22\u3057\u3084\u3059\u3044\u5b9a\u756a\u5019\u88dc\u3067\u3059\u3002" },
        { q: "\u5375 \u8c46\u8150 \u3042\u3093\u304b\u3051", note: "\u8efd\u3081\u306b\u305f\u3093\u3071\u304f\u8cea\u3092\u8db3\u3057\u305f\u3044\u65e5\u306b\u4f7f\u3044\u3084\u3059\u3044\u5019\u88dc\u3067\u3059\u3002" },
        { q: "\u9d8f\u56e3\u5b50 \u30b9\u30fc\u30d7", note: "\u6c41\u7269\u306b\u3059\u308b\u3068\u91cf\u3092\u8abf\u6574\u3057\u3084\u3059\u304f\u3001P\u3082\u8db3\u3057\u3084\u3059\u3044\u5019\u88dc\u3067\u3059\u3002" },
        { q: "\u30b5\u30d0\u7f36 \u30ad\u30e3\u30d9\u30c4", note: "\u624b\u8efd\u306b\u9b5a\u306e\u305f\u3093\u3071\u304f\u8cea\u3092\u5165\u308c\u305f\u3044\u6642\u306b\u4f7f\u3044\u3084\u3059\u3044\u5019\u88dc\u3067\u3059\u3002" },
        { q: "\u7d0d\u8c46 \u30aa\u30e0\u30ec\u30c4", note: "\u671d\u98df\u3084\u8efd\u98df\u3067P\u3092\u8db3\u3057\u3084\u3059\u3044\u5019\u88dc\u3067\u3059\u3002" },
    ],
    carb: [
        { q: "\u89aa\u5b50\u4e3c", note: "\u70ad\u6c34\u5316\u7269\u3068\u305f\u3093\u3071\u304f\u8cea\u3092\u307e\u3068\u3081\u3066\u5165\u308c\u3084\u3059\u3044\u5019\u88dc\u3067\u3059\u3002" },
        { q: "\u3046\u3069\u3093 \u5375", note: "C\u3092\u8db3\u3057\u306a\u304c\u3089\u8efd\u3081\u306b\u6e08\u307e\u305b\u305f\u3044\u6642\u306b\u4f7f\u3044\u3084\u3059\u3044\u5019\u88dc\u3067\u3059\u3002" },
        { q: "\u9bad \u304a\u306b\u304e\u308a", note: "\u70ad\u6c34\u5316\u7269\u3092\u8db3\u3057\u3064\u3064\u3001\u305f\u3093\u3071\u304f\u8cea\u3082\u5c11\u3057\u62fe\u3048\u308b\u5019\u88dc\u3067\u3059\u3002" },
        { q: "\u9d8f\u305d\u307c\u308d\u4e3c", note: "C\u3068P\u3092\u540c\u6642\u306b\u8db3\u3057\u3084\u3059\u3044\u3001\u8a18\u9332\u3082\u3057\u3084\u3059\u3044\u5019\u88dc\u3067\u3059\u3002" },
        { q: "\u8c5a\u4e3c", note: "\u3054\u98ef\u91cf\u3067C\u3092\u8abf\u6574\u3057\u3084\u3059\u304f\u3001\u6e80\u8db3\u611f\u3082\u51fa\u3057\u3084\u3059\u3044\u5019\u88dc\u3067\u3059\u3002" },
        { q: "\u9bad \u96d1\u708a", note: "\u8efd\u304fC\u3092\u8db3\u3057\u305f\u3044\u65e5\u306b\u4f7f\u3044\u3084\u3059\u3044\u5019\u88dc\u3067\u3059\u3002" },
        { q: "\u30c4\u30ca \u5375 \u3054\u98ef", note: "\u5bb6\u306b\u3042\u308b\u98df\u6750\u3067\u4f5c\u308a\u3084\u3059\u304f\u3001C\u3068P\u3092\u8db3\u3057\u3084\u3059\u3044\u5019\u88dc\u3067\u3059\u3002" },
        { q: "\u713c\u304d\u9ce5\u4e3c", note: "\u3054\u98ef\u91cf\u3092\u8abf\u6574\u3057\u306a\u304c\u3089\u3001\u305f\u3093\u3071\u304f\u8cea\u3082\u4e00\u7dd2\u306b\u5165\u308c\u3084\u3059\u3044\u5019\u88dc\u3067\u3059\u3002" },
        { q: "\u548c\u98a8 \u30d1\u30b9\u30bf \u30c4\u30ca", note: "C\u3092\u3057\u3063\u304b\u308a\u5165\u308c\u305f\u3044\u65e5\u306b\u691c\u7d22\u3057\u3084\u3059\u3044\u5019\u88dc\u3067\u3059\u3002" },
        { q: "\u3058\u3083\u304c\u3044\u3082 \u9d8f\u3080\u306d", note: "\u828b\u3067C\u3092\u8db3\u3057\u306a\u304c\u3089\u3001P\u3082\u62fe\u3044\u3084\u3059\u3044\u5019\u88dc\u3067\u3059\u3002" },
        { q: "\u30aa\u30fc\u30c8\u30df\u30fc\u30eb \u5375", note: "\u671d\u98df\u3084\u8efd\u98df\u3067C\u3092\u8abf\u6574\u3057\u3084\u3059\u3044\u5019\u88dc\u3067\u3059\u3002" },
        { q: "\u30b5\u30d0\u7f36 \u708a\u304d\u8fbc\u307f\u3054\u98ef", note: "C\u3068\u9b5a\u306e\u305f\u3093\u3071\u304f\u8cea\u3092\u307e\u3068\u3081\u3066\u5165\u308c\u3084\u3059\u3044\u5019\u88dc\u3067\u3059\u3002" },
    ],
    balanced: [
        { q: "\u30b5\u30d0 \u5473\u564c\u716e", note: "\u9b5a\u3092\u5165\u308c\u305f\u3044\u65e5\u306b\u4f7f\u3044\u3084\u3059\u3044\u3001\u6e80\u8db3\u611f\u306e\u3042\u308b\u5019\u88dc\u3067\u3059\u3002" },
        { q: "\u8c5a\u3057\u3083\u3076 \u30b5\u30e9\u30c0", note: "\u91cd\u304f\u306a\u308a\u3059\u304e\u305a\u3001PFC\u3092\u6574\u3048\u3084\u3059\u3044\u5019\u88dc\u3067\u3059\u3002" },
        { q: "\u30ad\u30e0\u30c1\u934b", note: "\u5177\u6750\u3067\u8abf\u6574\u3057\u3084\u3059\u304f\u3001\u91ce\u83dc\u3068\u305f\u3093\u3071\u304f\u8cea\u3092\u307e\u3068\u3081\u3084\u3059\u3044\u5019\u88dc\u3067\u3059\u3002" },
        { q: "\u9d8f\u3082\u3082 \u7167\u308a\u713c\u304d", note: "\u98df\u4e8b\u306e\u6e80\u8db3\u611f\u3092\u51fa\u3057\u306a\u304c\u3089\u8a18\u9332\u3057\u3084\u3059\u3044\u5019\u88dc\u3067\u3059\u3002" },
        { q: "\u307e\u3050\u308d \u30a2\u30dc\u30ab\u30c9", note: "\u305f\u3093\u3071\u304f\u8cea\u3068\u8102\u8cea\u3092\u30d0\u30e9\u30f3\u30b9\u3088\u304f\u8db3\u3057\u3084\u3059\u3044\u5019\u88dc\u3067\u3059\u3002" },
        { q: "\u9bad \u3061\u3083\u3093\u3061\u3083\u3093\u713c\u304d", note: "\u9b5a\u3068\u91ce\u83dc\u3092\u307e\u3068\u3081\u3084\u3059\u304f\u3001\u5bb6\u5ead\u6599\u7406\u3068\u3057\u3066\u691c\u7d22\u3057\u3084\u3059\u3044\u5019\u88dc\u3067\u3059\u3002" },
        { q: "\u9d8f\u8089 \u30c8\u30de\u30c8\u716e", note: "\u91ce\u83dc\u3082\u5165\u308c\u3084\u3059\u304f\u3001PFC\u3092\u5927\u304d\u304f\u5d29\u3057\u306b\u304f\u3044\u5019\u88dc\u3067\u3059\u3002" },
        { q: "\u8c5a\u3053\u307e \u91ce\u83dc\u7092\u3081", note: "\u5bb6\u306b\u3042\u308b\u98df\u6750\u3067\u4f5c\u308a\u3084\u3059\u304f\u3001\u91cf\u306e\u8abf\u6574\u3082\u3057\u3084\u3059\u3044\u5019\u88dc\u3067\u3059\u3002" },
        { q: "\u8089\u8c46\u8150", note: "\u305f\u3093\u3071\u304f\u8cea\u3092\u5165\u308c\u3064\u3064\u3001\u98df\u4e8b\u3068\u3057\u3066\u6e80\u8db3\u3057\u3084\u3059\u3044\u5019\u88dc\u3067\u3059\u3002" },
        { q: "\u9d8f\u3064\u304f\u306d", note: "\u98df\u3079\u3084\u3059\u304f\u3001\u4e3b\u83dc\u3068\u3057\u3066\u4f7f\u3044\u3084\u3059\u3044\u5b9a\u756a\u5019\u88dc\u3067\u3059\u3002" },
        { q: "\u30d6\u30ea \u5927\u6839", note: "\u9b5a\u30e1\u30cb\u30e5\u30fc\u306e\u30d0\u30ea\u30a8\u30fc\u30b7\u30e7\u30f3\u3068\u3057\u3066\u4f7f\u3044\u3084\u3059\u3044\u5019\u88dc\u3067\u3059\u3002" },
        { q: "\u725b\u8089 \u30d4\u30fc\u30de\u30f3 \u7092\u3081", note: "\u8089\u3068\u91ce\u83dc\u3092\u307e\u3068\u3081\u3084\u3059\u304f\u3001\u3054\u98ef\u91cf\u3067C\u3082\u8abf\u6574\u3057\u3084\u3059\u3044\u5019\u88dc\u3067\u3059\u3002" },
    ]
};

let mealGachaLastKey = "";
let mealGachaLastIndex = -1;
let mealGachaDecks = {};
let mealGachaRecentTypes = [];

function rollMealGacha() {
    const picked = pickMealGachaItem();
    const box = document.getElementById('meal-gacha-result');
    if (!box || !picked) return;

    box.style.display = 'block';
    box.innerHTML = `
        <div class="meal-gacha-card-head">
            <div>
                <div class="meal-gacha-kicker">今日の献立提案</div>
                <div class="meal-gacha-label">${escapeHtml(picked.label)}</div>
            </div>
            <button class="meal-gacha-close" onclick="closeMealGachaResult()" type="button">閉じる</button>
        </div>
        <div class="meal-gacha-dish">
            <div class="meal-gacha-plate">🍽️</div>
            <div>
                <div class="meal-gacha-title">${escapeHtml(picked.item.q)}</div>
                <div class="meal-gacha-note">${escapeHtml(picked.item.note)}</div>
            </div>
        </div>
        <div class="meal-gacha-links" aria-label="レシピ検索リンク">
            <button class="meal-gacha-delish" onclick="openMealGachaLink('${escapeForAttr(picked.item.q)}','delish')">デリッシュキッチン</button>
            <button class="meal-gacha-youtube" onclick="openMealGachaLink('${escapeForAttr(picked.item.q)}','youtube')">YouTube</button>
            <button class="meal-gacha-reroll" onclick="rollMealGacha()">別の候補にする</button>
        </div>
    `;
    setTimeout(() => box.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
}

function closeMealGachaResult() {
    const box = document.getElementById('meal-gacha-result');
    if (!box) return;
    box.style.display = 'none';
    box.innerHTML = '';
}

function pickMealGachaItem() {
    const isKeto = TG && TG.mode === "keto";
    let key = isKeto ? "keto" : "all";
    let label = "今日のおすすめ";
    let bank;

    if (isKeto) {
        bank = MEAL_GACHA_BANK.keto;
        label = "ケト向けおすすめ";
    } else {
        bank = [
            ...MEAL_GACHA_BANK.lowfat,
            ...MEAL_GACHA_BANK.protein,
            ...MEAL_GACHA_BANK.carb,
            ...MEAL_GACHA_BANK.balanced
        ];
    }

    if (!mealGachaDecks[key] || mealGachaDecks[key].length === 0) {
        mealGachaDecks[key] = shuffleMealGachaDeck(bank.length);
    }

    let deckPickIndex = 0;
    const avoidTypes = mealGachaRecentTypes.slice(-3);
    for (let i = 0; i < mealGachaDecks[key].length; i++) {
        const candidateType = getMealGachaType(bank[mealGachaDecks[key][i]].q);
        if (!avoidTypes.includes(candidateType)) {
            deckPickIndex = i;
            break;
        }
    }

    const idx = mealGachaDecks[key].splice(deckPickIndex, 1)[0];
    const pickedType = getMealGachaType(bank[idx].q);
    mealGachaLastKey = key;
    mealGachaLastIndex = idx;
    mealGachaRecentTypes.push(pickedType);
    if (mealGachaRecentTypes.length > 6) mealGachaRecentTypes.shift();
    return { item: bank[idx], label };
}

function shuffleMealGachaDeck(length) {
    const deck = Array.from({ length }, (_, i) => i);
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
}

function getMealGachaType(query) {
    if (/鶏|ささみ|親子|焼き鳥/.test(query)) return "chicken";
    if (/豚/.test(query)) return "pork";
    if (/牛/.test(query)) return "beef";
    if (/サバ|鮭|タラ|ブリ|まぐろ|カツオ|白身魚|魚/.test(query)) return "fish";
    if (/エビ|イカ/.test(query)) return "seafood";
    if (/豆腐|厚揚げ|納豆/.test(query)) return "soy";
    if (/卵|オムレツ/.test(query)) return "egg";
    if (/ツナ/.test(query)) return "tuna";
    return "other";
}

function getCurrentMacroState() {
    const total = { P: 0, F: 0, C: 0 };
    if (typeof lst !== 'undefined') {
        lst.forEach(x => {
            total.P += x.P || 0;
            total.F += x.F || 0;
            total.C += x.C || 0;
        });
    }
    return {
        pRatio: TG && TG.p ? total.P / TG.p : 0,
        fRatio: TG && TG.f ? total.F / TG.f : 0,
        cRatio: TG && TG.c ? total.C / TG.c : 0
    };
}

function openMealGachaLink(query, type) {
    if (type === 'youtube') {
        window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(query + ' レシピ')}`, '_blank');
    } else {
        window.open(`https://delishkitchen.tv/search?q=${encodeURIComponent(query)}`, '_blank');
    }
}

function escapeForAttr(text) {
    return String(text).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function escapeHtml(text) {
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// ▼ ホームに戻って全て閉じる関数 (新規追加)
function goHome(tabEl) {
    document.querySelectorAll('.expand-area').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.tab-item').forEach(el => el.classList.remove('active'));
    if (tabEl) tabEl.classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ▼ 既存の関数を書き換え (タブの色切り替え同期)
function openTabPanel(id, tabEl) {
    document.querySelectorAll('.expand-area').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.tab-item').forEach(el => el.classList.remove('active'));
    if (tabEl) tabEl.classList.add('active');

    const panel = document.getElementById(id);
    panel.style.display = 'block';
    if (typeof rHist === 'function' && id === 'hist-area') rHist();
    if (typeof drawGraph === 'function' && id === 'graph-area') drawGraph('week', document.querySelector('.g-btn'));
    if (typeof drawBodyGraph === 'function' && id === 'body-content') {
        drawBodyGraph('A', document.querySelector('.b-tog-btn'));
        renderBodyList();
        if (typeof renderBodyGallery === 'function') renderBodyGallery();
    }
    setTimeout(() => panel.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
}

// ★モーダル開閉
function openSaveModal() {
    document.getElementById('reset-modal').style.display = 'flex';
    if (typeof TG !== 'undefined' && document.getElementById('auto-reset-chk')) {
        document.getElementById('auto-reset-chk').checked = TG.autoReset;
    }
}
function closeResetModal() {
    document.getElementById('reset-modal').style.display = 'none';
}

function openCameraChoiceModal() {
    document.getElementById('camera-choice-modal').style.display = 'flex';
}
function closeCameraChoiceModal() {
    document.getElementById('camera-choice-modal').style.display = 'none';
}
function selectCameraTake() {
    closeCameraChoiceModal();
    document.getElementById('camera-take-input').click();
}
function selectCameraLibrary() {
    closeCameraChoiceModal();
    document.getElementById('camera-library-input').click();
}
function handleCameraChoice(event) {
    if (typeof window.handleCameraUpload === 'function') {
        window.handleCameraUpload(event);
    }
}

// ▼ パッケージ成分表スキャナー制御 ▼
let scannerStream = null;

async function openScanner() {
    closeCameraChoiceModal();
    const modal = document.getElementById('scanner-modal');
    const video = document.getElementById('scanner-video');
    modal.style.display = 'flex';

    try {
        scannerStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment', width: { 理想: 1280 }, height: { 理想: 720 } }
        });
        video.srcObject = scannerStream;
    } catch (err) {
        console.error("Scanner Error:", err);
        alert("カメラの起動に失敗したたま...。権限を確認してたま！");
        closeScanner();
    }
}

function closeScanner() {
    if (scannerStream) {
        scannerStream.getTracks().forEach(track => track.stop());
        scannerStream = null;
    }
    const modal = document.getElementById('scanner-modal');
    modal.style.display = 'none';
    const video = document.getElementById('scanner-video');
    video.srcObject = null;
}

async function captureScannerImage() {
    const video = document.getElementById('scanner-video');
    const canvas = document.getElementById('scanner-canvas');
    const ctx = canvas.getContext('2d');

    // ビデオの実際の解像度を取得
    const videoWidth = video.videoWidth;
    const videoHeight = video.videoHeight;

    // 画面上のビデオ表示サイズと枠のサイズを取得
    const rect = video.getBoundingClientRect();
    const frame = document.querySelector('.scanner-frame').getBoundingClientRect();

    // 枠の位置・サイズをビデオ解像度に合わせてスケール変換
    const scaleX = videoWidth / rect.width;
    const scaleY = videoHeight / rect.height;

    const cropX = (frame.left - rect.left) * scaleX;
    const cropY = (frame.top - rect.top) * scaleY;
    const cropW = frame.width * scaleX;
    const cropH = frame.height * scaleY;

    // キャンバスサイズを設定（枠と同じアスペクト比で、ある程度の解像度を確保）
    canvas.width = 800;
    canvas.height = 800;

    // 切り取り描画
    ctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, canvas.width, canvas.height);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    const base64Data = dataUrl.split(',')[1];

    closeScanner();

    // AIに送信 (ai.jsの関数を流用)
    if (window.handleScannerImage) {
        window.handleScannerImage(base64Data);
    } else {
        // 万が一関数の準備ができていない場合のフォールバック
        console.warn("handleScannerImage not found, using generic upload");
        if (typeof window.processAIChat === 'function') {
            if (typeof toggleChat === 'function') toggleChat();
            addChatMsg('user', '📷 (スキャン画像を送信しました)');
            const loadingId = addChatMsg('bot', '🔍 成分表を解析中だたま...');
            const scannerPrompt = "これは食品パッケージの成分表のスキャン画像だたま。PFCとカロリーを正確に読み取って [DATA] 形式で出力してたま！";
            window.processAIChat(scannerPrompt, loadingId, false, base64Data);
        }
    }
}

// ▼ 体型写真記録モーダルの制御 ▼
let selectedBodyPhotoObjUrl = null;

function openBodyPhotoModal() {
    document.getElementById('body-photo-modal').style.display = 'flex';
    document.getElementById('body-photo-preview-area').style.display = 'none';
    document.getElementById('body-photo-actions-init').style.display = 'flex';
    document.getElementById('body-photo-actions-ready').style.display = 'none';
    document.getElementById('body-photo-loading').style.display = 'none';

    document.getElementById('body-photo-loading').style.display = 'none';
    document.getElementById('body-photo-result-area').style.display = 'none';
    document.getElementById('body-photo-result-img').src = '';

    // 入力欄をクリア (直近のデータを自動入力しても良いが、今回はシンプルにクリア)
    document.getElementById('bp-weight').value = '';
    document.getElementById('bp-fat').value = '';
    document.getElementById('bp-muscle').value = '';
    document.getElementById('bp-waist').value = '';

    if (selectedBodyPhotoObjUrl) {
        URL.revokeObjectURL(selectedBodyPhotoObjUrl);
        selectedBodyPhotoObjUrl = null;
    }
    document.getElementById('body-photo-take-input').value = '';
    document.getElementById('body-photo-lib-input').value = '';
}

function closeBodyPhotoModal() {
    document.getElementById('body-photo-modal').style.display = 'none';
    if (selectedBodyPhotoObjUrl) {
        URL.revokeObjectURL(selectedBodyPhotoObjUrl);
        selectedBodyPhotoObjUrl = null;
    }
}

function handleBodyPhotoSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (selectedBodyPhotoObjUrl) URL.revokeObjectURL(selectedBodyPhotoObjUrl);
    selectedBodyPhotoObjUrl = URL.createObjectURL(file);

    const imgEl = document.getElementById('body-photo-preview-img');
    imgEl.src = selectedBodyPhotoObjUrl;

    document.getElementById('body-photo-preview-area').style.display = 'flex';
    document.getElementById('body-photo-actions-init').style.display = 'none';
    document.getElementById('body-photo-actions-ready').style.display = 'flex';
}

async function generateAndShareBodyCard() {
    if (!selectedBodyPhotoObjUrl) return;

    document.getElementById('body-photo-actions-ready').style.display = 'none';
    document.getElementById('body-photo-loading').style.display = 'block';

    try {
        // 画像の読み込みを待つ
        const img = new Image();
        img.src = selectedBodyPhotoObjUrl;
        await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
        });

        const canvas = document.getElementById('body-photo-canvas');
        const ctx = canvas.getContext('2d');

        // カードのサイズ設定 (固定比率の縦長カード)
        const cardWidth = 800;

        // 画像のアスペクト比を計算し、カードの高さを決定
        const imgAspect = img.height / img.width;
        // 写真表示エリアの最大高さを制限しつつ、いい感じの比率に
        let drawHeight = cardWidth * imgAspect;
        if (drawHeight > 1000) drawHeight = 1000; // 高すぎないように制限

        // ヘッダー(100px) + 写真(drawHeight) + フッター(データエリア 200px)
        const cardHeight = 100 + drawHeight + 200;

        canvas.width = cardWidth;
        canvas.height = cardHeight;

        // --- 背景描画 (通常デザイン: 白背景) ---
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, cardWidth, cardHeight);

        // --- ヘッダー描画 ---
        const today = new Date();
        const dateStr = `${today.getFullYear()}年 ${today.getMonth() + 1}月 ${today.getDate()}日`;

        ctx.fillStyle = '#3498db'; // メインカラー
        ctx.font = 'bold 44px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(dateStr, 40, 70);

        ctx.fillStyle = '#7f8c8d'; // グレー
        ctx.font = 'bold 28px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText('体型・ボディメイク記録', cardWidth - 40, 70);

        // --- 写真描画 ---
        // 写真の描画範囲を計算 (中央揃え、アスペクト比維持でクロップ)
        let sWidth = img.width;
        let sHeight = img.height;
        let sx = 0;
        let sy = 0;

        if (imgAspect > (drawHeight / cardWidth)) {
            // 画像の方が縦長 -> 上下をクロップ
            sHeight = sWidth * (drawHeight / cardWidth);
            sy = (img.height - sHeight) / 2;
        } else {
            // 画像の方が横長 -> 左右をクロップ
            sWidth = sHeight * (cardWidth / drawHeight);
            sx = (img.width - sWidth) / 2;
        }

        ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 100, cardWidth, drawHeight);

        // 写真とフッターの境界線にメインカラーのライン
        ctx.fillStyle = '#3498db';
        ctx.fillRect(0, 100 + drawHeight, cardWidth, 4);

        // --- フッター(データエリア)描画 ---
        const footerY = 100 + drawHeight + 4;

        const wInput = document.getElementById('bp-weight').value;
        const fInput = document.getElementById('bp-fat').value;
        const mInput = document.getElementById('bp-muscle').value;
        const waInput = document.getElementById('bp-waist').value;

        ctx.textAlign = 'center';

        // グリッド状にデータを配置
        const drawDataPoint = (label, val, unit, x, y) => {
            ctx.fillStyle = '#7f8c8d';
            ctx.font = '22px sans-serif';
            ctx.fillText(label, x, y);

            if (val) {
                ctx.fillStyle = '#2c3e50'; // 濃いグレー
                ctx.font = 'bold 42px sans-serif';
                ctx.fillText(val, x - 15, y + 45); // 値

                ctx.fillStyle = '#3498db';
                ctx.font = 'bold 20px sans-serif';
                ctx.fillText(unit, x + (ctx.measureText(val).width / 2) + 10, y + 45); // 単位
            } else {
                ctx.fillStyle = '#bdc3c7';
                ctx.font = 'bold 42px sans-serif';
                ctx.fillText('--', x, y + 45);
            }
        };

        const qWidth = cardWidth / 4;
        const dataY = footerY + 60;

        drawDataPoint('体重', wInput, 'kg', qWidth * 0.5, dataY);
        drawDataPoint('体脂肪率', fInput, '%', qWidth * 1.5, dataY);
        drawDataPoint('筋肉量', mInput, 'kg', qWidth * 2.5, dataY);
        drawDataPoint('ウエスト', waInput, 'cm', qWidth * 3.5, dataY);

        // アプリロゴ的なウォーターマーク
        ctx.fillStyle = 'rgba(52, 152, 219, 0.2)';
        ctx.font = 'italic bold 24px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText('TamaFit - AI Diet & Fitness', cardWidth - 30, cardHeight - 30);

        // --- 画像化して表示 (IndexedDBに保存してプレビュー表示) ---
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85); // 圧縮して容量削減

        // IndexedDBへ保存
        await saveBodyPhotoToDb(dataUrl);

        document.getElementById('body-photo-preview-area').style.display = 'none';
        document.getElementById('body-photo-loading').style.display = 'none';

        const resultArea = document.getElementById('body-photo-result-area');
        document.getElementById('body-photo-result-img').src = dataUrl;
        resultArea.style.display = 'flex';

        if (typeof showToast === 'function') {
            showToast('アルバムに保存しました！');
        }

        // 履歴タブを開いている場合はリロードさせる処理を入れる (後で実装)
        if (typeof renderBodyGallery === 'function') {
            renderBodyGallery();
        }

    } catch (error) {
        console.error('Card generation error:', error);
        alert('カードの生成に失敗しました。');
        document.getElementById('body-photo-actions-ready').style.display = 'flex';
        document.getElementById('body-photo-loading').style.display = 'none';
    }
}

function openVoiceUI() {
    const el = document.getElementById('voice-ui-window');
    el.style.display = 'flex';
    setTimeout(() => {
        el.classList.add('active');
        // 開いた瞬間に自動でマイクON
        if (typeof window.toggleVoiceMic === 'function' && typeof isRecording !== 'undefined' && !isRecording) {
            window.toggleVoiceMic();
        }
    }, 10);
}

function closeVoiceUI() {
    const el = document.getElementById('voice-ui-window');
    el.classList.remove('active');
    // 閉じたらマイクも強制終了
    if (typeof forceStopMic === 'function') forceStopMic();
    setTimeout(() => el.style.display = 'none', 300);
}

// ボイス画面のEnterキー送信
document.addEventListener('DOMContentLoaded', () => {
    const vInput = document.getElementById('v-chat-input');
    if (vInput) {
        vInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
                if (typeof sendVoiceChat === 'function') sendVoiceChat();
            }
        });
    }
});

let currentFsPhotoId = null;

async function renderBodyGallery() {
    const grid = document.getElementById('body-album-grid');
    const emptyTxt = document.getElementById('body-album-empty');
    if (!grid || !emptyTxt) return;

    grid.innerHTML = '';

    try {
        const photos = await getAllBodyPhotos();
        if (photos.length === 0) {
            grid.style.display = 'none';
            emptyTxt.style.display = 'block';
            return;
        }

        grid.style.display = 'grid';
        emptyTxt.style.display = 'none';

        photos.forEach(photo => {
            const wrap = document.createElement('div');
            wrap.style.cssText = 'position:relative; width:100%; aspect-ratio:3/4; overflow:hidden; border-radius:8px; box-shadow:0 2px 6px rgba(0,0,0,0.1); cursor:pointer; background:#000;';
            wrap.onclick = () => openFullscreenPhoto(photo.id, photo.imageData);

            const img = document.createElement('img');
            img.src = photo.imageData;
            img.style.cssText = 'width:100%; height:100%; object-fit:cover; transition:transform 0.2s;';
            // ホバー効果 (モバイルではタップ時)
            wrap.onmousedown = () => img.style.transform = 'scale(0.95)';
            wrap.onmouseup = () => img.style.transform = 'scale(1)';
            wrap.onmouseleave = () => img.style.transform = 'scale(1)';

            const dateStr = new Date(photo.timestamp).toLocaleDateString();
            const badge = document.createElement('div');
            badge.textContent = dateStr;
            badge.style.cssText = 'position:absolute; bottom:5px; right:5px; background:rgba(0,0,0,0.6); color:#fff; font-size:10px; padding:2px 6px; border-radius:4px; pointer-events:none;';

            wrap.appendChild(img);
            wrap.appendChild(badge);
            grid.appendChild(wrap);
        });
    } catch (e) {
        console.error('ギャラリー読み込みエラー:', e);
    }
}

function openFullscreenPhoto(id, dataUrl) {
    currentFsPhotoId = id;
    document.getElementById('body-photo-fs-img').src = dataUrl;
    document.getElementById('body-photo-fs-modal').style.display = 'flex';
}

function closeFullscreenPhoto() {
    document.getElementById('body-photo-fs-modal').style.display = 'none';
    document.getElementById('body-photo-fs-img').src = '';
    currentFsPhotoId = null;
}

async function deleteCurrentFullscreenPhoto() {
    if (!currentFsPhotoId) return;
    if (!confirm('この写真を削除してもよろしいですか？\n(復元できません)')) return;

    try {
        await deleteBodyPhoto(currentFsPhotoId);
        closeFullscreenPhoto();
        renderBodyGallery();
        if (typeof showToast === 'function') showToast('写真を削除しました');
    } catch (e) {
        alert('削除に失敗しました: ' + e);
    }
}

if ('serviceWorker' in navigator) { window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js'); }); }
