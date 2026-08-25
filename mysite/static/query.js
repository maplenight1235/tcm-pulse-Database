// 定義一個全域變數，用於儲存從後端 API 獲取的所有病歷紀錄。
// 這樣設計可以讓多個函式共享同一份資料，避免重複請求。
let allHistoryData = [];

/**
 * 監聽整個網頁文件，確保在 HTML 結構完全載入並解析後，才執行內部的 JavaScript 程式碼。
 */
document.addEventListener('DOMContentLoaded', function() {
    // 獲取歷史紀錄的下拉式選單元素
    const historySelector = document.getElementById('historySelector');
    // 如果頁面上存在這個選單，就為它綁定一個 'change' 事件監聽器
    if (historySelector) {
        // 當使用者在下拉選單中選擇了不同的項目時，會觸發 displaySelectedHistory 函式
        historySelector.addEventListener('change', displaySelectedHistory);
    }
});

/**
 * 主要的查詢函式，由使用者點擊「查詢」按鈕觸發。
 * 負責獲取使用者輸入的病患 ID，並向後端發起一系列的 API 請求來獲取資料。
 */
async function queryPatient() {
    // 獲取輸入框中的病患 ID，並移除前後的空白字元
    const id = document.getElementById("patientID").value.trim();
    // 如果 ID 為空，則提示使用者並中斷函式執行
    if (!id) {
        alert("請輸入病人 ID");
        return;
    }

    // 在開始新的查詢之前，清空畫面上所有舊的查詢結果
    document.getElementById("patientInfo").innerHTML = "";
    document.getElementById("history-controls").style.display = "none";
    document.getElementById("historyInfo").innerHTML = "";
    // 顯示「載入中」的提示訊息
    const loadingIndicator = document.getElementById("loading-indicator");
    loadingIndicator.style.display = "block";

    // 使用 try...catch 結構來處理可能發生的網路請求或資料處理錯誤
    try {
        // --- 第一步：非同步獲取病患的基本資料 ---
        const pRes = await fetch(`/patient/${id}`);
        const patient = await pRes.json();

        // 如果後端回傳的狀態不是 200 (成功)，或回傳的資料中沒有 ID，則視為查無此人
        if (pRes.status !== 200 || !patient.ID) {
            document.getElementById("patientInfo").innerHTML = `<p style="color:red;">查無此病人</p>`;
            loadingIndicator.style.display = "none";
            return; // 中斷函式
        }

        // --- 將獲取到的病患基本資料動態生成 HTML 並顯示在頁面上 ---
        document.getElementById("patientInfo").innerHTML = `
            <h2>病人基本資料</h2>
            <p>姓名：${patient.name}</p>
            <p>性別：${patient.gender}</p>
            <p>年齡：${patient.age}</p>
            <p>電話：${patient.phone}</p>
        `;

        // --- 第二步：非同步獲取該病患的所有歷史病歷紀錄 ---
        const hRes = await fetch(`/patient/${id}/history`);
        
        // 如果後端回應不成功 (例如 404 Not Found, 500 Server Error)
        if (!hRes.ok) {
            // 嘗試解析錯誤訊息的 JSON，如果解析失敗則提供一個通用訊息
            const errorData = await hRes.json().catch(() => ({ error: '無法解析錯誤訊息' }));
            // 拋出一個錯誤，會被下面的 catch 區塊捕獲
            throw new Error(errorData.error || `伺服器錯誤: ${hRes.status}`);
        }
        
        // 解析病歷紀錄的 JSON 資料
        const historyData = await hRes.json();

        // 隱藏「載入中」的提示
        loadingIndicator.style.display = "none";
        
        // 如果回傳的資料不是一個陣列，或陣列長度為 0，則顯示查無紀錄
        if (!Array.isArray(historyData) || historyData.length === 0) {
            document.getElementById("historyInfo").innerHTML = `<p>查無病歷紀錄</p>`;
            document.getElementById("history-controls").style.display = "none";
            return;
        }

        // --- 成功獲取資料後的處理 ---
        // 將獲取到的資料存入全域變數
        allHistoryData = historyData;
        // 呼叫函式，用這些資料來填充下拉式選單
        populateHistorySelector();
        // 顯示包含下拉選單的控制區塊
        document.getElementById("history-controls").style.display = "block";

    } catch (err) {
        // 如果在 try 區塊中的任何一步 (fetch, .json()) 發生錯誤，則執行此處的程式碼
        console.error("❌ 查詢過程中發生錯誤:", err);
        loadingIndicator.style.display = "none";
        // 在頁面上顯示一個對使用者友善的錯誤訊息
        document.getElementById("historyInfo").innerHTML = `<p style="color:red;">查詢失敗：${err.message}</p>`;
    }
}

/**
 * 根據全域變數 allHistoryData 中的資料，動態生成下拉式選單的選項。
 */
function populateHistorySelector() {
    const selector = document.getElementById("historySelector");
    selector.innerHTML = ""; // 先清空選單中所有舊的選項

    // 使用 sort 方法對 allHistoryData 陣列進行排序
    // 排序邏輯是根據日期和時間，將最新的紀錄排在最前面
    const sortedData = [...allHistoryData].sort((a, b) => {
        return new Date(b.date + ' ' + b.time) - new Date(a.date + ' ' + a.time);
    });

    // 將全域變數更新為排序後的結果，確保後續操作的索引值正確
    allHistoryData = sortedData;

    // 遍歷排序後的資料陣列
    sortedData.forEach((entry, index) => {
        // 為每一筆紀錄建立一個 <option> 元素
        const option = document.createElement("option");
        option.value = index; // 將選項的 value 設為它在陣列中的索引
        option.text = `日期: ${entry.date} 時間: ${entry.time}`; // 設定選項顯示的文字
        selector.appendChild(option); // 將建立好的選項加入到 select 元素中
    });

    // 如果有資料，就預設觸發一次顯示函式，立即顯示第一筆 (最新) 的紀錄
    if (sortedData.length > 0) {
        displaySelectedHistory();
    }
}

/**
 * 顯示使用者在下拉式選單中選定的那筆歷史紀錄的詳細內容。
 */
function displaySelectedHistory() {
    const selector = document.getElementById("historySelector");
    // 獲取當前選中選項的 value (即紀錄在陣列中的索引)
    const selectedIndex = selector.value;
    // 根據索引從全域變數中獲取對應的紀錄物件
    const selectedData = allHistoryData[selectedIndex];
    const historyInfoDiv = document.getElementById("historyInfo");

    // 如果找不到對應的資料，則顯示提示訊息
    if (!selectedData) {
        historyInfoDiv.innerHTML = `<p>請選擇一筆紀錄</p>`;
        return;
    }

    // --- 開始動態組合要顯示的 HTML 字串 ---
    let html = `
        <div class="history-entry">
            <h3>日期：${selectedData.date} 時間：${selectedData.time}</h3>
            <p><strong>自述：</strong> ${selectedData.description || '—'}</p>
    `;

    // 取得該筆紀錄中所有脈象位置的鍵 (例如 ['寸部', '關部', '尺部'])
    // 並根據預設順序進行排序，確保顯示時總是 寸、關、尺
    const sortedPositions = Object.keys(selectedData.parts).sort((a, b) => {
        const positionOrder = { '寸部': 1, '關部': 2, '尺部': 3 };
        return (positionOrder[a] || 99) - (positionOrder[b] || 99);
    });

    // 遍歷排序後的位置
    sortedPositions.forEach(position => {
        const partData = selectedData.parts[position];
        if (partData) {
            // 處理 position 為 null 的情況，顯示為 '其他'
            const displayPosition = position === 'null' || position === null ? '其他' : position;
            // 組合每個位置的詳細資訊 HTML
            html += `
                <div class="part-section">
                    <h4>脈搏資料 - ${displayPosition}</h4>
                    <ul>
                        <li>心率：${partData.pulse.heart_rate_bpm ?? '—'} bpm</li>
                        <li>振幅：${partData.pulse.avg_amplitude_pa ?? '—'} Pa</li>
                        <li>平均壓：${partData.pulse.avg_pressure_pa ?? '—'} Pa</li>
                        <li>初步脈象：${partData.pulse.pulse_name ?? '—'}</li>
                        <li>脈象判斷：${partData.pulse.pulse_judgment ?? '—'}</li>
                        <li>診斷：${partData.pulse.diagnosis ?? '—'}</li>
                    </ul>

                    <h4>處方</h4>
                    <ul>
                        <li>服用方式：${partData.prescription.method ?? '—'}</li>
                        <li>注意事項：${partData.prescription.notic ?? '—'}</li>
                    </ul>
            `;

            // 如果有處方藥材項目，則動態生成一個表格來顯示
            if (partData.prescription.items && partData.prescription.items.length > 0) {
                html += `
                    <h5>處方藥材</h5>
                    <table>
                        <thead>
                            <tr>
                                <th>藥材名稱</th>
                                <th>劑量 (g)</th>
                                <th>功效</th>
                            </tr>
                        </thead>
                        <tbody>
                `;
                // 遍歷藥材項目並生成每一行 <tr>
                partData.prescription.items.forEach(item => {
                    html += `
                            <tr>
                                <td>${item.herb_name ?? '—'}</td>
                                <td>${item.dose_g_per_day ?? '—'}</td>
                                <td>${item.function ?? '—'}</td>
                            </tr>
                    `;
                });
                html += `
                        </tbody>
                    </table>
                `;
            } else {
                // 如果沒有藥材，則顯示提示
                html += `<p>無處方藥材</p>`;
            }
            html += `</div>`; // 結束 .part-section
        }
    });

    html += `</div>`; // 結束 .history-entry
    // 將組合完成的 HTML 字串，一次性地寫入到頁面的顯示區域中
    historyInfoDiv.innerHTML = html;
}