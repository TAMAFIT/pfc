const testCases = [
    "[DATA] 晩 | ハンバーグ、ご飯, 15, 20, 50\nたまちゃんはお腹がいっぱいたま！",
    "[DATA] 朝 | パン, 10, 5, 20, 2\n[DATA] 昼 | ラーメン, 20, 15, 60, 0, 1",
    "[DATA] 晩 | ビール, 0, 0, 5, 10, 2\n飲みすぎ注意だたま！",
    "[DATA] 間食 | チーズケーキ, 5, 15, 30", // No A, no multiplier
    "[DATA] 朝 | コーヒー、ミルク入り, 1, 2, 3, 4", // with A but no multiplier
    "[DATA] 間食 | プロテイン(水割り), 20, 1, 3, 0", // with A=0
    "[DATA] 昼 | 牛丼, 味噌汁, サラダ, 30, 20, 80", // food name with comma
    "[DATA] 晩 | 何かの料理、10g, 5g, 2g, 0, 1", // with units
    "[DATA] 間食 | 不明な食べ物, 10, 20" // invalid format (only 2 numbers)
];

function testParse(botReplyOriginal) {
    let botReply = botReplyOriginal;
    let addedFoods = [];

    const dataMatches = [...botReply.matchAll(/\[DATA\]\s*([^|]+)\|(.+)/g)];
    dataMatches.forEach(m => {
        let tZone = m[1].trim();
        let dRaw = m[2];
        let parts = dRaw.split(/,|、/).map(p => p.trim());
        let numParts = [];
        while (parts.length > 0) {
            let lastPart = parts[parts.length - 1];
            let val = parseFloat(lastPart.replace(/[^\d.]/g, ""));
            // \d is used, but we should make sure lastPart contains a number
            if (!isNaN(val) && /[0-9]/.test(lastPart)) {
                numParts.unshift(val);
                parts.pop();
            } else {
                break;
            }
        }

        if (numParts.length >= 3) {
            let name = parts.join(",").replace(/^["']|["']$/g, "").trim();
            if (!name) name = "不明な食事";

            let pBase = numParts[0] || 0;
            let fBase = numParts[1] || 0;
            let cBase = numParts[2] || 0;
            let aBase = numParts.length >= 4 ? numParts[3] : 0;
            let mul = numParts.length >= 5 ? numParts[4] : (numParts.length === 4 && numParts[3] <= 5 && !dRaw.includes('A') ? numParts[3] : 1);

            if (numParts.length === 4) {
                if (numParts[3] <= 5 && !dRaw.includes('A')) {
                    mul = numParts[3];
                    aBase = 0;
                }
            }

            let p = pBase * mul; let f = fBase * mul; let c = cBase * mul; let a = aBase * mul;
            let cal = Math.round(p * 4 + f * 9 + c * 4 + a * 7);
            addedFoods.push({ N: name, P: p, F: f, C: c, A: a, Cal: cal, mul: mul, time: tZone });
        }
        botReply = botReply.replace(m[0], "");
    });

    botReply = botReply.replace(/\[SYSTEM\].*/gi, "").trim();
    botReply = botReply.replace(/\[DATA\].*/gi, "").trim();
    botReply = botReply.replace(/システムコマンド.*/gi, "").trim();
    botReply = botReply.trim();

    if (!botReply) {
        botReply = "ばっちり記録したたま！";
    }

    console.log("Input:", JSON.stringify(botReplyOriginal));
    console.log("Parsed Foods:", addedFoods);
    console.log("Remaining Reply:", JSON.stringify(botReply));
    console.log("-----------------------");
}

testCases.forEach(testParse);
