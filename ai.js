// ai.js : AI通信・マイク制御・外部連携・チャットUI描画

const gasUrl = "https://script.google.com/macros/s/AKfycbxfD_oYqqac1rG0U1Po9cWiHGq1jslASe2GQhEmVtQj8RjDTeIvVtHyA8tpeKHQhzoN/exec";
let recognition;
let isRecording = false;
let activeMicTarget = null; // 'voice' or 'chat'

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
const forceStopMic = () => {
    if (isRecording) {
        isRecording = false;
        const vMicBtn = document.getElementById('v-main-mic');
        const vStatusText = document.getElementById('v-status-text');
        const vInputEl = document.getElementById('v-chat-input');
        const cMicBtn = document.getElementById('mic-btn');
        const cInputEl = document.getElementById('chat-input');

        if (vMicBtn) vMicBtn.classList.remove('listening');
        if (vStatusText) vStatusText.innerText = "マイクを押して話すたま！";
        if (vInputEl) vInputEl.placeholder = "文字で補足入力もできるたま！";

        if (cMicBtn) cMicBtn.classList.remove('recording');
        if (cInputEl) cInputEl.placeholder = "メッセージを入力...";

        try { if (recognition) recognition.abort(); } catch (e) { }
    }
};

document.addEventListener('visibilitychange', () => { if (document.hidden) forceStopMic(); });
window.addEventListener('pagehide', forceStopMic); window.addEventListener('blur', forceStopMic);

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
    const vMicBtn = document.getElementById('v-main-mic'); const vStatusText = document.getElementById('v-status-text'); const vInputEl = document.getElementById('v-chat-input');
    if (isRecording) { forceStopMic(); return; }
    startRecognition(
        () => { vMicBtn.classList.add('listening'); vStatusText.innerText = "たまちゃんが聞いてるたま！"; vInputEl.value = ''; },
        (text) => { vInputEl.value = text; sendVoiceChat(); }
    );
};

function startRecognition(onStartCallback, onResultCallback) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) { showToast("お使いのブラウザは音声入力非対応だたま！"); return; }

    recognition = new SpeechRecognition(); recognition.lang = 'ja-JP'; recognition.continuous = false; recognition.interimResults = false;

    recognition.onstart = () => { isRecording = true; onStartCallback(); };
    recognition.onresult = (event) => { if (!isRecording) return; const txt = event.results[0][0].transcript; forceStopMic(); onResultCallback(txt); };
    recognition.onerror = (event) => {
        forceStopMic();
        if (event.error === 'not-allowed') showToast("マイクの許可がないみたいだたま！\niPhoneのホーム画面からだと使えないことがあるからSafariで開いてたま！");
    };
    recognition.onend = () => { if (isRecording) { forceStopMic(); } };
    recognition.start();
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
    addChatMsg('user', text); inputEl.value = ''; inputEl.disabled = true; const loadingId = addChatMsg('bot', 'たまちゃん考え中...');
    await processAIChat(text, loadingId, false);
    inputEl.disabled = false;
}

window.sendVoiceChat = async function () {
    const inputEl = document.getElementById('v-chat-input'); const text = inputEl.value.trim(); if (!text) return;
    const vStatusText = document.getElementById('v-status-text');
    inputEl.value = ''; inputEl.disabled = true;
    vStatusText.innerText = `🤔 考え中だたま...`;

    addChatMsg('user', text); const loadingId = addChatMsg('bot', 'たまちゃん考え中...');

    await processAIChat(text, loadingId, true);

    vStatusText.innerText = "マイクを押して続けて話せるたま！";
    inputEl.disabled = false;
}

// ▼▼▼ AI通信コア処理 ▼▼▼
async function processAIChat(text, loadingId, isVoiceMode = false, imageBase64 = null) {
    const currentCal = lst.reduce((a, b) => a + b.Cal, 0); const currentP = lst.reduce((a, b) => a + b.P, 0); const currentF = lst.reduce((a, b) => a + b.F, 0); const currentC = lst.reduce((a, b) => a + b.C, 0);
    const d = new Date(); const timeStr = `${d.getHours()}時${d.getMinutes()}分`; const alcStr = TG.alcMode ? "ON" : "OFF";

    let cheatStateContext = "";
    if (typeof isCheatDay !== 'undefined' && isCheatDay) {
        let hypeStr = "「最高のご褒美だたま！筋肉も喜んでるたま！」「今日は気にせず美味しく食べるたま！」など、全肯定し全力で甘やかす発言をしてください！！";
        if (typeof isHighCarbMode !== 'undefined' && isHighCarbMode) {
            hypeStr = "「超絶ハイカーボモード発動だたま！最高の糖質補給で筋肉パンパンだたま！」「炭水化物は裏切らない！ガンガンいくたま！」など、炭水化物を摂ることを徹底的に全肯定し、テンションMAXで褒めちぎってください！！";
        }
        cheatStateContext = `\n【現在チートデイモード発動中！】\nユーザーは現在チートデイを楽しんでいます。カロリー制限などの警告は一切せず、${hypeStr}`;
    }

    const modeStr = isVoiceMode ? "\n【現在モード】[音声スピード記録モード]" : "\n【現在モード】[通常チャットモード]";

    const context = `【目標】Cal:${TG.cal} P:${TG.p.toFixed(0)} F:${TG.f.toFixed(0)} C:${TG.c.toFixed(0)}\n【現在摂取】Cal:${currentCal} P:${currentP.toFixed(0)} F:${currentF.toFixed(0)} C:${currentC.toFixed(0)}\n【現在時刻】${timeStr}\n【酒飲みモード】${alcStr}${cheatStateContext}${modeStr}\n【現在の今日の食事記録リスト(ID付き)】\n${lst.length > 0 ? lst.map(x => `[ID: ${x.id}] ${x.time} | ${x.N} (${x.Cal}kcal)`).join('\n') : 'まだ記録なし'}`;

    let historyText = chatHistory.map(m => `${m.role === 'user' ? 'あなた' : 'たまちゃん'}: ${m.text}`).join('\n'); let userPrefText = "";
    if (myFoods && myFoods.length > 0) { userPrefText += `\n【ユーザーのMy食品】\n${myFoods.map(x => `- ${x.N} (P${x.P} F${x.F} C${x.C} ${x.Cal}kcal)`).join('\n')}\n`; }
    if (fav && fav.length > 0 && typeof DB !== 'undefined') { let favNames = fav.map(id => DB[id] ? DB[id][1] : "").filter(n => n); if (favNames.length > 0) { userPrefText += `【ユーザーのお気に入り】\n${favNames.join(', ')}\n`; } }

    let cheatSheetText = "";
    if (typeof DB !== 'undefined') {
        let matchedFoods = []; const normalizedText = toHira(text).toLowerCase();
        DB.forEach(x => {
            const nameHira = toHira(x[1]).toLowerCase(); const keys = x[2] ? x[2].split(' ') : []; let isMatch = false;
            if (normalizedText.includes(nameHira)) isMatch = true; else { for (let k of keys) { if (!k) continue; let kHira = toHira(k).toLowerCase(); if (normalizedText.includes(kHira)) { isMatch = true; break; } } }
            if (isMatch) matchedFoods.push(`- ${x[1]}(${x[3]}あたり): P ${x[4]}g, F ${x[5]}g, C ${x[6]}g, カロリー ${x[7]}kcal`);
        });
        if (matchedFoods.length > 0) cheatSheetText = `\n【カンペ(公式データ)】\n${matchedFoods.slice(0, 5).join('\n')}\n`;
    }

    let basePrompt = typeof SYSTEM_PROMPT !== 'undefined' ? SYSTEM_PROMPT : 'あなたは「たまちゃん」です。';
    let voiceRule = '・「たまちゃん」としての純粋なセリフと、必要なシステムコマンド（[DATA]など）のみを簡潔に出力してください。';

    if (isVoiceMode) {
        basePrompt = 'あなたは無機質で端的な報告用AIアシスタントです。感情を持たず、事実とシステムコマンドのみを極めて短く回答してください。「たまちゃん」としての振る舞いや、語尾に「だたま」などを付与することは絶対に避けてください。';
        voiceRule = '・感情的なセリフは一切不要です。無機質に「〇〇を登録しました。」等のごく短い事実の報告文と、必要なシステムコマンド（[DATA]など）のみを出力してください。\n・「うどん」など、ユーザーから分量の指定がなく1人前などの分量を推定して登録した場合は、報告文の最後に必ず「※分量が想定と違う場合は教えてください。」と添えてください。';
    }

    const prompt = `${basePrompt}\n=== 現在の状況 ===\n${context}\n=== 会話履歴 ===\n${historyText}\n${cheatSheetText}\n${userPrefText}\n=== ユーザーの発言 ===\n${text}\n\n【絶対ルール】\n・システムログ、AIとしての思考プロセス、プロンプトの解説は一切出力しないでください。\n${voiceRule}`;

    chatHistory.push({ role: 'user', text: text });
    if (chatHistory.length > 6) chatHistory.shift();

    try {
        const payload = { contents: [{ parts: [{ text: prompt }] }] };
        if (imageBase64) {
            payload.imageBase64 = imageBase64;
        }
        const response = await fetch(gasUrl, { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify(payload) });
        const data = await response.json(); let rawText = data.candidates[0].content.parts[0].text;
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

        // [UNKNOWN]の複数抽出
        const unkMatches = [...botReply.matchAll(/\[UNKNOWN\]\s*(.+)/g)];
        unkMatches.forEach(m => { unknownFoods.push(m[1].trim()); botReply = botReply.replace(m[0], ""); });

        // [DELETE]の複数抽出
        const delMatches = [...botReply.matchAll(/\[DELETE\]\s*(\d+)/g)];
        delMatches.forEach(m => { deleteIds.push(parseInt(m[1], 10)); botReply = botReply.replace(m[0], ""); });

        // ★改善箇所：[DATA]の複数抽出＆JS側での掛け算処理 (料理名にカンマが含まれても安全に分割)
        // フォーマット: [DATA] 時間帯 | 食品名, 基準P, 基準F, 基準C, 基準A, 倍率
        const dataMatches = [...botReply.matchAll(/\[DATA\]\s*([^|]+)\|(.+)/g)];
        dataMatches.forEach(m => {
            let tZone = m[1].trim();
            let dRaw = m[2];
            // 後方からカンマで分割して数値を取得する (最低4つ＝P,F,C,カロリーの順、または倍率など）
            let parts = dRaw.split(/,|、/).map(p => p.trim());
            // 数値部分（後ろから最大5個）を探す
            let numParts = [];
            while (parts.length > 0) {
                let lastPart = parts[parts.length - 1];
                let val = parseFloat(lastPart.replace(/[^\d.]/g, ""));
                // 空文字でもNaNでもない有効な数値とみなせるか（10gなどの単位付きも考慮）
                if (!isNaN(val) && /[0-9]/.test(lastPart)) {
                    numParts.unshift(val);
                    parts.pop();
                } else {
                    break;
                }
            }

            // numPartsに少なくとも3つ（P,F,C）が含まれていればOK
            if (numParts.length >= 3) {
                // 名前部分は残ったpartsを全て結合して復元
                let name = parts.join(",").replace(/^["']|["']$/g, "").trim();
                if (!name) name = "不明な食事";

                // P, F, C, [A], [倍率]
                let pBase = numParts[0] || 0;
                let fBase = numParts[1] || 0;
                let cBase = numParts[2] || 0;
                let aBase = numParts.length >= 4 ? numParts[3] : 0;
                let mul = numParts.length >= 5 ? numParts[4] : (numParts.length === 4 && numParts[3] < 10 ? numParts[3] : 1);
                // Aがないパターンの倍率考慮を簡易に (Aが10以上ならgと推測、小さければ倍率と推測等もできるが、基本は5つ揃うか、A=0とするか)
                if (numParts.length === 4) {
                    // もし4つ目で、値が10未満なら倍率（mul）として扱い、A=0とする（AIの出力ブレを吸収）
                    if (numParts[3] <= 5 && !dRaw.includes('A')) {
                        mul = numParts[3];
                        aBase = 0;
                    }
                }

                let p = pBase * mul; let f = fBase * mul; let c = cBase * mul; let a = aBase * mul;
                let cal = Math.round(p * 4 + f * 9 + c * 4 + a * 7);
                addedFoods.push({ N: name, P: p, F: f, C: c, A: a, Cal: cal, time: tZone });
            }
            botReply = botReply.replace(m[0], "");
        });

        // ★改善箇所：[REPLACE]の複数抽出＆JS側でのカンマ対策
        const repMatches = [...botReply.matchAll(/\[REPLACE\]\s*(\d+)\s*\|\s*([^|]+)\|(.+)/g)];
        repMatches.forEach(m => {
            let id = parseInt(m[1], 10);
            let tZone = m[2].trim();
            let dRaw = m[3];
            let parts = dRaw.split(/,|、/).map(p => p.trim());
            let numParts = [];
            while (parts.length > 0) {
                let lastPart = parts[parts.length - 1];
                let val = parseFloat(lastPart.replace(/[^\d.]/g, ""));
                if (!isNaN(val) && /[0-9]/.test(lastPart)) { numParts.unshift(val); parts.pop(); } else { break; }
            }

            if (numParts.length >= 3) {
                let name = parts.join(",").replace(/^["']|["']$/g, "").trim();
                if (!name) name = "不明な食事";
                let pBase = numParts[0] || 0;
                let fBase = numParts[1] || 0;
                let cBase = numParts[2] || 0;
                let aBase = numParts.length >= 4 ? numParts[3] : 0;
                let mul = numParts.length >= 5 ? numParts[4] : (numParts.length === 4 && numParts[3] <= 5 && !dRaw.includes('A') ? numParts[3] : 1);
                if (numParts.length === 4 && numParts[3] <= 5 && !dRaw.includes('A')) aBase = 0;

                let p = pBase * mul; let f = fBase * mul; let c = cBase * mul; let a = aBase * mul;
                let cal = Math.round(p * 4 + f * 9 + c * 4 + a * 7);
                replacedFoods.push({ targetId: id, data: { N: name, P: p, F: f, C: c, A: a, Cal: cal, time: tZone } });
            }
            botReply = botReply.replace(m[0], "");
        });

        botReply = botReply.replace(/\[SYSTEM\].*/gi, "").trim();
        botReply = botReply.replace(/\[DATA\].*/gi, "").trim();
        botReply = botReply.replace(/システムコマンド.*/gi, "").trim();
        botReply = botReply.trim(); // 最後に改行などを掃除

        // ★改善箇所：空吹き出しの防止
        if (!botReply) {
            botReply = "ばっちり記録したたま！";
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
            const unknownFood = unknownFoods[0]; // 最初の1つに対して検索ボタンを出す
            const btnHtml = `<br><br><div style="display:flex; gap:10px; width:100%; margin-top:8px;"><div onclick="openChatGPTAndCopy('${unknownFood}')" style="cursor:pointer; flex:1; background-color:#10A37F; color:#FFFFFF; padding:12px 0; border-radius:10px; font-weight:600; font-size:13px; text-decoration:none; text-align:center; box-shadow:0 2px 5px rgba(0,0,0,0.15); display:flex; flex-direction:column; align-items:center; justify-content:center; line-height:1.4; box-sizing:border-box; transition:opacity 0.2s;"><div style="display:flex; align-items:center; gap:6px;"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M22.28 10.51a6.6 6.6 0 0 0-1.63-7.1 6.62 6.62 0 0 0-7.04-1.6 6.59 6.59 0 0 0-8.91 3.52 6.61 6.61 0 0 0-1.57 7.15 6.6 6.6 0 0 0 1.63 7.09 6.61 6.61 0 0 0 7.03 1.6 6.59 6.59 0 0 0 8.92-3.53 6.62 6.62 0 0 0 1.57-7.13zm-8.87 9.87a4.57 4.57 0 0 1-3.23-1.32l.24-.14 4.54-2.62a1.05 1.05 0 0 0 .52-.91v-5.26l1.79 1.03a4.59 4.59 0 0 1 1.7 5.91 4.58 4.58 0 0 1-5.56 3.31zm-7.66-2.5a4.59 4.59 0 0 1-1.3-3.28l.2.16 4.55 2.63a1.04 1.04 0 0 0 1.05 0l4.55-2.63-.9-1.55-4.54 2.62a2.66 2.66 0 0 1-2.66 0L4.1 11.66a4.58 4.58 0 0 1 1.65-5.38zm7.5-12.78a4.58 4.58 0 0 1 3.23 1.33l-.24.14-4.54 2.62a1.04 1.04 0 0 0-.52.9v5.27l-1.8-1.04A4.59 4.59 0 0 1 8.2 8.52a4.58 4.58 0 0 1 5.06-3.41zm1.25 5.86-1.8-1.04v-3.1a4.58 4.58 0 0 1 6.85-2.1L16.2 6.5v.01l-4.54 2.62a2.66 2.66 0 0 1-2.67 0l-2.6-1.5 2.6-4.5a4.59 4.59 0 0 1 5.51-1.6zm4.6 7.42a4.59 4.59 0 0 1 1.3 3.28l-.2-.16-4.55-2.63a1.04 1.04 0 0 0-1.05 0l-4.54 2.63.9 1.55 4.54-2.62a2.66 2.66 0 0 1 2.66 0l2.58 1.5A4.58 4.58 0 0 1 19.1 18.4zM12 14.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z"/></svg><span>ChatGPT</span></div><span style="font-size:9.5px; font-weight:400; margin-top:3px; opacity:0.9;">(質問を自動コピー)</span></div><a href="https://www.google.com/search?q=${encodeURIComponent(unknownFood + ' カロリー PFC')}" target="_blank" style="flex:1; background-color:#FFFFFF; color:#3C4043; border:1px solid #DADCE0; padding:12px 0; border-radius:10px; font-weight:600; font-size:13px; text-decoration:none; text-align:center; box-shadow:0 2px 5px rgba(0,0,0,0.05); display:flex; flex-direction:column; align-items:center; justify-content:center; line-height:1.4; box-sizing:border-box; transition:background-color 0.2s;"><div style="display:flex; align-items:center; gap:6px;"><svg width="16" height="16" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg><span>Google</span></div><span style="font-size:9.5px; font-weight:400; margin-top:3px; color:#5F6368;">(自分で調べる)</span></a></div>`;
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

        deleteIds.forEach(targetId => {
            const foundIdx = lst.findIndex(item => item.id === targetId);
            if (foundIdx !== -1) { lst.splice(foundIdx, 1); stateChanged = true; }
        });

        addedFoods.forEach(food => {
            lst.push({ id: Date.now() + Math.floor(Math.random() * 1000), N: "🤖 " + food.N, P: food.P, F: food.F, C: food.C, A: food.A, Cal: food.Cal, U: "AI", time: food.time });
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

        // ★改善箇所：記憶喪失対策として、「生テキスト(コマンド込み)」をAI側に渡す会話履歴として記憶
        chatHistory.push({ role: 'model', text: rawText });
        if (chatHistory.length > 6) chatHistory.shift();
        return botReply;

    } catch (error) {
        removeMsg(loadingId);
        const errMsg = '通信エラーだたま...。もう一度送ってたま！';
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
