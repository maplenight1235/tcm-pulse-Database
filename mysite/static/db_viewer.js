document.addEventListener('DOMContentLoaded', () => {
    const tableSelector = document.getElementById('tableSelector');
    const dataTableContainer = document.getElementById('dataTableContainer');
    const addNewBtn = document.getElementById('addNewBtn');
    const modal = document.getElementById('editModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalForm = document.getElementById('modalForm');
    const formFields = document.getElementById('formFields');
    const closeBtn = document.querySelector('.close-btn');

    let currentTable = '';
    let currentData = { columns: [], rows: [], primary_key: '' };

    // --- 1. 初始化和資料獲取 ---
    async function fetchTableList() {
        try {
            const response = await fetch('/api/show-tables');
            const data = await response.json();
            if (data.tables) {
                data.tables.forEach(tableName => {
                    const option = document.createElement('option');
                    option.value = tableName;
                    option.textContent = tableName;
                    tableSelector.appendChild(option);
                });
            }
        } catch (error) {
            console.error('Error fetching table list:', error);
        }
    }

    async function fetchTableData(tableName) {
        if (!tableName) {
            dataTableContainer.innerHTML = '<p>請選擇表格。</p>';
            addNewBtn.style.display = 'none';
            return;
        }
        currentTable = tableName;
        dataTableContainer.innerHTML = '<p id="loading">正在載入資料...</p>';
        try {
            const response = await fetch(`/api/table/${tableName}`);
            const data = await response.json();
            if (data.error) throw new Error(data.error);
            currentData = data;
            renderTable();
            addNewBtn.style.display = 'block';
        } catch (error) {
            dataTableContainer.innerHTML = `<p style="color:red;">載入表格 ${tableName} 資料失敗: ${error.message}</p>`;
            addNewBtn.style.display = 'none';
        }
    }

    // --- 2. 渲染和 UI ---
function renderTable() {
        const { columns, rows, primary_key } = currentData;
        if (rows.length === 0) {
            dataTableContainer.innerHTML = '<p>這個表格中沒有任何資料。</p>';
            return;
        }
        let html = '<table><thead><tr>';
        columns.forEach(col => html += `<th>${col}</th>`);
        html += '<th>操作</th></tr></thead><tbody>';

        rows.forEach((row, index) => {
            html += '<tr>';
            columns.forEach(col => {
                const value = row[col];
                html += `<td>${(value === null || value === undefined) ? '<em>NULL</em>' : value}</td>`;
            });
            // [修改] 將整筆 row 的資料儲存在按鈕上
            html += `<td>
                <span class="action-btn edit-btn" data-index="${index}">編輯</span>
                <span class="action-btn delete-btn" data-index="${index}">刪除</span>
            </td>`;
            html += '</tr>';
        });
        html += '</tbody></table>';
        dataTableContainer.innerHTML = html;
    }

    function openModal(mode, data = null) {
        formFields.innerHTML = '';
        const { columns } = currentData;

        columns.forEach(col => {
            const value = data ? (data[col] || '') : '';
            const fieldGroup = document.createElement('div');
            fieldGroup.className = 'form-group';
            fieldGroup.innerHTML = `
                <label for="field-${col}">${col}</label>
                <input type="text" id="field-${col}" name="${col}" value="${value}">
            `;
            formFields.appendChild(fieldGroup);
        });

        modalTitle.textContent = mode === 'add' ? '新增紀錄' : `編輯紀錄`;
        modalForm.dataset.mode = mode;
        // [修改] 儲存原始資料的 JSON 字串
        if (mode === 'edit' && data) {
            modalForm.dataset.original_data_str = JSON.stringify(data);
        } else {
            modalForm.dataset.original_data_str = '';
        }
        modal.style.display = 'block';
    }

 dataTableContainer.addEventListener('click', (event) => {
        const target = event.target;
        // 檢查點擊的是否為帶有 data-index 屬性的按鈕
        if (target.dataset.index === undefined) {
            return; // 如果不是，則不進行任何操作
        }

        const index = target.dataset.index;
        const rowData = currentData.rows[index];

        // --- 偵錯日誌 ---
        console.log("按鈕被點擊:", target);
        console.log("獲取的索引 (index):", index);
        console.log("獲取的該行資料 (rowData):", rowData);
        // --- 偵錯日誌結束 ---

        if (target.classList.contains('delete-btn')) {
            // 確認 rowData 是否真的存在
            if (!rowData) {
                alert("錯誤：找不到要刪除的資料，請重新整理頁面。");
                console.error("在 delete-btn 點擊事件中，rowData 是 undefined。");
                return;
            }
            const pkForDisplay = rowData[currentData.primary_key] || JSON.stringify(rowData);
            if (confirm(`確定要刪除這筆紀錄嗎？ (${pkForDisplay}) 此操作無法復原！`)) {
                handleDelete(rowData);
            }
        }
        if (target.classList.contains('edit-btn')) {
            if (!rowData) {
                alert("錯誤：找不到要編輯的資料，請重新整理頁面。");
                console.error("在 edit-btn 點擊事件中，rowData 是 undefined。");
                return;
            }
            openModal('edit', rowData);
        }
    });

    function closeModal() {
        modal.style.display = 'none';
    }

    // --- 3. 事件處理 ---
    tableSelector.addEventListener('change', () => fetchTableData(tableSelector.value));
    addNewBtn.addEventListener('click', () => openModal('add'));
    closeBtn.addEventListener('click', closeModal);
    window.addEventListener('click', (event) => {
        if (event.target == modal) closeModal();
    });

    dataTableContainer.addEventListener('click', (event) => {
        const target = event.target;
        if (target.classList.contains('delete-btn')) {
            const pk = target.dataset.pk;
            if (confirm(`確定要刪除這筆 ID 為 ${pk} 的紀錄嗎？此操作無法復原！`)) {
                handleDelete(pk);
            }
        }
        if (target.classList.contains('edit-btn')) {
            const index = target.dataset.index;
            const rowData = currentData.rows[index];
            openModal('edit', rowData);
        }
    });

modalForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const formData = new FormData(modalForm);
        const updatedData = Object.fromEntries(formData.entries());
        const { mode, original_data_str } = modalForm.dataset;

        let url = `/api/table/${currentTable}`;
        let method, body;

        if (mode === 'add') {
            method = 'POST';
            body = JSON.stringify(updatedData);
        } else { // 'edit' mode
            method = 'PUT';
            const originalData = JSON.parse(original_data_str);
            const whereClause = {};
            const compositeKeys = ['PID', 'date', 'time'];

            // 建立精確的 WHERE 條件
            if (currentTable === 'history' || currentTable === 'ppluse' || currentTable === 'prescription') {
                compositeKeys.forEach(key => { whereClause[key] = originalData[key]; });
            } else {
                whereClause[currentData.primary_key] = originalData[currentData.primary_key];
            }

            // 從更新資料中移除主鍵欄位
            Object.keys(whereClause).forEach(key => delete updatedData[key]);

            body = JSON.stringify({
                update_data: updatedData,
                where_clause: whereClause
            });
        }

        try {
            const response = await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: body
            });
            const result = await response.json();
            if (!response.ok || result.error) throw new Error(result.error || '操作失敗');

            closeModal();
            fetchTableData(currentTable); // 重新整理表格
        } catch (error) {
            alert(`儲存失敗: ${error.message}`);
        }
    });

    async function handleDelete(originalData) {
        // 如果傳入的資料是 undefined 或 null，則立即停止，並在主控台報錯
        if (!originalData) {
            console.error("handleDelete 函式被呼叫，但傳入的 originalData 是 undefined！");
            alert("刪除操作失敗，因為無法獲取目標資料。");
            return;
        }

        const whereClause = {};
        const compositeKeys = ['PID', 'date', 'time'];

        if (currentTable === 'history' || currentTable === 'ppluse' || currentTable === 'prescription') {
            compositeKeys.forEach(key => { whereClause[key] = originalData[key]; });
        } else {
            whereClause[currentData.primary_key] = originalData[currentData.primary_key];
        }

        try {
            const response = await fetch(`/api/table/${currentTable}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ where_clause: whereClause })
            });
            const result = await response.json();
            if (!response.ok || result.error) throw new Error(result.error || '刪除失敗');
            fetchTableData(currentTable); // 重新整理
        } catch (error) {
            alert(`刪除失敗: ${error.message}`);
        }
    }
    // --- 初始化 ---
    fetchTableList();
});