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
        let isCheatDay = localStorage.getItem('tf_cheat_day') === 'true';
        let recordOnCheatDay = localStorage.getItem('tf_cheat_record') === 'true';
        let isHighCarbMode = localStorage.getItem('tf_cheat_highcarb') === 'true';

        function openPreCheatModal() { document.getElementById('cheat-pre-modal').style.display = 'flex'; }
        function closePreCheatModal() { document.getElementById('cheat-pre-modal').style.display = 'none'; }
        function confirmPreCheatModal() { closePreCheatModal(); openCheatModal(); }

        function openCheatModal() { document.getElementById('cheat-ticket-modal').style.display = 'flex'; }
        function closeCheatModal() { document.getElementById('cheat-ticket-modal').style.display = 'none'; }
        function reserveCheatDay() {
            if (typeof consumeCheatTicket === 'function') consumeCheatTicket();
            alert('カレンダーで予約しました！（※今回は表示のみ）\n1週間後まで再利用できなくなりました。');
            closeCheatModal();
        }
        function startCheatDay(active) {
            isCheatDay = active;
            localStorage.setItem('tf_cheat_day', active);
            if (active) {
                document.body.classList.add('cheat-mode');
                document.getElementById('cheat-panel').style.display = 'block';
                if (typeof consumeCheatTicket === 'function') consumeCheatTicket();
                if (typeof showToast === 'function') showToast("🎉 チートデイ発動！今日は楽しむたま！\n（1週間使えなくなりました）");
                toggleCheatRecord();
            }
            closeCheatModal();
        }

        function cancelCheatDay() {
            isCheatDay = false;
            localStorage.setItem('tf_cheat_day', false);
            localStorage.setItem('tf_cheat_record', false);
            localStorage.setItem('tf_cheat_highcarb', false);
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

        document.addEventListener('DOMContentLoaded', () => {
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
                localStorage.setItem('tf_cheat_highcarb', false);
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