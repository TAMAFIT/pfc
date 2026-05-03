// ai.js : AI通信・マイク制御・外部連携・チャットUI描画

const gasUrl = "https://script.google.com/macros/s/AKfycbxfD_oYqqac1rG0U1Po9cWiHGq1jslASe2GQhEmVtQj8RjDTeIvVtHyA8tpeKHQhzoN/exec";
let recognition;
let isRecording = false;
let activeMicTarget = null; // 'voice' or 'chat'
let speechFinalizeTimer = null;
let speechLatestText = "";
let speechFinalText = "";
let speechHadResult = false;
let speechResultCallback = null;
let voiceAutoSend = localStorage.getItem('tf_voice_auto_send') !== 'false';
let pendingDeleteAllToday = false;
let lastTamaChatSendText = "";
let lastTamaChatSendAt = 0;
let voiceSendInFlight = false;
window.clearPendingDeleteAllToday = function () { pendingDeleteAllToday = false; };

// ▼▼▼ トースト通知 ▼▼▼
function showToast(msg) {
    let toast = document.getElementById('tama-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'tama-toast';
        toast.style.cssText = 'position:fixed; top:20px; left:50%; transform:translateX(-50%); background:rgba(0,0,0,0.85); color:#fff; padding:12px 20px; border-radius:30px; font-size:13px; z-index:999999; text-align:center; box-shadow:0 4px 15px rgba(0,0,0,0.3); transition: opacity 0.3s ease; font-weight:bold; white-space:pre-wrap; width:max-content; max-width:90%; pointer-events:none;';
        document.body.appendChild(toast);
    }
    toast.innerText = msg;
    toast.style.opacity = '1';
    toast.style.display = 'block';
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.style.display = 'none', 300);
    }, 3000);
}

// ▼▼▼ 外部レシピ・検索サイト連携 ▼▼▼
window.openRecipe = function (keywords, type) {
    const q = encodeURIComponent(keywords); let url = "";
    if (type === 'delish') url = `https://delishkitchen.tv/search?q=${q}`;
    if (type === 'nadia') url = `https://oceans-nadia.com/search?q=${q}`;
    if (type === 'youtube') url = `https://www.youtube.com/results?search_query=${q}+レシピ`;
    window.open(url, "_blank");
};

window.openChatGPTAndCopy = function (foodName) {
    const text = `「${foodName}」の一般的なカロリーと、PFC（タンパク質・脂質・炭水化物）の数値を調べてください。\n\nまた、私が食事管理アプリにそのままコピペして記録できるよう、回答の最後に以下のフォーマットの〇〇に数値を埋めたテキストを、ワンタップでコピーできるように「マークダウンのコードブロック（\`\`\`）」で囲んで出力してください。\n\n\`\`\`\n${foodName}を食べたよ！カロリーは〇〇kcal、Pは〇〇g、Fは〇〇g、Cは〇〇gだって！\n\`\`\``;
    const textArea = document.createElement("textarea"); textArea.value = text; textArea.style.position = 'fixed'; textArea.style.top = '0'; textArea.style.left = '0'; textArea.style.opacity = '0'; document.body.appendChild(textArea); textArea.focus(); textArea.select(); try { document.execCommand('copy'); } catch (err) { } document.body.removeChild(textArea);
    if (navigator.clipboard) { navigator.clipboard.writeText(text).catch(() => { }); }
    showToast("🤖 質問文をコピーしたたま！\nそのまま貼り付けて聞いてね！"); setTimeout(() => { window.open("https://chatgpt.com/", "_blank"); }, 300);
};

// ▼▼▼ マイク制御（トグル挙動・状態リセット） ▼▼▼
const forceStopMic = (preserveSpeech = false) => {
    if (speechFinalizeTimer) {
        clearTimeout(speechFinalizeTimer);
        speechFinalizeTimer = null;
    }
    if (!preserveSpeech) {
        speechLatestText = "";
        speechFinalText = "";
        speechHadResult = false;
        speechResultCallback = null;
    }
    if (isRecording) {
        isRecording = false;
        const vMicBtn = document.getElementById('v-main-mic');
        const vStatusText = document.getElementById('v-status-text');
        const vInputEl = document.getElementById('v-chat-input');
        const cMicBtn = document.getElementById('mic-btn');
        const cInputEl = document.getElementById('chat-input');

        if (vMicBtn) vMicBtn.classList.remove('listening');
        if (vStatusText) vStatusText.innerText = preserveSpeech ? "送信待ち" : "マイクOFF";
        if (vInputEl) vInputEl.placeholder = "文字でも記録できます";

        if (cMicBtn) cMicBtn.classList.remove('recording');
        if (cInputEl) cInputEl.placeholder = "メッセージを入力...";

        try { if (recognition) recognition.abort(); } catch (e) { }
    }
};

function syncVoiceAutoSendUI() {
    const toggle = document.getElementById('v-auto-send-toggle');
    const text = document.querySelector('.v-auto-text');
    const state = document.querySelector('.v-auto-state');
    if (toggle) toggle.checked = voiceAutoSend;
    if (text) text.innerText = "自動送信";
    if (state) state.innerText = voiceAutoSend ? "ON" : "OFF";
}

window.toggleVoiceAutoSend = function () {
    const toggle = document.getElementById('v-auto-send-toggle');
    voiceAutoSend = toggle ? toggle.checked : voiceAutoSend;
    localStorage.setItem('tf_voice_auto_send', String(voiceAutoSend));
    syncVoiceAutoSendUI();
};

document.addEventListener('DOMContentLoaded', syncVoiceAutoSendUI);

document.addEventListener('visibilitychange', () => { if (document.hidden) forceStopMic(); });
window.addEventListener('pagehide', () => forceStopMic());
window.addEventListener('blur', () => forceStopMic());

function mergeVoiceInput(existingText, newText) {
    const existing = (existingText || "").trim();
    const incoming = (newText || "").trim();
    if (!existing) return incoming;
    if (!incoming) return existing;
    if (existing.includes(incoming)) return existing;
    if (incoming.includes(existing)) return incoming;
    return `${existing} ${incoming}`;
}

function toggleMic() {
    activeMicTarget = 'chat';
    const micBtn = document.getElementById('mic-btn'); const inputEl = document.getElementById('chat-input');
    if (isRecording) { forceStopMic(); return; }
    startRecognition(
        () => { micBtn.classList.add('recording'); inputEl.placeholder = "聞いてるたま！喋って！"; inputEl.value = ''; },
        (text) => { inputEl.value = text; sendTamaChat(); }
    );
}

window.toggleVoiceMic = function () {
    activeMicTarget = 'voice';
    const vMicBtn = document.getElementById('v-main-mic');
    const vStatusText = document.getElementById('v-status-text');
    const vInputEl = document.getElementById('v-chat-input');
    if (isRecording) { forceStopMic(); return; }
    syncVoiceAutoSendUI();
    startRecognition(
        () => {
            vMicBtn.classList.add('listening');
            vStatusText.innerText = "マイクON";
            if (voiceAutoSend) vInputEl.value = '';
        },
        (text) => { vInputEl.value = text; sendVoiceChat(); }
    );
};

function startRecognition(onStartCallback, onResultCallback) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) { showToast("お使いのブラウザは音声入力非対応だたま！"); return; }

    recognition = new SpeechRecognition(); recognition.lang = 'ja-JP'; recognition.continuous = false; recognition.interimResults = false;
    speechLatestText = "";
    speechFinalText = "";
    speechHadResult = false;
    speechResultCallback = onResultCallback;

    recognition.onstart = () => { isRecording = true; onStartCallback(); };
    recognition.onresult = (event) => {
        if (!isRecording) return;
        const result = event.results && event.results[0] && event.results[0][0];
        const txt = normalizeSpeechTranscript(result ? result.transcript : "");
        if (!txt) return;
        speechLatestText = txt;
        speechHadResult = true;
        if (activeMicTarget === 'voice') {
            const vInputEl = document.getElementById('v-chat-input');
            if (vInputEl) {
                const nextText = voiceAutoSend ? txt : mergeVoiceInput(vInputEl.value, txt);
                vInputEl.value = nextText;
                speechLatestText = nextText;
            }
        } else if (activeMicTarget === 'chat') {
            const cInputEl = document.getElementById('chat-input');
            if (cInputEl) cInputEl.value = txt;
        }
        if (activeMicTarget === 'voice' && !voiceAutoSend) {
            const vStatusText = document.getElementById('v-status-text');
            if (vStatusText) vStatusText.innerText = "送信待ち";
            forceStopMic(true);
            return;
        }
        forceStopMic();
        onResultCallback(txt);
    };
    recognition.onerror = (event) => {
        forceStopMic();
        if (event.error === 'not-allowed') showToast("マイクの許可がないみたいだたま！\niPhoneのホーム画面からだと使えないことがあるからSafariで開いてたま！");
    };
    recognition.onend = () => {
        if (!isRecording) return;
        forceStopMic();
    };
    recognition.start();
}

function finalizeSpeechNow() {
    const txt = (document.getElementById('v-chat-input')?.value || speechLatestText || "").trim();
    const cb = speechResultCallback;
    forceStopMic();
    if (txt && cb) cb(txt);
    else if (txt && typeof sendVoiceChat === 'function') sendVoiceChat();
}

// ▼▼▼ チャット表示制御 ▼▼▼
function escapeHTML(str) {
    if (!str) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function toggleChat() {
    const win = document.getElementById('tama-chat-window');
    const btn = document.getElementById('tama-chat-btn');
    if (!win || !btn) return;

    if (win.style.display === 'flex') {
        win.style.display = 'none';
        btn.style.display = 'flex';
        if (typeof forceStopMic === 'function') forceStopMic();
    } else {
        win.style.display = 'flex';
        btn.style.display = 'none';
        const box = document.getElementById('chat-messages');
        if (box) box.scrollTop = box.scrollHeight;
    }
}

function setupChatEnterKey() {
    const input = document.getElementById('chat-input');
    if (!input) return;
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) sendTamaChat();
    });
}

function addChatMsg(role, text, isHTML = false) {
    const id = 'msg-' + Date.now();
    const createMsgNode = (isVoiceBox = false) => {
        const div = document.createElement('div'); div.className = `msg ${role}`;
        const iconDiv = document.createElement('div'); iconDiv.className = 'icon';
        if (role === 'bot' && isVoiceBox) {
            iconDiv.innerHTML = '<div style="background:#dee2e6; color:#495057; border-radius:50%; width:100%; height:100%; display:flex; align-items:center; justify-content:center; font-size:22px;">🤖</div>';
        } else {
            iconDiv.innerHTML = '<img src="new_tama.png">';
        }
        const textDiv = document.createElement('div'); textDiv.className = 'text';
        if (isHTML) textDiv.innerHTML = text; else textDiv.innerHTML = escapeHTML(text).replace(/\n/g, '<br>');
        if (role === 'bot') { div.appendChild(iconDiv); div.appendChild(textDiv); } else { div.appendChild(textDiv); div.appendChild(iconDiv); }
        return div;
    };

    const box1 = document.getElementById('chat-messages');
    if (box1) {
        const node1 = createMsgNode(false);
        node1.id = id;
        box1.appendChild(node1);
        box1.scrollTop = box1.scrollHeight;
    }

    const box2 = document.getElementById('v-chat-messages');
    if (box2) {
        const node2 = createMsgNode(true);
        node2.id = id + '-v';
        box2.appendChild(node2);
        box2.scrollTop = box2.scrollHeight;
    }
    return id;
}

function removeMsg(id) {
    const el1 = document.getElementById(id); if (el1) el1.remove();
    const el2 = document.getElementById(id + '-v'); if (el2) el2.remove();
}

// ▼▼▼ メッセージ送信処理 ▼▼▼

async function sendTamaChat() {
    const inputEl = document.getElementById('chat-input'); const text = inputEl.value.trim(); if (!text) return;
    if (isRecording && activeMicTarget === 'chat') forceStopMic();
    const now = Date.now();
    if (text === lastTamaChatSendText && now - lastTamaChatSendAt < 2500) { inputEl.value = ''; return; }
    lastTamaChatSendText = text;
    lastTamaChatSendAt = now;
    addChatMsg('user', text); inputEl.value = ''; inputEl.disabled = true; const loadingId = addChatMsg('bot', 'たまちゃん考え中...');
    await processAIChat(text, loadingId, false);
    inputEl.disabled = false;
}

window.sendVoiceChat = async function () {
    const inputEl = document.getElementById('v-chat-input'); const text = inputEl.value.trim(); if (!text) return;
    if (voiceSendInFlight) return;
    voiceSendInFlight = true;
    const vStatusText = document.getElementById('v-status-text');
    inputEl.value = ''; inputEl.disabled = true;
    vStatusText.innerText = `⏳ データ処理中...`;

    addChatMsg('user', text); const loadingId = addChatMsg('bot', 'データ処理中...');

    try {
        await processAIChat(text, loadingId, true);
    } finally {
        vStatusText.innerText = "マイクOFF";
        inputEl.disabled = false;
        voiceSendInFlight = false;
    }
}

// ▼▼▼ 共通ヘルパー関数 ▼▼▼

// [DATA]・[REPLACE]共通のPFCパース処理
function parsePFCFromRaw(dRaw) {
    let parts = dRaw.split(/,|、/).map(p => p.trim());
    let firstNumIdx = parts.findIndex((part, idx) => idx > 0 && /^[-+]?\d+(?:\.\d+)?/.test(part));
    let numParts = [];

    if (firstNumIdx >= 0) {
        const nameParts = parts.slice(0, firstNumIdx);
        for (const part of parts.slice(firstNumIdx)) {
            const match = part.match(/[-+]?\d+(?:\.\d+)?/);
            if (match) numParts.push(parseFloat(match[0]));
            if (numParts.length >= 5) break;
        }
        parts = nameParts;
    } else {
        while (parts.length > 0) {
            let lastPart = parts[parts.length - 1];
            let val = parseFloat(lastPart.replace(/[^\d.]/g, ""));
            let nonDigits = lastPart.replace(/[\d.\s]/g, "").toLowerCase();
            let isFoodName = nonDigits.length > 0 && !/^(g|mg|ml|kcal|倍|個|人前)$/.test(nonDigits);
            if (!isNaN(val) && /[0-9]/.test(lastPart) && !isFoodName) { numParts.unshift(val); parts.pop(); } else { break; }
        }
    }

    if (numParts.length < 3) return null;
    let name = parts.join(",").replace(/^["']|["']$/g, "").trim() || "不明な食事";
    let pBase = numParts[0] || 0, fBase = numParts[1] || 0, cBase = numParts[2] || 0;
    let aBase = numParts.length >= 4 ? numParts[3] : 0;
    let mul = numParts.length >= 5 ? numParts[4] : (numParts.length === 4 && numParts[3] < 10 ? numParts[3] : 1);
    if (numParts.length === 4 && numParts[3] <= 5 && !dRaw.includes('A')) { mul = numParts[3]; aBase = 0; }
    const alcoholNameHint = /(ワイン|ビール|チューハイ|酎ハイ|サワー|ハイボール|焼酎|日本酒|ウイスキー|梅酒|酒|カクテル)/.test(name);
    if (alcoholNameHint && mul > 1 && aBase >= 20) {
        aBase = aBase / mul;
    }
    let p = pBase * mul, f = fBase * mul, c = cBase * mul, a = aBase * mul;
    let cal = Math.round(p * 4 + f * 9 + c * 4 + a * 7);
    return { N: name, P: p, F: f, C: c, A: a, Cal: cal };
}

function normalizeFoodText(str) {
    return toHira(String(str || ""))
        .replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0))
        .replace(/ｇ/g, "g")
        .toLowerCase();
}

function findDbFoodForAIName(foodName, rawText = "") {
    if (typeof DB === 'undefined') return null;
    const target = normalizeFoodText(`${foodName} ${rawText}`).replace(/[()（）0-9.gｇグラムぐらむ\s]/g, "");

    if (/(白米|ごはん|ご飯|米|こめ|ライス)/.test(target)) return DB.find(x => x[1] === "白米");
    if (/(鶏むね|鶏胸|鳥胸|胸肉|むね肉|とりむね|チキン)/.test(target)) return DB.find(x => x[1] === "鶏むね(皮なし)");

    return DB.find(x => {
        const name = normalizeFoodText(x[1]).replace(/[()（）0-9.g\s]/g, "");
        const keys = String(x[2] || "").split(" ").map(k => normalizeFoodText(k)).filter(Boolean);
        return target.includes(name) || keys.some(k => k.length >= 2 && target.includes(k));
    }) || null;
}

function getDbFoodPattern(dbItem) {
    const name = dbItem ? dbItem[1] : "";
    if (name === "白米") return /(白米|ごはん|ご飯|米|こめ|ライス)/;
    if (name.includes("鶏むね")) return /(鶏むね|鶏胸|鳥胸|胸肉|むね肉|とりむね|チキン)/;
    const keys = [name, ...(String(dbItem?.[2] || "").split(" "))].map(k => normalizeFoodText(k)).filter(k => k.length >= 2);
    return new RegExp(keys.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"));
}

function extractExplicitGramForDbFood(userText, dbItem) {
    if (!dbItem || !String(dbItem[3]).includes("g")) return null;
    const text = normalizeFoodText(userText).replace(/グラム|ぐらむ/g, "g");
    const pattern = getDbFoodPattern(dbItem);
    const clauses = text.split(/(?:と|、|,|。|\n)/).map(x => x.trim()).filter(Boolean);

    for (const clause of clauses) {
        const gramMatch = clause.match(/([0-9]+(?:\.[0-9]+)?)\s*g/);
        if (gramMatch && pattern.test(clause)) return parseFloat(gramMatch[1]);
    }

    const foodMatch = text.match(pattern);
    if (foodMatch) {
        const after = text.slice(foodMatch.index, foodMatch.index + 24);
        const gramAfter = after.match(/([0-9]+(?:\.[0-9]+)?)\s*g/);
        if (gramAfter) return parseFloat(gramAfter[1]);
    }

    return null;
}

function getDbAlcoholBase(dbItem) {
    if (!dbItem) return 0;
    if (Number.isFinite(Number(dbItem[8]))) return Number(dbItem[8]);
    const unitPfcCal = (Number(dbItem[4] || 0) * 4) + (Number(dbItem[5] || 0) * 9) + (Number(dbItem[6] || 0) * 4);
    const alcoholHint = `${dbItem[0]} ${dbItem[1]} ${dbItem[2]}`;
    const isAlcohol = /(酒|お酒|ビール|ワイン|サワー|ハイボール|焼酎|日本酒|梅酒|ウイスキー|カクテル|ジン|カシス|ストロング|ウーロンハイ|緑茶ハイ)/.test(alcoholHint);
    return isAlcohol && Number(dbItem[7] || 0) > unitPfcCal + 10
        ? Math.max(0, (Number(dbItem[7] || 0) - unitPfcCal) / 7)
        : 0;
}

function applyExplicitUserGramAmount(food, userText, rawDataText = "") {
    const dbItem = findDbFoodForAIName(food.N, rawDataText);
    const grams = extractExplicitGramForDbFood(userText, dbItem);
    if (!dbItem || !grams || grams <= 0) return food;

    const baseGram = parseFloat(String(dbItem[3]).replace(/[^\d.]/g, "")) || 100;
    const mul = grams / baseGram;
    const p = dbItem[4] * mul;
    const f = dbItem[5] * mul;
    const c = dbItem[6] * mul;
    const aBase = getDbAlcoholBase(dbItem);
    const a = aBase * mul;
    const cal = Math.round((p * 4) + (f * 9) + (c * 4) + (a * 7));

    return {
        ...food,
        N: `${dbItem[1]}(${grams}g)`,
        P: p,
        F: f,
        C: c,
        A: a,
        Cal: cal
    };
}

function getDbUnitMl(dbItem) {
    const unit = String(dbItem?.[3] || "");
    const name = String(dbItem?.[1] || "");
    const n = parseFloat(unit.replace(/[^\d.]/g, ""));
    if (/ml/i.test(unit)) return Number.isFinite(n) ? n : 100;
    if (/350/.test(name)) return 350;
    if (/500/.test(name)) return 500;
    if (/中/.test(name)) return 500;
    if (/合/.test(unit)) return 180;
    if (/缶/.test(unit)) return 350;
    if (/本/.test(unit)) return 500;
    if (/杯/.test(unit)) return 100;
    return null;
}

function extractExplicitServingMultiplier(userText, rawDataText, dbItem) {
    const text = normalizeFoodText(`${userText} ${rawDataText}`).replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0));
    const unit = String(dbItem?.[3] || "");
    const baseMl = getDbUnitMl(dbItem);

    const literMatch = text.match(/([0-9]+(?:\.[0-9]+)?)\s*(?:l|L|リットル|りっとる)/);
    if (literMatch && baseMl) return (parseFloat(literMatch[1]) * 1000) / baseMl;

    const mlMatch = text.match(/([0-9]+(?:\.[0-9]+)?)\s*(?:ml|ｍｌ|ミリ|みり)/i);
    if (mlMatch && baseMl) return parseFloat(mlMatch[1]) / baseMl;

    const unitMatch = text.match(/([0-9]+(?:\.[0-9]+)?)\s*(杯|缶|本|個|パック|p)/i);
    if (unitMatch) {
        const amount = parseFloat(unitMatch[1]);
        const spokenUnit = unitMatch[2].toLowerCase();
        if ((spokenUnit === "杯" && unit.includes("杯")) ||
            (spokenUnit === "缶" && unit.includes("缶")) ||
            (spokenUnit === "本" && unit.includes("本")) ||
            (spokenUnit === "個" && unit.includes("個")) ||
            ((spokenUnit === "p" || spokenUnit === "パック") && /p|P|パック/.test(unit))) {
            const baseAmount = parseFloat(unit.replace(/[^\d.]/g, "")) || 1;
            return amount / baseAmount;
        }
    }

    return null;
}

function applyDbKnownAmount(food, userText, rawDataText = "") {
    const dbItem = findDbFoodForAIName(food.N, rawDataText);
    if (!dbItem) return food;

    const grams = extractExplicitGramForDbFood(userText, dbItem);
    let multiplier = null;
    let displayAmount = dbItem[3];

    if (grams && grams > 0) {
        const baseGram = parseFloat(String(dbItem[3]).replace(/[^\d.]/g, "")) || 100;
        multiplier = grams / baseGram;
        displayAmount = `${grams}g`;
    } else {
        multiplier = extractExplicitServingMultiplier(userText, rawDataText, dbItem);
        const amountText = normalizeFoodText(`${userText} ${rawDataText}`).match(/([0-9]+(?:\.[0-9]+)?)\s*(l|L|リットル|りっとる|ml|ｍｌ|ミリ|みり|杯|缶|本|個|パック|p)/i);
        if (amountText) displayAmount = `${amountText[1]}${amountText[2]}`;
    }

    if (!multiplier || multiplier <= 0) return food;

    const p = Number(dbItem[4] || 0) * multiplier;
    const f = Number(dbItem[5] || 0) * multiplier;
    const c = Number(dbItem[6] || 0) * multiplier;
    const a = getDbAlcoholBase(dbItem) * multiplier;
    const cal = Math.round((p * 4) + (f * 9) + (c * 4) + (a * 7));

    return {
        ...food,
        N: `${dbItem[1]}(${displayAmount})`,
        P: p,
        F: f,
        C: c,
        A: a,
        Cal: cal
    };
}

// [UNKNOWN]時の検索ボタンHTML生成
function buildSearchButtons(foodName) {
    return `<br><br><div style="display:flex; gap:10px; width:100%; margin-top:8px;"><div onclick="openChatGPTAndCopy('${foodName}')" style="cursor:pointer; flex:1; background-color:#10A37F; color:#FFFFFF; padding:12px 0; border-radius:10px; font-weight:600; font-size:13px; text-align:center; box-shadow:0 2px 5px rgba(0,0,0,0.15); display:flex; flex-direction:column; align-items:center; justify-content:center; line-height:1.4;"><div style="display:flex; align-items:center; gap:6px;"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M22.28 10.51a6.6 6.6 0 0 0-1.63-7.1 6.62 6.62 0 0 0-7.04-1.6 6.59 6.59 0 0 0-8.91 3.52 6.61 6.61 0 0 0-1.57 7.15 6.6 6.6 0 0 0 1.63 7.09 6.61 6.61 0 0 0 7.03 1.6 6.59 6.59 0 0 0 8.92-3.53 6.62 6.62 0 0 0 1.57-7.13zm-8.87 9.87a4.57 4.57 0 0 1-3.23-1.32l.24-.14 4.54-2.62a1.05 1.05 0 0 0 .52-.91v-5.26l1.79 1.03a4.59 4.59 0 0 1 1.7 5.91 4.58 4.58 0 0 1-5.56 3.31zm-7.66-2.5a4.59 4.59 0 0 1-1.3-3.28l.2.16 4.55 2.63a1.04 1.04 0 0 0 1.05 0l4.55-2.63-.9-1.55-4.54 2.62a2.66 2.66 0 0 1-2.66 0L4.1 11.66a4.58 4.58 0 0 1 1.65-5.38zm7.5-12.78a4.58 4.58 0 0 1 3.23 1.33l-.24.14-4.54 2.62a1.04 1.04 0 0 0-.52.9v5.27l-1.8-1.04A4.59 4.59 0 0 1 8.2 8.52a4.58 4.58 0 0 1 5.06-3.41zm1.25 5.86-1.8-1.04v-3.1a4.58 4.58 0 0 1 6.85-2.1L16.2 6.5v.01l-4.54 2.62a2.66 2.66 0 0 1-2.67 0l-2.6-1.5 2.6-4.5a4.59 4.59 0 0 1 5.51-1.6zm4.6 7.42a4.59 4.59 0 0 1 1.3 3.28l-.2-.16-4.55-2.63a1.04 1.04 0 0 0-1.05 0l-4.54 2.63.9 1.55 4.54-2.62a2.66 2.66 0 0 1 2.66 0l2.58 1.5A4.58 4.58 0 0 1 19.1 18.4zM12 14.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z"/></svg><span>ChatGPT</span></div><span style="font-size:9.5px; font-weight:400; margin-top:3px; opacity:0.9;">(質問を自動コピー)</span></div><a href="https://www.google.com/search?q=${encodeURIComponent(foodName + ' カロリー PFC')}" target="_blank" style="flex:1; background-color:#FFFFFF; color:#3C4043; border:1px solid #DADCE0; padding:12px 0; border-radius:10px; font-weight:600; font-size:13px; text-decoration:none; text-align:center; box-shadow:0 2px 5px rgba(0,0,0,0.05); display:flex; flex-direction:column; align-items:center; justify-content:center; line-height:1.4;"><div style="display:flex; align-items:center; gap:6px;"><svg width="16" height="16" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg><span>Google</span></div><span style="font-size:9.5px; font-weight:400; margin-top:3px; color:#5F6368;">(自分で調べる)</span></a></div>`;
}

function hasMutationIntent(text) {
    return /(記録|登録|追加|食べた|食べました|飲んだ|飲みました|消して|削除|取り消|修正|訂正|変更|間違え|間違い|やっぱり|だった|じゃなくて)/.test(text);
}

const LAST_AI_ADDED_IDS_KEY = 'tf_last_ai_added_ids';
const AI_REQUEST_TIMEOUT_MS = 45000;

function getLastAIAddedIds() {
    try {
        const ids = JSON.parse(localStorage.getItem(LAST_AI_ADDED_IDS_KEY) || "[]");
        return Array.isArray(ids) ? ids.map(Number).filter(Boolean) : [];
    } catch (e) {
        return [];
    }
}

function setLastAIAddedIds(ids) {
    localStorage.setItem(LAST_AI_ADDED_IDS_KEY, JSON.stringify((ids || []).map(Number).filter(Boolean)));
}

function escapeRegExp(str) {
    return String(str || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeSpeechTranscript(text) {
    let out = String(text || "")
        .replace(/[、。]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    const foodWords = [
        "鶏胸肉", "鶏むね肉", "鶏むね", "鳥胸肉", "胸肉", "鶏肉",
        "白米", "ご飯", "ごはん", "米", "ライス",
        "納豆", "味噌汁", "みそ汁", "ブロッコリー"
    ];
    foodWords.sort((a, b) => b.length - a.length).forEach(word => {
        const amountUnit = "(g|ｇ|グラム|ぐらむ|杯|パック|P|p|個)?";
        const amountRepeat = new RegExp(`(${escapeRegExp(word)}\\s*([0-9]+(?:\\.[0-9]+)?)\\s*${amountUnit})\\s*${escapeRegExp(word)}\\s*\\2\\s*\\3`, "g");
        let prev = "";
        while (prev !== out) {
            prev = out;
            out = out.replace(amountRepeat, "$1");
        }
        const repeated = new RegExp(`(?:${escapeRegExp(word)}\\s*){2,}`, "g");
        out = out.replace(repeated, `${word} `);
    });
    return out.replace(/\s+/g, " ").trim();
}

function parseBaseUnitAmount(unitText) {
    const unit = String(unitText || "");
    const n = parseFloat(unit.replace(/[^\d.]/g, "")) || 1;
    if (/g|ｇ|グラム|ぐらむ/i.test(unit)) return { amount: n, unit: "g" };
    if (/杯/.test(unit)) return { amount: n, unit: "杯" };
    if (/p|P|パック/.test(unit)) return { amount: n, unit: "パック" };
    return { amount: n, unit: "個" };
}

function getLocalVoiceFoodRules() {
    return [
        { dbName: "鶏むね(皮なし)", aliases: ["鶏むね肉", "鶏むね", "鶏胸肉", "鶏胸", "とりむね", "鳥胸肉", "胸肉", "鶏肉", "鳥肉", "とり肉", "チキン"] },
        { dbName: "白米", aliases: ["白米", "ごはん", "ご飯", "ライス", "米"] },
        { dbName: "納豆", aliases: ["納豆", "なっとう"] },
        { dbName: "味噌汁(豆腐わかめ)", aliases: ["味噌汁", "みそ汁", "みそしる"] },
        { dbName: "ブロッコリー", aliases: ["ブロッコリー", "ぶろっこりー"] }
    ];
}

function parseLocalVoiceMealFoods(text) {
    if (typeof DB === 'undefined') return [];
    const source = normalizeSpeechTranscript(String(text || "").replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0)));
    const foods = [];

    getLocalVoiceFoodRules().forEach(rule => {
        const db = DB.find(x => x[1] === rule.dbName);
        if (!db) return;
        const aliases = rule.aliases.slice().sort((a, b) => b.length - a.length);
        const aliasPattern = aliases.map(escapeRegExp).join("|");
        const match = source.match(new RegExp(`(${aliasPattern})\\s*([0-9]+(?:\\.[0-9]+)?)?\\s*(g|ｇ|グラム|ぐらむ|杯|パック|P|p|個)?`, "i"));
        if (!match) return;

        const base = parseBaseUnitAmount(db[3]);
        const rawNum = match[2] ? parseFloat(match[2]) : null;
        const rawUnit = match[3] || base.unit;
        let multiplier = 1;
        let displayAmount = db[3];

        if (rawNum !== null) {
            if (/g|ｇ|グラム|ぐらむ/i.test(rawUnit) && base.unit === "g") {
                multiplier = rawNum / base.amount;
                displayAmount = `${rawNum}g`;
            } else {
                multiplier = rawNum / base.amount;
                displayAmount = `${rawNum}${base.unit}`;
            }
        }

        const p = db[4] * multiplier;
        const f = db[5] * multiplier;
        const c = db[6] * multiplier;
        const cal = Math.round(db[7] * multiplier);
        foods.push({
            N: `${db[1]}(${displayAmount})`,
            P: p,
            F: f,
            C: c,
            A: 0,
            Cal: cal,
            time: typeof getAutoTime === 'function' ? getAutoTime() : "昼"
        });
    });

    return foods;
}

function tryHandleLocalVoiceMealLog(text, loadingId) {
    const foods = parseLocalVoiceMealFoods(text);
    if (foods.length === 0) return false;
    const newlyAddedIds = [];
    foods.forEach((food, idx) => {
        const newId = Date.now() + idx + Math.floor(Math.random() * 1000);
        lst.push({ id: newId, N: "🤖 " + food.N, P: food.P, F: food.F, C: food.C, A: food.A, Cal: food.Cal, U: "AI", time: food.time });
        newlyAddedIds.push(newId);
    });
    localStorage.setItem('tf_dat', JSON.stringify(lst));
    if (typeof ren === 'function') ren();
    if (typeof upd === 'function') upd();
    setLastAIAddedIds(newlyAddedIds);
    removeMsg(loadingId);
    const names = foods.map(f => f.N).join("、");
    const reply = `${names}を登録しました。※分量が違う場合は教えてください。`;
    addChatMsg('bot', reply, true);
    chatHistory.push({ role: 'model', text: reply });
    if (chatHistory.length > 6) chatHistory.shift();
    return true;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = AI_REQUEST_TIMEOUT_MS) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } finally {
        clearTimeout(timeoutId);
    }
}

function isRecentBatchDeleteIntent(text) {
    return /(今の全部|いまの全部|さっきの全部|直前の全部|今登録した.*全部|今入れた.*全部|今のやつ.*全部|さっきのやつ.*全部|今の.*消して|さっきの.*消して|直前の.*消して)/.test(text);
}

function isAllTodayDeleteIntent(text) {
    return /(今日|本日).*(全部|すべて|全て).*(消して|削除|取り消)|^(全部|すべて|全て).*(消して|削除)$/.test(text);
}

function normalizeDeleteText(str) {
    return toHira(String(str || ""))
        .replace(/^🤖\s*/, "")
        .replace(/[()\[\]（）【】\s]/g, "")
        .toLowerCase();
}

function getStructuredDeleteIds(text) {
    const ids = [];
    const normalized = normalizeDeleteText(text);
    const mealMatch = text.match(/(朝|昼|晩|間食|朝食|昼食|夕食|夜|夜食).*(全部|すべて|全て|消して|削除|取り消)/);
    if (mealMatch) {
        let meal = mealMatch[1].replace("食", "");
        if (meal === "夜" || meal === "夜食") meal = "晩";
        lst.forEach(item => { if (item.time === meal) ids.push(Number(item.id)); });
    }

    if (/AI|ａｉ|人工知能|自動/.test(text) && /(全部|すべて|全て|消して|削除|取り消)/.test(text)) {
        lst.forEach(item => {
            if (String(item.N || "").includes("🤖") || String(item.U || "") === "AI") ids.push(Number(item.id));
        });
    }

    if (/(全部|すべて|全て).*(消して|削除|取り消)|消して|削除|取り消/.test(text)) {
        lst.forEach(item => {
            const name = normalizeDeleteText(item.N);
            const simpleName = name.replace(/[0-9０-９.]+g?|グラム|ぐらむ|個|玉|杯/g, "");
            if (simpleName.length >= 2 && normalized.includes(simpleName)) ids.push(Number(item.id));
        });
    }

    return [...new Set(ids)].filter(Boolean);
}

function getLatestLogClusterIds() {
    if (!Array.isArray(lst) || lst.length === 0) return [];
    const items = lst
        .filter(x => Number.isFinite(Number(x.id)))
        .slice()
        .sort((a, b) => Number(b.id) - Number(a.id));
    if (items.length === 0) return [];

    const newestId = Number(items[0].id);
    return items
        .filter(x => newestId - Number(x.id) <= 5000)
        .map(x => Number(x.id));
}

function tryHandleRecentBatchDelete(text, loadingId) {
    if (!isRecentBatchDeleteIntent(text)) return false;

    let targetIds = getLastAIAddedIds().filter(id => lst.some(item => Number(item.id) === Number(id)));
    if (targetIds.length === 0) targetIds = getLatestLogClusterIds();
    if (targetIds.length === 0) return false;

    const deletedCount = typeof deleteLogIds === 'function'
        ? deleteLogIds(targetIds, "recent-ai", true)
        : 0;
    if (deletedCount <= 0) return false;

    setLastAIAddedIds([]);
    removeMsg(loadingId);
    const reply = `${deletedCount}件の記録を削除しました。`;
    addChatMsg('bot', reply, true);
    chatHistory.push({ role: 'model', text: reply });
    if (chatHistory.length > 6) chatHistory.shift();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return true;
}

function tryHandleStructuredDelete(text, loadingId) {
    if (isAllTodayDeleteIntent(text)) {
        removeMsg(loadingId);
        pendingDeleteAllToday = true;
        if (typeof requestDeleteAllTodayConfirm === 'function') {
            requestDeleteAllTodayConfirm();
            addChatMsg('bot', "今日の記録をすべて削除する確認を表示しました。", true);
        } else {
            addChatMsg('bot', "今日の記録をすべて削除する場合は、画面から確認してください。", true);
        }
        return true;
    }

    const ids = getStructuredDeleteIds(text);
    if (ids.length === 0) return false;
    const deletedCount = typeof deleteLogIds === 'function'
        ? deleteLogIds(ids, "voice-rule", true)
        : 0;
    if (deletedCount <= 0) return false;

    removeMsg(loadingId);
    const reply = `${deletedCount}件の記録を削除しました。`;
    addChatMsg('bot', reply, true);
    chatHistory.push({ role: 'model', text: reply });
    if (chatHistory.length > 6) chatHistory.shift();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return true;
}

function tryHandlePendingDeleteAllAnswer(text, loadingId) {
    if (!pendingDeleteAllToday) return false;
    if (/^(はい|うん|お願いします|削除|消して|実行|ok|OK|オーケー)/.test(text.trim())) {
        pendingDeleteAllToday = false;
        removeMsg(loadingId);
        if (typeof confirmDeleteAllToday === 'function') confirmDeleteAllToday();
        addChatMsg('bot', "今日の記録を削除しました。", true);
        return true;
    }
    if (/^(いいえ|いや|キャンセル|やめ|やめて|中止|戻る)/.test(text.trim())) {
        pendingDeleteAllToday = false;
        removeMsg(loadingId);
        if (typeof closeDeleteAllConfirm === 'function') closeDeleteAllConfirm();
        addChatMsg('bot', "削除をキャンセルしました。", true);
        return true;
    }
    return false;
}

function hasRecipeIntent(text) {
    return /(何食べ|なに食べ|何を食べ|おすすめ|オススメ|提案|レシピ|作り方|メニュー|献立|食べよう|食べれば|食べたらいい)/.test(text);
}

function looksLikeLeakedReasoning(text) {
    if (!text) return false;
    return /\b(User input|Context|System state|Current meal record list|Rule for|Report text|Command|Japanese response|Check rules|Result)\b/i.test(text)
        || /思考|推論|判断メモ|プロンプト|システムログ|内部/.test(text)
        || /^\s*[*-]\s+/.test(text)
        || text.length > 900;
}

function sanitizeAIVisibleReply(text, commandWasReturned) {
    let cleaned = String(text || "")
        .replace(/\[SYSTEM\].*/gi, "")
        .replace(/\[DATA\].*/gi, "")
        .replace(/\[REPLACE\].*/gi, "")
        .replace(/\[DELETE\].*/gi, "")
        .replace(/【現在モード】\s*\[[^\]]*モード\]/g, "")
        .replace(/^\s*\[[^\]]*モード\]\s*$/gm, "")
        .replace(/\[(?:通常チャット|音声スピード記録)モード\]/g, "")
        .replace(/システムコマンド.*/gi, "")
        .trim();

    if (looksLikeLeakedReasoning(cleaned)) {
        return commandWasReturned ? "" : "うまく処理できませんでした。もう一度短く言ってください。";
    }
    return cleaned;
}

function getDbCandidatesForAI(text, limit = 18) {
    if (typeof DB === 'undefined') return [];
    const source = normalizeFoodText(text);
    const sourceCompact = source.replace(/[()（）0-9.gｇグラムぐらむ\s]/g, "");
    const genericKeys = new Set(["肉", "魚", "酒", "米", "水", "油", "鶏", "鳥", "牛", "豚", "卵", "飯", "お酒"]);
    const candidates = [];
    const seen = new Set();

    const addByName = (name, score = 100) => {
        const item = DB.find(x => x[1] === name);
        if (item && !seen.has(item[1])) {
            seen.add(item[1]);
            candidates.push({ item, score });
        }
    };

    if (/(白米|ごはん|ご飯|米|こめ|ライス)/.test(source)) addByName("白米", 200);
    if (/(鶏むね|鶏胸|鳥胸|胸肉|むね肉|とりむね)/.test(source)) addByName("鶏むね(皮なし)", 200);
    if (/(皮あり|かわあり)/.test(source) && /(鶏むね|鶏胸|胸肉|チキン)/.test(source)) addByName("鶏むね(皮あり)", 220);
    if (/(たい焼き|たいやき)/.test(source)) addByName("たい焼き", 200);
    if (/(チューハイ|酎ハイ|サワー)/.test(source)) addByName("缶チューハイ", 190);
    if (/(ワイン)/.test(source)) addByName("ワイン(赤/白)", 190);
    if (/(ラムネ|ラムネソーダ)/.test(source)) addByName("ラムネ", 180);
    if (/(ハラミ|はらみ)/.test(source)) addByName("牛ハラミ", 170);
    if (/(ステーキ)/.test(source)) addByName("牛ヒレ(赤身)", 160);
    if (/(かしわ|カシワ)/.test(source)) addByName("鶏もも(皮あり)", 160);

    DB.forEach(item => {
        if (seen.has(item[1])) return;
        const name = normalizeFoodText(item[1]).replace(/[()（）0-9.g\s]/g, "");
        const keys = [name, ...String(item[2] || "").split(/\s+/).map(k => normalizeFoodText(k))]
            .map(k => k.replace(/[()（）0-9.gｇグラムぐらむ\s]/g, ""))
            .filter(k => k.length >= 2 && !genericKeys.has(k));
        let bestScore = 0;
        keys.forEach(key => {
            if (!key) return;
            if (sourceCompact.includes(key)) bestScore = Math.max(bestScore, 120 + key.length);
            else if (key.length >= 4 && sourceCompact.includes(key.slice(0, 4))) bestScore = Math.max(bestScore, 60 + key.length);
        });
        if (bestScore > 0) {
            seen.add(item[1]);
            candidates.push({ item, score: bestScore });
        }
    });

    return candidates
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(x => x.item);
}

function buildDbCheatSheetForAI(text) {
    const candidates = getDbCandidatesForAI(text);
    if (candidates.length === 0) {
        return "\n【カンペ(アプリ内DB)】\n該当候補なし。一般的な食品・料理名は一般栄養知識で1食分を推定し、市販品・チェーン店など公式値が必要なものだけ[UNKNOWN]を出してください。\n";
    }
    const lines = candidates.map(item => {
        const unit = item[3] || "1人前";
        const p = Number(item[4] || 0);
        const f = Number(item[5] || 0);
        const c = Number(item[6] || 0);
        const cal = Number(item[7] || 0);
        const a = getDbAlcoholBase(item);
        return `- ${item[1]}(${unit}あたり): P${p}g, F${f}g, C${c}g, A${a.toFixed(1)}g, ${cal}kcal`;
    });
    return `\n【カンペ(アプリ内DB)】\nユーザー発言に近い食品候補です。入力された食品と意味的に同じ単品食品・飲料を指す場合だけ、このDB数値を優先してください。表記ゆれ、音声認識の揺れ、かな/漢字違い、一般的な別名は同一食品として扱ってよいです。ただし、入力が料理名・定食・弁当・セット・盛り合わせなどの場合、候補がその一部だけに一致していても料理全体の代わりに使ってはいけません。その場合は通常チャットで成分表を答える時と同じ基準で、一般的な外食/家庭料理の1食分として推定してください。DBの単品候補に引っ張られて脂質・炭水化物・カロリーを低く見積もってはいけません。料理全体を推定する場合、P,F,C,Aは実際の合計値、倍率は1にしてください。DBを使う場合はP,F,C,Aを基準量あたりの値のまま出し、最後の倍率だけ食べた量に合わせてください。\n${lines.join("\n")}\n`;
}

// ▼▼▼ AI通信コア処理 ▼▼▼
async function processAIChat(text, loadingId, isVoiceMode = false, imageBase64 = null) {
    const currentCal = lst.reduce((a, b) => a + b.Cal, 0); const currentP = lst.reduce((a, b) => a + b.P, 0); const currentF = lst.reduce((a, b) => a + b.F, 0); const currentC = lst.reduce((a, b) => a + b.C, 0);
    const d = new Date(); const timeStr = `${d.getHours()}時${d.getMinutes()}分`; const alcStr = TG.alcMode ? "ON" : "OFF";
    const currentMealTime = typeof getAutoTime === 'function' ? getAutoTime() : "昼";

    if (!imageBase64 && tryHandlePendingDeleteAllAnswer(text, loadingId)) {
        return "処理しました。";
    }
    if (!imageBase64 && tryHandleRecentBatchDelete(text, loadingId)) {
        return "削除しました。";
    }
    if (!imageBase64 && tryHandleStructuredDelete(text, loadingId)) {
        return "削除しました。";
    }

    let cheatStateContext = "";
    if (typeof isCheatDay !== 'undefined' && isCheatDay) {
        let hypeStr = "「最高のご褒美だたま！筋肉も喜んでるたま！」「今日は気にせず美味しく食べるたま！」など、全肯定し全力で甘やかす発言をしてください！！";
        if (typeof isHighCarbMode !== 'undefined' && isHighCarbMode) {
            hypeStr = "「超絶ハイカーボモード発動だたま！最高の糖質補給で筋肉パンパンだたま！」「炭水化物は裏切らない！ガンガンいくたま！」など、炭水化物を摂ることを徹底的に全肯定し、テンションMAXで褒めちぎってください！！";
        }
        cheatStateContext = `\n【現在チートデイモード発動中！】\nユーザーは現在チートデイを楽しんでいます。カロリー制限などの警告は一切せず、${hypeStr}`;
    }

    const modeStr = isVoiceMode ? "\n【現在モード】[音声スピード記録モード]" : "\n【現在モード】[通常チャットモード]";

    const context = `【目標】Cal:${TG.cal} P:${TG.p.toFixed(0)} F:${TG.f.toFixed(0)} C:${TG.c.toFixed(0)}\n【現在摂取】Cal:${currentCal} P:${currentP.toFixed(0)} F:${currentF.toFixed(0)} C:${currentC.toFixed(0)}\n【現在時刻】${timeStr}\n【推奨時間帯】${currentMealTime}\n【酒飲みモード】${alcStr}${cheatStateContext}${modeStr}\n【現在の今日の食事記録リスト(ID付き)】\n${lst.length > 0 ? lst.map(x => `[ID: ${x.id}] ${x.time} | ${x.N} (${x.Cal}kcal)`).join('\n') : 'まだ記録なし'}`;

    let historyText = chatHistory.map(m => `${m.role === 'user' ? 'あなた' : 'たまちゃん'}: ${m.text}`).join('\n');
    let userPrefText = "";
    let cheatSheetText = buildDbCheatSheetForAI(text);

    let basePrompt, voiceRule;

    if (isVoiceMode) {
        // 音声モード: たまちゃんのペルソナを完全に排除した専用プロンプトを使用
        basePrompt = typeof VOICE_SYSTEM_PROMPT !== 'undefined' ? VOICE_SYSTEM_PROMPT : (typeof VOICE_SYSTEM_PROMPT_AI_ONLY !== 'undefined' ? VOICE_SYSTEM_PROMPT_AI_ONLY : 'あなたは食事記録専用の無機質なアシスタントです。');
        voiceRule = '';
        // 音声モード時は直近2件のみ残す（訂正・修正に必要な文脈を保持）
        // ただし「たまちゃん」の口調が含まれる履歴は除外する
        const recentHistory = chatHistory.slice(-2);
        historyText = recentHistory.map(m => `${m.role === 'user' ? 'ユーザー' : 'システム'}: ${m.text}`).join('\n');
    } else {
        basePrompt = typeof SYSTEM_PROMPT !== 'undefined' ? SYSTEM_PROMPT : 'あなたは「たまちゃん」です。';
        voiceRule = '・「たまちゃん」としての純粋なセリフと、必要なシステムコマンドのみを出力してください。\n⚠️【重要】「記録して」「追加して」と言われない限り、絶対に[DATA]タグを出力しないでください！';
    }

    const prompt = `${basePrompt}\n=== 現在の状況 ===\n${context}\n=== 会話履歴 ===\n${historyText}\n${cheatSheetText}\n${userPrefText}\n=== ユーザーの発言 ===\n${text}\n\n【絶対ルール】\n・システムログ、AIとしての思考プロセス、プロンプトの解説は一切出力しないでください。\n${voiceRule}`;

    chatHistory.push({ role: 'user', text: text });
    if (chatHistory.length > 6) chatHistory.shift();

    try {
        const payload = { contents: [{ parts: [{ text: prompt }] }], taskType: imageBase64 ? "image" : (isVoiceMode ? "voice" : "chat") };
        if (imageBase64) {
            payload.imageBase64 = imageBase64;
        }
        const response = await fetchWithTimeout(gasUrl, { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify(payload) });
        if (!response.ok) throw new Error(`GAS HTTP ${response.status}`);
        const data = await response.json();
        let rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!rawText) throw new Error("Empty AI response");
        rawText = rawText.replace(/\*\*/g, "").replace(/^たまちゃん:\s*/i, "").replace(/たまちゃんの返答:/g, "").replace(/たまちゃん:\s*/i, "");

        let botReply = rawText;
        let addedFoods = [];
        let replacedFoods = [];
        let deleteIds = [];
        let unknownFoods = [];
        let recipeKeywords = null;

        // [RECIPE]の抽出
        const recMatch = botReply.match(/\[RECIPE\]\s*(.+)/);
        if (recMatch) { recipeKeywords = recMatch[1].trim(); botReply = botReply.replace(recMatch[0], ""); }
        if (recipeKeywords && !hasRecipeIntent(text)) recipeKeywords = null;

        // [UNKNOWN]の複数抽出
        const unkMatches = [...botReply.matchAll(/\[UNKNOWN\]\s*(.+)/g)];
        unkMatches.forEach(m => { unknownFoods.push(m[1].trim()); botReply = botReply.replace(m[0], ""); });

        // [DELETE]の複数抽出
        const delMatches = [...botReply.matchAll(/\[DELETE\]\s*(\d+)/g)];
        delMatches.forEach(m => { deleteIds.push(parseInt(m[1], 10)); botReply = botReply.replace(m[0], ""); });

        // ★[DATA]の複数抽出（共通パーサー使用）
        const dataMatches = [...botReply.matchAll(/\[DATA\]\s*([^|]+)\|(.+)/g)];
        dataMatches.forEach(m => {
            const parsed = parsePFCFromRaw(m[2]);
            if (parsed) {
                const normalized = applyDbKnownAmount(parsed, text, m[2]);
                addedFoods.push({ ...normalized, time: isVoiceMode ? currentMealTime : m[1].trim() });
            }
            botReply = botReply.replace(m[0], "");
        });

        // ★[REPLACE]の複数抽出（共通パーサー使用）
        const repMatches = [...botReply.matchAll(/\[REPLACE\]\s*(\d+)\s*\|\s*([^|]+)\|(.+)/g)];
        repMatches.forEach(m => {
            const parsed = parsePFCFromRaw(m[3]);
            if (parsed) {
                const normalized = applyDbKnownAmount(parsed, text, m[3]);
                replacedFoods.push({ targetId: parseInt(m[1], 10), data: { ...normalized, time: m[2].trim() } });
            }
            botReply = botReply.replace(m[0], "");
        });

        const commandWasReturned = addedFoods.length > 0 || replacedFoods.length > 0 || deleteIds.length > 0;
        const allowMutation = isVoiceMode || hasMutationIntent(text);
        if (commandWasReturned && !allowMutation) {
            addedFoods = [];
            replacedFoods = [];
            deleteIds = [];
            botReply = botReply.trim();
            if (!/記録|登録|追加|削除|修正|変更|消/.test(botReply)) {
                botReply += "\n\n※質問として受け取ったので、記録はしていないたま！";
            } else {
                botReply = "質問として受け取ったので、記録はしていないたま！";
            }
        }

        botReply = sanitizeAIVisibleReply(botReply, commandWasReturned);

        // ★改善箇所：空吹き出しの防止
        if (!botReply) {
            if (deleteIds.length > 0) botReply = "削除したたま！";
            else if (replacedFoods.length > 0) botReply = "修正したたま！";
            else if (addedFoods.length > 0) botReply = "ばっちり記録したたま！";
            else botReply = "処理したたま！";
        }

        removeMsg(loadingId); const newMsgId = addChatMsg('bot', botReply, true);

        if (recipeKeywords) {
            const btnHtml = `<br><br><div style="display:flex; flex-direction:column; gap:6px; width:100%; margin-top:8px;">
                <div onclick="openRecipe('${recipeKeywords}', 'delish')" style="cursor:pointer; background-color:#FFB600; color:#FFFFFF; padding:8px; border-radius:8px; font-weight:bold; font-size:12px; text-align:center; box-shadow:0 2px 4px rgba(0,0,0,0.1);">🍳 デリッシュキッチン で見る</div>
                <div onclick="openRecipe('${recipeKeywords}', 'nadia')" style="cursor:pointer; background-color:#65C1A6; color:#FFFFFF; padding:8px; border-radius:8px; font-weight:bold; font-size:12px; text-align:center; box-shadow:0 2px 4px rgba(0,0,0,0.1);">👨‍🍳 Nadia(プロのレシピ) で見る</div>
                <div onclick="openRecipe('${recipeKeywords}', 'youtube')" style="cursor:pointer; background-color:#FF0000; color:#FFFFFF; padding:8px; border-radius:8px; font-weight:bold; font-size:12px; text-align:center; box-shadow:0 2px 4px rgba(0,0,0,0.1);">▶️ YouTube で調理法を見る</div>
            </div>`;
            const msgEl = document.getElementById(newMsgId)?.querySelector('.text');
            if (msgEl) msgEl.innerHTML += btnHtml;
            const vMsgEl = document.getElementById(newMsgId + '-v')?.querySelector('.text');
            if (vMsgEl) vMsgEl.innerHTML += btnHtml;
        }

        if (unknownFoods.length > 0) {
            const btnHtml = buildSearchButtons(unknownFoods[0]);
            const msgEl = document.getElementById(newMsgId)?.querySelector('.text');
            if (msgEl) msgEl.innerHTML += btnHtml;
            const vMsgEl = document.getElementById(newMsgId + '-v')?.querySelector('.text');
            if (vMsgEl) vMsgEl.innerHTML += btnHtml;
        }

        // ★改善箇所：リストへの反映処理（複数対応）
        let stateChanged = false;

        // ★チートデイで記録しない設定の場合は取得リストを空にする
        if (typeof isCheatDay !== 'undefined' && isCheatDay && typeof recordOnCheatDay !== 'undefined' && !recordOnCheatDay) {
            addedFoods = [];
            replacedFoods = [];
            deleteIds = [];
        }

        if (deleteIds.length > 0 && typeof deleteLogIds === 'function') {
            const deletedCount = deleteLogIds(deleteIds, "ai", true);
            if (deletedCount > 0) stateChanged = true;
        }

        // ★重複防止：同じ食品名の[DATA]が複数ある場合は最初の1つだけ残す
        if (addedFoods.length > 1) {
            const seen = new Set();
            addedFoods = addedFoods.filter(food => {
                const key = food.N.trim();
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });
        }

        const newlyAddedIds = [];
        addedFoods.forEach(food => {
            const newId = Date.now() + Math.floor(Math.random() * 1000);
            lst.push({ id: newId, N: "🤖 " + food.N, P: food.P, F: food.F, C: food.C, A: food.A, Cal: food.Cal, U: "AI", time: food.time });
            newlyAddedIds.push(newId);
            stateChanged = true;
        });

        replacedFoods.forEach(rep => {
            const foundIdx = lst.findIndex(item => item.id === rep.targetId);
            const newItem = { id: rep.targetId || Date.now(), N: "🤖 " + rep.data.N, P: rep.data.P, F: rep.data.F, C: rep.data.C, A: rep.data.A, Cal: rep.data.Cal, U: "AI", time: rep.data.time };
            if (foundIdx !== -1) { lst[foundIdx] = newItem; } else { lst.push({ ...newItem, id: Date.now() }); }
            stateChanged = true;
        });

        if (stateChanged) {
            localStorage.setItem('tf_dat', JSON.stringify(lst)); ren(); upd(); window.scrollTo({ top: 0, behavior: 'smooth' });
        }
        if (newlyAddedIds.length > 0) setLastAIAddedIds(newlyAddedIds);

        // ★改善箇所：記憶喪失対策として、「生テキスト(コマンド込み)」をAI側に渡す会話履歴として記憶
        chatHistory.push({ role: 'model', text: rawText });
        if (chatHistory.length > 6) chatHistory.shift();
        return botReply;

    } catch (error) {
        removeMsg(loadingId);
        const errMsg = error && error.name === 'AbortError'
            ? '処理に時間がかかりすぎました。短めに分けてもう一度送ってください。'
            : '通信エラーだたま...。もう一度送ってたま！';
        addChatMsg('bot', errMsg, false);
        return errMsg;
    }
}

// ▼▼▼ カメラ画像アップロード・圧縮処理 ▼▼▼
window.handleCameraUpload = function (event) {
    const file = event.target.files[0];
    if (!file) return;

    // input要素の値をリセットして、同じ画像を連続で選択できるようにする
    event.target.value = '';

    const reader = new FileReader();
    reader.onload = function (e) {
        const img = new Image();
        img.onload = function () {
            const canvas = document.createElement('canvas');
            const MAX_SIZE = 800; // 最大800pxに圧縮
            let width = img.width;
            let height = img.height;

            if (width > height) {
                if (width > MAX_SIZE) {
                    height *= MAX_SIZE / width;
                    width = MAX_SIZE;
                }
            } else {
                if (height > MAX_SIZE) {
                    width *= MAX_SIZE / height;
                    height = MAX_SIZE;
                }
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            // JPEG形式で圧縮（品質0.8）
            const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
            // プレフィックス(data:image/jpeg;base64,)を除外して純粋なBase64文字列を取得
            const base64Data = dataUrl.split(',')[1];

            // チャットウィンドウが開いていなければ開く
            if (typeof toggleChat === 'function') {
                const chatWin = document.getElementById('tama-chat-window');
                if (chatWin && chatWin.style.display !== 'flex') {
                    toggleChat();
                }
            }

            const promptText = "送信された画像が明らかに食べ物や栄養成分表示に関係ない場合（例：ゲームの画面、風景など）は、無理に食べ物として判定せず、「これは食べ物ではありません」や「食べ物だと認識できませんでした」とだけ返答し、絶対に [DATA] フォーマットを出力しないでください。食べ物や栄養成分表示の画像の場合は、画像からカロリーとPFCを読み取るか推測して、いつもの [DATA] フォーマットで出力して。もし「栄養成分表示（裏面のラベル）」の画像なら、商品名を無理に推測せず「成分スキャン」という食品名にして、数値をそのまま正確に使ってください！余計な雑談やコメントは一切不要です！";
            addChatMsg('user', '📷 (画像を送信しました)');
            const loadingId = addChatMsg('bot', '📷 画像を解析中だたま...');

            // AIに画像データと一緒にリクエストを送信
            processAIChat(promptText, loadingId, false, base64Data).catch(err => {
                removeMsg(loadingId);
                addChatMsg('bot', '画像処理に失敗したたま...。', false);
            });
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
};

// ▼ スキャナー画像専用処理 ▼
window.handleScannerImage = function (base64Data) {
    // チャットウィンドウを開く
    if (typeof toggleChat === 'function') {
        const chatWin = document.getElementById('tama-chat-window');
        if (chatWin && chatWin.style.display !== 'flex') {
            toggleChat();
        }
    }

    const scannerPrompt = `
これは食品パッケージの「栄養成分表示（ラベル）」のクローズアップ画像だたま。
画像内の数値を正確にOCR（文字認識）して、以下のルールで出力してたま！

1. 食品名は必ず「🤖 成分スキャン」にしてたま。
2. 脂質(F)、タンパク質(P)、炭水化物(C)、エネルギー(kcal)を読み取ってたま。
3. 読み取った数値を [DATA] 朝 | 食品名 | P, F, C, Cal の形式で出力してたま。
4. 画像が不鮮明で読み取れない場合は「読み取れなかったたま...」とだけ返してたま。
5. 余計な挨拶や解説は一切不要だたま。

スキャン開始！
`;

    addChatMsg('user', '🔍 (成分表をスキャンしました)');
    const loadingId = addChatMsg('bot', '🔍 成分表を解析中だたま...');

    processAIChat(scannerPrompt.trim(), loadingId, false, base64Data).catch(err => {
        removeMsg(loadingId);
        addChatMsg('bot', 'スキャン処理に失敗したたま...。', false);
    });
};
