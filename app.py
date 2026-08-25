# 引入 Flask 網頁框架及其他必要的模組
from flask import Flask, render_template, jsonify, request, Response
import pymysql # 用於連接 MySQL 資料庫
import pymysql.cursors # 用於獲取字典形式的查詢結果
from datetime import date, time, datetime, timedelta # 用於處理日期和時間
import json # 用於處理 JSON 格式
import traceback, sys # 用於印出詳細的錯誤追蹤訊息
from flask_socketio import SocketIO # 引入 SocketIO，即使目前未使用其主要功能
import re # 引入正規表示法模組


def parse_herb_pairs(herb_text: str):
    """
    解析包含藥材和劑量的文字字串。

    Args:
        herb_text (str): 包含多行藥材資訊的字串，例如 "當歸 10g\n黃耆 15g"。

    Returns:
        list: 一個包含 (藥材名稱, 劑量) 元組的列表。
    """
    # 如果輸入為空字串，直接回傳空列表
    if not herb_text:
        return []

    pairs = []
    # 將文字按換行符分割成多行
    lines = herb_text.strip().split('\n')
    # 遍歷每一行
    for line in lines:
        # 使用正規表示法尋找 "中文字 + 數字 + g" 的模式
        match = re.search(r"([\u4e00-\u9fa5]+)\s*([\d.]+)\s*g", line)
        if match:
            # 如果匹配成功，提取藥材名稱和劑量
            herb_name = match.group(1).strip()
            dose = match.group(2).strip()
            pairs.append((herb_name, dose))
    return pairs

# 初始化 Flask 應用程式
app = Flask(__name__)

# 初始化 SocketIO，保留此實例是為了 wsgi.py 的部署配置
socketio = SocketIO(app, cors_allowed_origins="*")
# 建立一個獨立的 SocketIO WSGI 應用程式物件，供 wsgi.py 使用
socketio_app = socketio

# 定義一個全域列表，用於暫存從外部接收到的最新脈診分析資料
latest_analysis_data = []

# PythonAnywhere 平台的 MySQL 資料庫連線設定
connection_config = {
    "host": "mapleproject.mysql.pythonanywhere-services.com",
    "user": "mapleproject",
    "password": "Loser930704",
    "database": "mapleproject$projectDB",
    "charset": "utf8mb4",
    "cursorclass": pymysql.cursors.DictCursor # 設定 cursor 回傳的結果為字典格式
}

def get_db_connection():
    """
    建立並回傳一個新的資料庫連線物件。
    將連線邏輯包裝成函式，方便在各個路由中重複使用。

    Returns:
        pymysql.Connection: pymysql 的資料庫連線物件。
    """
    return pymysql.connect(**connection_config)

# --- 基礎網站路由 ---

@app.route('/')
def home():
    """網站首頁"""
    return render_template("main.html")

@app.route('/query')
def query():
    """查詢病歷頁面"""
    return render_template('query.html')

@app.route('/create')
def create():
    """新增病歷頁面"""
    return render_template('create.html')

@app.route("/patient/<pid>")
def get_patient(pid):
    """
    API 路由：根據病患 ID (pid) 獲取該病患的基本資料。

    Args:
        pid (str): 從 URL 路徑中獲取的病患身分證號。

    Returns:
        Response: 包含病患資料的 JSON 物件，或錯誤訊息。
    """
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            sql = "SELECT * FROM patient WHERE `ID` = %s"
            cur.execute(sql, (pid,))
            patient = cur.fetchone()

        conn.close()
        if patient:
            return jsonify(patient)
        else:
            return jsonify({"error": "Patient not found"}), 404
    except Exception as e:
        traceback.print_exc(file=sys.stderr)
        return jsonify(error=str(e)), 500


@app.route("/patient/<pid>/history")
def get_patient_history(pid):
    """
    API 路由：根據病患 ID (pid) 獲取該病患的完整歷史病歷。
    這是一個複雜的查詢，會關聯多個表格來組合出完整的巢狀資料。

    Args:
        pid (str): 病患的身分證號。

    Returns:
        Response: 一個包含所有病歷紀錄的 JSON 列表。
    """
    try:
        conn = get_db_connection()
        cur = conn.cursor(pymysql.cursors.DictCursor)

        # 透過 LEFT JOIN 將多個表格的資料關聯在一起
        sql = """
            SELECT
                h.date, h.time, h.description, p.position,
                p.heart_rate_bpm, p.amplitude_pa,
                p.pressure_pa, p.pulse_name,
                p.pulse_judgment, p.diagnosis,
                pr.method, pr.notice, pri.dose_g_per_day,
                he.herb_name, he.function
            FROM history h
            LEFT JOIN ppluse p ON h.PID = p.PID AND h.date = p.date AND h.time = p.time
            LEFT JOIN prescription pr ON p.PID = pr.PID AND p.date = pr.date AND p.time = pr.time AND p.position = pr.position
            LEFT JOIN prescription_item pri ON pr.prescription_id = pri.prescription_id
            LEFT JOIN herbs he ON pri.herb_id = he.herb_id
            WHERE h.PID = %s
            ORDER BY h.date DESC, h.time DESC, p.position, pr.prescription_id
        """
        cur.execute(sql, (pid,))
        raw_data = cur.fetchall()
        conn.close()

        # 在 Python 中將扁平的 SQL 查詢結果，重組成巢狀的 JSON 結構
        histories = {}
        for row in raw_data:
            time_str = str(row['time']) if isinstance(row['time'], timedelta) else row['time']
            date_str = row['date'].isoformat() if isinstance(row['date'], date) else row['date']

            key = (date_str, time_str)
            if key not in histories:
                histories[key] = {
                    'date': date_str, 'time': time_str,
                    'description': row['description'], 'parts': {}
                }

            position_key = row['position']
            if position_key and position_key not in histories[key]['parts']:
                histories[key]['parts'][position_key] = {
                    'pulse': {
                        'heart_rate_bpm': row['heart_rate_bpm'],
                        'avg_amplitude_pa': row['amplitude_pa'],
                        'avg_pressure_pa': row['pressure_pa'],
                        'pulse_name': row['pulse_name'],
                        'pulse_judgment': row['pulse_judgment'],
                        'diagnosis': row['diagnosis']
                    },
                    'prescription': {
                        'method': row['method'],
                        'notic': row['notice'],
                        'items': []
                    }
                }

            if row['herb_name'] and position_key:
                current_herbs = [item['herb_name'] for item in histories[key]['parts'][position_key]['prescription']['items']]
                if row['herb_name'] not in current_herbs:
                    histories[key]['parts'][position_key]['prescription']['items'].append({
                        'herb_name': row['herb_name'],
                        'function': row['function'],
                        'dose_g_per_day': row['dose_g_per_day']
                    })

        result_list = list(histories.values())
        return jsonify(result_list)

    except Exception as e:
        traceback.print_exc(file=sys.stderr)
        return jsonify({"error": str(e)}), 500


@app.route("/api/push-analysis", methods=["POST"])
def push_analysis():
    """
    API 路由：接收外部系統 (例如脈診分析儀) 推送過來的脈診資料。

    Returns:
        Response: JSON 格式的成功或失敗訊息。
    """
    global latest_analysis_data
    try:
        data_list = request.get_json(force=True)
        data_map = {item['position']: item for item in data_list if 'position' in item}

        # 強制按照「寸、關、尺」的順序重新組合資料
        sorted_data = [
            data_map.get('寸部', {}),
            data_map.get('關部', {}),
            data_map.get('尺部', {})
        ]

        latest_analysis_data = sorted_data
        print("BBB")
        print(latest_analysis_data)
        return jsonify(ok=True)
    except Exception as e:
        traceback.print_exc()
        return jsonify(error=str(e)), 500


@app.route('/api/get-latest-analysis')
def get_latest_analysis():
    """
    API 路由：供「新增病歷」頁面的前端 JavaScript 定期輪詢，以獲取最新的分析資料。

    Returns:
        Response: 如果有新資料，回傳包含資料的 JSON；如果沒有，回傳 204 No Content。
    """
    global latest_analysis_data
    print("AAA")
    print(latest_analysis_data)
    if latest_analysis_data:
        data_to_send = latest_analysis_data
        #latest_analysis_data = []  # 傳送後即清空
        return jsonify(data_to_send)
    else:
        return Response(status=204)


@app.route('/new-patient')
def new_patient():
    """「新增病人」頁面"""
    return render_template('patient.html')


@app.route('/submit-patient', methods=['POST'])
def submit_patient():
    """
    API 路由：處理從「新增病人」頁面提交的表單資料，將新病人寫入資料庫。

    Returns:
        Response: JSON 格式的成功或失敗訊息。
    """
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "無效的請求：未收到資料"}), 400

        conn = get_db_connection()
        with conn.cursor() as cursor:
            sql = "INSERT INTO patient (ID, name, gender, age, phone) VALUES (%s, %s, %s, %s, %s)"
            cursor.execute(sql, (
                data['ID'], data['name'], data['gender'],
                int(data['age']), data['phone']
            ))
            conn.commit()
        conn.close()
        return jsonify({"status": "ok"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/submit-history', methods=['POST'])
def submit_history():
    """
    API 路由：處理從「新增病歷」頁面提交的複雜表單資料。
    這會同時寫入多個表格 (history, ppluse, prescription, prescription_item)。

    Returns:
        Response: JSON 格式的成功或失敗訊息。
    """
    try:
        if not request.is_json: return jsonify({"error": "Request must be JSON"}), 400
        data = request.get_json()
        ID = data.get('ID')
        if not ID: return jsonify({"error": "Missing required field: ID"}), 400
        ppluse_list = data.get('ppluse_list') or []
        date_val = data.get('date')
        time_val = data.get('time')
        description = data.get('description', '')

        connection = get_db_connection()
        with connection.cursor() as cursor:
            cursor.execute("SELECT ID FROM patient WHERE ID = %s", (ID,))
            if not cursor.fetchone(): return jsonify({"error": "病人不存在"}), 404

            sql_history = "INSERT INTO history (PID, date, time, description) VALUES (%s, %s, %s, %s)"
            cursor.execute(sql_history, (ID, date_val, time_val, description))

            sql_ppluse = """
                INSERT INTO ppluse (PID, position, heart_rate_bpm, amplitude_pa, pressure_pa, pulse_name, pulse_judgment, diagnosis, date, time)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """
            sql_prescription = """
                INSERT INTO prescription (PID, date, time, position, method, notice)
                VALUES (%s, %s, %s, %s, %s, %s)
            """
            sql_prescription_item = "INSERT INTO prescription_item (prescription_id, herb_id, dose_g_per_day) VALUES (%s, %s, %s)"
            sql_lookup_herb = "SELECT herb_id, `function` FROM herbs WHERE herb_name = %s"

            for entry in ppluse_list:
                position = entry.get('position', '')

                cursor.execute(sql_ppluse, (
                    ID, position,
                    float(entry.get('heart_rate_bpm', 0)), float(entry.get('avg_amplitude_pa', 0)),
                    float(entry.get('avg_pressure_pa', 0)), entry.get('pulse_name', ''),
                    entry.get('pulse_judgment', ''), entry.get('diagnosis', ''),
                    date_val, time_val
                ))

                decoction = entry.get('decoction', '')
                caution = entry.get('caution', '')

                cursor.execute(sql_prescription, (ID, date_val, time_val, position, decoction, caution))
                prescription_id = cursor.lastrowid

                recommended_herbs_data = entry.get('recommended_herbs', '')
                pairs = parse_herb_pairs(recommended_herbs_data)
                if pairs:
                    for herb_name, dose in pairs:
                        cursor.execute(sql_lookup_herb, (herb_name,))
                        herb_info = cursor.fetchone()
                        if herb_info:
                            cursor.execute(sql_prescription_item, (prescription_id, herb_info['herb_id'], float(dose)))
                        else:
                            cursor.execute(sql_prescription_item, (prescription_id, None, float(dose)))

            connection.commit()
        return jsonify({"status": "ok"})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
    finally:
        if 'connection' in locals() and connection.open:
            connection.close()


@app.route('/delete-history/<history_id>', methods=['DELETE'])
def delete_history(history_id):
    """
    API 路由：根據 history_id 刪除相關的所有紀錄 (級聯刪除)。

    Args:
        history_id (str): 病患的身分證號。

    Returns:
        Response: JSON 格式的成功或失敗訊息。
    """
    try:
        connection = get_db_connection()
        with connection.cursor() as cursor:
            # 由於外鍵約束，需要依照正確的順序刪除 (先刪子表，再刪父表)。
            # 這裡的邏輯是找出所有相關的 prescription_id 並刪除 prescription_item。
            cursor.execute("SELECT date, time FROM ppluse WHERE PID = %s", (history_id,))
            ppluse_records = cursor.fetchall()

            for record in ppluse_records:
                cursor.execute("""
                    DELETE FROM prescription_item
                    WHERE prescription_id IN (
                        SELECT prescription_id FROM prescription
                        WHERE PID = %s AND date = %s AND time = %s
                    )
                """, (history_id, record['date'], record['time']))

            # 依序刪除 prescription, ppluse, history 表中的紀錄
            cursor.execute("DELETE FROM prescription WHERE PID = %s", (history_id,))
            cursor.execute("DELETE FROM ppluse WHERE PID = %s", (history_id,))
            cursor.execute("DELETE FROM history WHERE PID = %s", (history_id,))
            connection.commit()
        connection.close()
        return jsonify({"status": "ok", "message": f"History and all related records for PID {history_id} deleted successfully."})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
    finally:
        if 'connection' in locals() and connection.open:
            connection.close()


# --- 資料庫檢視器功能 ---

@app.route('/api/show-tables')
def show_tables():
    """
    API 路由：獲取資料庫中所有表格的名稱列表。

    Returns:
        Response: 包含所有表格名稱的 JSON 列表。
    """
    try:
        connection = get_db_connection()
        with connection.cursor() as cursor:
            cursor.execute("SHOW TABLES;")
            result = cursor.fetchall()
            if result:
                key_name = list(result[0].keys())[0]
                tables = [row[key_name] for row in result]
        connection.close()
        return jsonify(tables=tables)
    except Exception as e:
        return jsonify(error=str(e)), 500

def get_primary_key(cursor, table_name):
    """
    輔助函式：根據表格名稱，查詢並回傳其主鍵欄位的名稱。

    Args:
        cursor (pymysql.cursors.Cursor): 資料庫 cursor 物件。
        table_name (str): 要查詢的表格名稱。

    Returns:
        str: 主鍵欄位的名稱。
    """
    try:
        cursor.execute(f"SHOW KEYS FROM `{table_name}` WHERE Key_name = 'PRIMARY';")
        key_info = cursor.fetchone()
        if key_info and 'Column_name' in key_info:
            return key_info['Column_name']
    except Exception as e:
        print(f"無法找到表格 '{table_name}' 的主鍵: {e}")
    return 'ID' # 預設回傳 'ID'

@app.route('/db-viewer')
def db_viewer():
    """資料庫管理器頁面"""
    return render_template('db_viewer.html')


@app.route('/api/table/<table_name>', methods=['GET', 'POST'])
def manage_table(table_name):
    """
    整合的 API：
    - GET: 獲取表格內容
    - POST: 新增一筆紀錄

    Args:
        table_name (str): 要操作的表格名稱。

    Returns:
        Response: GET 請求回傳表格內容；POST 請求回傳操作結果。
    """
    try:
        connection = get_db_connection()
        with connection.cursor() as cursor:
            cursor.execute("SHOW TABLES;")
            valid_tables = [list(row.values())[0] for row in cursor.fetchall()]
            if table_name not in valid_tables:
                return jsonify({"error": "Invalid table name specified"}), 400

            if request.method == 'POST':
                data = request.get_json()
                if not data: return jsonify(error="No data provided"), 400

                columns = data.keys()
                values = list(data.values())

                cols_str = ", ".join([f"`{col}`" for col in columns])
                placeholders = ", ".join(["%s"] * len(values))
                query = f"INSERT INTO `{table_name}` ({cols_str}) VALUES ({placeholders});"

                cursor.execute(query, values)
                connection.commit()
                return jsonify(success=True, message="Row added successfully")

            else: # GET 請求
                primary_key = get_primary_key(cursor, table_name)
                query = f"SELECT * FROM `{table_name}`;"
                cursor.execute(query)
                rows = cursor.fetchall()
                column_names = [desc[0] for desc in cursor.description]

                for row in rows:
                    for key, value in row.items():
                        if isinstance(value, (timedelta, date)):
                            row[key] = str(value)

                return jsonify(columns=column_names, rows=rows, primary_key=primary_key)

    except Exception as e:
        traceback.print_exc()
        return jsonify(error=str(e)), 500
    finally:
        if 'connection' in locals() and connection.open:
            connection.close()


@app.route('/api/table/<table_name>/<pk_value>', methods=['PUT', 'DELETE'])
def manage_table_row(table_name, pk_value):
    """
    整合的 API：
    - PUT: 修改一筆紀錄
    - DELETE: 刪除一筆紀錄

    Args:
        table_name (str): 要操作的表格名稱。
        pk_value (str): 要操作紀錄的主鍵值。

    Returns:
        Response: 回傳操作結果。
    """
    try:
        connection = get_db_connection()
        with connection.cursor() as cursor:
            cursor.execute("SHOW TABLES;")
            valid_tables = [list(row.values())[0] for row in cursor.fetchall()]
            if table_name not in valid_tables:
                return jsonify({"error": "Invalid table name"}), 400

            primary_key = get_primary_key(cursor, table_name)

            if request.method == 'PUT':
                data = request.get_json()
                if not data: return jsonify(error="No data provided"), 400

                update_pairs = [f"`{col}` = %s" for col in data.keys()]
                set_clause = ", ".join(update_pairs)

                query = f"UPDATE `{table_name}` SET {set_clause} WHERE `{primary_key}` = %s;"
                values = list(data.values()) + [pk_value]

                cursor.execute(query, values)
                connection.commit()
                return jsonify(success=True, message="Row updated successfully")

            elif request.method == 'DELETE':
                query = f"DELETE FROM `{table_name}` WHERE `{primary_key}` = %s;"
                cursor.execute(query, (pk_value,))
                connection.commit()
                return jsonify(success=True, message="Row deleted successfully")

    except Exception as e:
        traceback.print_exc()
        return jsonify(error=str(e)), 500
    finally:
        if 'connection' in locals() and connection.open:
            connection.close()