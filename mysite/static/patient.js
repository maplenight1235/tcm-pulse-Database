/**
 * 監聽 ID 為 "patientForm" 的表單的 "submit" 事件。
 * 當使用者點擊表單內的提交按鈕時，這個函式就會被觸發。
 * 使用 async 關鍵字表示這是一個非同步函式，因為它內部使用了 await 來處理網路請求。
 * @param {Event} e - 瀏覽器傳遞的事件物件。
 */
document.getElementById("patientForm").addEventListener("submit", async function (e) {
    // 阻止表單的預設提交行為，避免整個頁面重新載入。
    e.preventDefault();

    // new FormData(this) 會自動收集表單中所有欄位的資料。
    // 'this' 在這裡指的是觸發事件的表單元素 (patientForm)。
    const formData = new FormData(this);
    // Object.fromEntries 將 FormData 物件轉換成一個標準的 JavaScript 物件 (key-value pair)。
    // 例如：{ ID: 'A123...', Name: '小明', ... }
    const data = Object.fromEntries(formData.entries());

    // 使用 try...catch 結構來處理網路請求過程中可能發生的錯誤。
    try {
        // 使用 fetch API 向後端 '/submit-patient' 路徑發送一個 POST 請求。
        // await 會暫停函式的執行，直到網路請求完成並收到回應。
        const res = await fetch('/submit-patient', {
            method: 'POST', // 指定請求方法。
            headers: { 'Content-Type': 'application/json' }, // 告知後端，我們傳送的是 JSON 格式的資料。
            body: JSON.stringify(data) // 將 JavaScript 物件轉換為 JSON 字串後放入請求主體。
        });

        // 等待並解析從後端傳回的 JSON 格式回應。
        const result = await res.json();
        // 獲取頁面上用於顯示訊息的元素。
        const msg = document.getElementById("msgArea");

        // 檢查後端的回應狀態碼是否為 200 (代表成功)。
        if (res.status === 200) {
            // 操作成功時的處理。
            msg.style.color = 'green'; // 將訊息文字設為綠色。
            msg.textContent = '✅ 病人資料建立成功'; // 設定成功訊息。
            this.reset(); // 清空表單的所有欄位，方便下一次輸入。
        } else {
            // 操作失敗時的處理 (例如，後端驗證失敗)。
            msg.style.color = 'red'; // 將訊息文字設為紅色。
            // 顯示後端回傳的錯誤訊息，如果沒有則顯示通用錯誤訊息。
            msg.textContent = `❌ 錯誤：${result.error || '無法建立病人資料'}`;
        }
    } catch (err) {
        // 如果 fetch 請求本身就失敗了 (例如網路斷線、伺服器無回應)，就會捕捉到這個錯誤。
        document.getElementById("msgArea").textContent = '❌ 系統錯誤，請稍後再試';
    }
});