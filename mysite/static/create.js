/**
 * 監聽整個網頁文件，確保在 HTML 結構完全載入並解析後，才執行內部的 JavaScript 程式碼。
 */
document.addEventListener('DOMContentLoaded', () => {
     let lastAnalysisData = {};
    /**
     * 獲取當前客戶端的系統時間，並將其格式化後填入日期和時間的輸入框中。
     * 目的是提供一個方便的預設值，讓使用者不必手動輸入。
     */
    function populateCurrentTime() {
        // 透過 ID 獲取日期和時間的 input 元素
        const dateInput = document.getElementById('date');
        const timeInput = document.getElementById('time');

        // 如果頁面上找不到這兩個元素，則直接退出函式
        if (!dateInput || !timeInput) return;

        // 建立一個 Date 物件，代表當前的日期和時間
        const now = new Date();

        // 格式化日期為 "YYYY-MM-DD" 格式
        const year = now.getFullYear();
        // getMonth() 回傳 0-11，所以需要加 1，並用 padStart 補零確保月份是兩位數
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');

        // 格式化時間為 "HH:MM" 格式
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');

        // 將格式化後的日期和時間字串設定為 input 元素的值
        dateInput.value = `${year}-${month}-${day}`;
        timeInput.value = `${hours}:${minutes}`;
    }


    /**
     * 監聽病歷表單 (historyForm) 的提交 (submit) 事件。
     * 當使用者點擊提交按鈕時，會觸發此函式。
     */
    const form = document.getElementById('historyForm');
    form.addEventListener('submit', async (e) => {
        // 阻止瀏覽器預設的表單提交流程 (這會導致頁面重新整理)
        e.preventDefault();

        // 從表單中獲取病患 ID、日期、時間和自述等基本資料
        const ID = document.getElementById('ID').value;
        const date = document.getElementById('date').value;
        const time = document.getElementById('time').value;
        const description = document.getElementById('description').value;

        // 簡單的驗證，確保所有基本資料欄位都已填寫
        if (!ID || !date || !time || !description) {
            alert('請填寫所有基本資料欄位！');
            return; // 中斷提交程序
        }

        // 定義脈象位置的順序 (寸、關、尺)
        const positions = ['cun', 'guan', 'chi'];
        // 建立一個空陣列，用來存放每個位置的脈診資料
        const ppluse_list = [];

        // 遍歷 'cun', 'guan', 'chi' 三個位置
        positions.forEach(pos => {
            // 根據位置後綴 (cun, guan, chi) 從 DOM 中獲取對應的詳細脈診資料
            const pulse_name = document.getElementById(`pulse_name_${pos}`).value;
            const pulse_judgment = document.getElementById(`pulse_judgment_${pos}`).value;
            const diagnosis = document.getElementById(`diagnosis_${pos}`).value;
            const recommended_herbs = document.getElementById(`recommended_herbs_${pos}`).value;
            const decoction = document.getElementById(`decoction_${pos}`).value;
            const caution = document.getElementById(`caution_${pos}`).value;

            // 只有當該位置至少填寫了一項資料時，才將其視為有效紀錄
            if (pulse_name || pulse_judgment || diagnosis || recommended_herbs || decoction || caution) {
                // 將收集到的資料組合成一個物件，並推入 ppluse_list 陣列
                ppluse_list.push({
                    position: pos,
                    pulse_name: pulse_name,
                    pulse_judgment: pulse_judgment,
                    diagnosis: diagnosis,
                    recommended_herbs: recommended_herbs,
                    decoction: decoction, // 此欄位對應後端的 prescription.method
                    caution: caution,       // 此欄位對應後端的 prescription.notice
                    // 嘗試解析數值欄位，如果元素不存在或值為空，則預設為 0
                    heart_rate_bpm: parseFloat(document.getElementById(`heart_rate_bpm_${pos}`)?.value) || 0,
                    avg_amplitude_pa: parseFloat(document.getElementById(`avg_amplitude_pa_${pos}`)?.value) || 0,
                    avg_pressure_pa: parseFloat(document.getElementById(`avg_pressure_pa_${pos}`)?.value) || 0
                });
            }
        });

        // 驗證是否至少填寫了一個位置的脈象資料
        if (ppluse_list.length === 0) {
            alert('請至少填寫一個脈象位置的資料！');
            return;
        }

        // 將所有基本資料和脈診資料列表組合成一個最終的 formData 物件
        const formData = {
            ID: ID,
            date: date,
            time: time,
            description: description,
            ppluse_list: ppluse_list
        };

        // 使用 try...catch 結構來處理可能發生的網路請求錯誤
        try {
            // 使用 fetch API 向後端 /submit-history 發送一個 POST 請求
            const response = await fetch('/submit-history', {
                method: 'POST', // 指定請求方法為 POST
                headers: { 'Content-Type': 'application/json' }, // 告知後端請求主體是 JSON 格式
                body: JSON.stringify(formData) // 將 JavaScript 物件轉換為 JSON 字串作為請求主體
            });

            // 等待並解析後端回傳的 JSON 回應
            const result = await response.json();
            // 獲取頁面上用於顯示訊息的區域
            const msgArea = document.getElementById('msgArea');

            // 根據後端的回應狀態 (成功或失敗) 來更新頁面
            if (response.ok) {
                // 如果成功，顯示成功訊息
                msgArea.textContent = '✅ 提交成功！';
                msgArea.style.color = 'green';
                // 清空整個表單，方便下次輸入
                form.reset();
                // 再次呼叫 populateCurrentTime，將日期和時間重設為當前時間
                populateCurrentTime();
            } else {
                // 如果失敗，顯示後端傳回的錯誤訊息
                msgArea.textContent = `❌ 提交失敗: ${result.error}`;
                msgArea.style.color = 'red';
            }
        } catch (error) {
            // 如果 fetch 請求本身失敗 (例如網路中斷)，則捕獲錯誤
            console.error('Error submitting form:', error);
            const msgArea = document.getElementById('msgArea');
            msgArea.textContent = '❌ 提交失敗，請檢查連線或伺服器。';
            msgArea.style.color = 'red';
        }
    });

    /**
     * 定期向後端 API 輪詢，以獲取最新的脈診分析資料。
     * 這個函式會被 setInterval 週期性地呼叫。
     */
    async function fetchAnalysisData() {
        try {
            const response = await fetch('/api/get-latest-analysis');
            if (response.status === 204) {
                return;
            }
            if (!response.ok) {
                console.warn('Failed to fetch analysis data. Status:', response.status);
                return;
            }
            const newData = await response.json(); // 將收到的資料命名為 newData

            // --- [核心修改] 比較新舊資料 ---
            // 使用 JSON.stringify 將物件轉換為字串來進行深度比較。
            // 這是判斷兩個 JavaScript 物件內容是否完全相等的最簡單有效的方法。
            if (JSON.stringify(newData) === JSON.stringify(lastAnalysisData)) {
                // 如果新舊資料完全相同，就直接結束函式，不執行任何更新操作。
                return;
            }

            // --- 如果資料是新的，才執行以下更新邏-輯 ---
            console.log("偵測到新的分析資料，正在更新表單...", newData);

            // 將 lastAnalysisData 更新為最新的資料，為下一次比較做準備。
            lastAnalysisData = newData;

            if (Array.isArray(newData) && newData.length === 3) {
                const [cunData, guanData, chiData] = newData;
                if (cunData && cunData.position === '寸部') fillForm('cun', cunData);
                if (guanData && guanData.position === '關部') fillForm('guan', guanData);
                if (chiData && chiData.position === '尺部') fillForm('chi', chiData);
            }
        } catch (error) {
            console.error('Error fetching analysis data:', error);
        }
    }



/**
* 一個輔助函式，用於將從後端獲取的單一部位分析資料，填入表單中對應的欄位。
* @param {string} position_suffix - 位置的後綴 ('cun', 'guan', or 'chi').
* @param {object} data - 包含該位置脈診分析資料的物件。
*/
function fillForm(position_suffix, data) {
    // 安全地獲取 DOM 元素並設定其值。
    const setValue = (elementId, value) => {
        const element = document.getElementById(elementId);
        if (element) {
            // 使用 '??' (nullish coalescing operator) 來處理 null 和 undefined
            element.value = value ?? '';
        }
    };

    // 填充一般文字和數字欄位
    setValue(`pulse_name_${position_suffix}`, data.pulse_name);
    setValue(`pulse_judgment_${position_suffix}`, data.pulse_judgment);
    setValue(`diagnosis_${position_suffix}`, data.diagnosis);
    setValue(`decoction_${position_suffix}`, data.decoction);
    setValue(`caution_${position_suffix}`, data.caution);
    setValue(`heart_rate_bpm_${position_suffix}`, data.heart_rate_bpm);
    setValue(`avg_amplitude_pa_${position_suffix}`, data.avg_amplitude_pa);
    setValue(`avg_pressure_pa_${position_suffix}`, data.avg_pressure_pa);

    // --- 【修改重點】處理 '建議藥材' 欄位 ---
    const recommendedHerbsElement = document.getElementById(`recommended_herbs_${position_suffix}`);
    if (recommendedHerbsElement) {
        // 檢查 data.recommended_herbs 是否為一個非空陣列
        if (Array.isArray(data.recommended_herbs) && data.recommended_herbs.length > 0) {

            // 1. 使用 .map() 遍歷陣列中的每一個藥材物件
            const formattedHerbsString = data.recommended_herbs.map(herb => {
                // 2. 為每個物件建立一個格式化的字串，例如："荊芥 (6g): 解表散風止痛"
                //    注意：這裡直接使用中文鍵名來存取屬性
                return `${herb.藥材} ${herb.劑量}g (${herb.作用})`;
            })
            // 3. 使用 .join('\n') 將陣列中的所有字串用換行符連接成一個單一字串
            .join('\n');

            // 4. 將格式化後的字串賦值給 textarea
            recommendedHerbsElement.value = formattedHerbsString;

        } else {
            // 如果沒有建議藥材或格式不符，則清空欄位
            recommendedHerbsElement.value = '';
        }
    }
}



    // --- 頁面初始化 ---

    // 頁面載入完成後，立即執行一次函式，將日期和時間欄位填上當前值
    populateCurrentTime();

    // 設定一個計時器，每隔 3000 毫秒 (3秒) 就自動執行一次 fetchAnalysisData 函式
    setInterval(fetchAnalysisData, 3000);

});