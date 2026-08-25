# 引入正規表示法模組
import re
# 從 typing 模組引入類型提示，讓程式碼更具可讀性和健壯性
from typing import List, Tuple, Union

# 定義一個類型別名 HerbPair，代表一個包含 (藥材名稱, 劑量) 的元組。
# 這有助於靜態分析工具檢查，並讓其他開發者更容易理解函式的回傳值。
HerbPair = Tuple[str, float]

def parse_herb_pairs(data: Union[str, List[dict]]) -> List[HerbPair]:
    """
    從兩種可能的格式 (字串或字典列表) 中，解析出藥材名稱和劑量。
    
    Args:
        data: 輸入的資料，可能是以下兩種格式之一：
              1. 包含藥材資訊的純文字字串 (例如："當歸 10g\n黃耆 15g")。
              2. 一個字典組成的列表，每個字典包含 '藥材' 和 '劑量' 鍵 
                 (例如：[{'藥材': '當歸', '劑量': '10'}, ...])。

    Returns:
        一個元組 (tuple) 的列表，每個元組包含 (藥材名稱, 劑量)。
        例如：[('當歸', 10.0), ('黃耆', 15.0)]。
    """
    # 初始化一個空列表，用於存放解析後的結果
    pairs = []
    
    # --- 邏輯分支一：處理字典列表格式 ---
    # 檢查輸入的 data 是否為列表，且列表中的所有項目都是字典
    if isinstance(data, list) and all(isinstance(item, dict) for item in data):
        # 遍歷列表中的每一個字典項目
        for item in data:
            # 使用 .get() 方法安全地獲取值，如果鍵不存在則回傳 None
            herb_name = item.get("藥材")
            dose_str = item.get("劑量")
            
            # 確保藥材名稱和劑量的值都存在且不為空
            if herb_name and dose_str:
                # 過濾掉明確標示為不需用藥的項目
                if "不需使用" in herb_name or "暫不" in herb_name:
                    continue # 跳過此次迴圈，處理下一個項目
                
                # 使用 try-except 區塊來處理劑量可能不是有效數字的情況
                try:
                    # 嘗試將劑量字串轉換為浮點數
                    dose = float(dose_str)
                    # 將 (藥材名稱, 劑量) 的元組加入到結果列表中
                    pairs.append((herb_name, dose))
                except (ValueError, TypeError):
                    # 如果轉換失敗 (例如劑量是 "未知")，則在伺服器端印出警告
                    print(f"      - 警告：無法將劑量 '{dose_str}' 轉換為浮點數，略過此藥材。")
            else:
                # 如果字典中缺少必要的鍵，也在伺服器端印出警告
                print("      - 警告：字典中缺少 '藥材' 或 '劑量' 鍵，略過此項目。")
                
    # --- 邏輯分支二：處理純文字字串格式 ---
    # 檢查輸入的 data 是否為字串
    elif isinstance(data, str):
        # 如果整個字串明確標示為不需用藥，則直接回傳空列表
        if "不需使用" in data or "暫不" in data:
            return []
            
        # 定義正規表示法樣式：
        # (\S+)      : 捕獲一個或多個非空白字元 (藥材名稱)
        # \s* : 匹配零個或多個空白字元
        # (\d+(\.\d+)?) : 捕獲一個或多個數字，可選地包含一個小數點和後面的數字 (劑量)
        # g?         : 匹配一個可選的 'g' 字元
        pattern = r'(\S+)\s*(\d+(\.\d+)?)g?'
        # 找出所有符合樣式的匹配項
        matches = re.findall(pattern, data)
        # 遍歷所有匹配結果
        for match in matches:
            herb_name = match[0] # 第一個捕獲組是藥材名稱
            dose_str = match[1]  # 第二個捕獲組是劑量字串
            try:
                # 嘗試將劑量字串轉換為浮點數
                dose = float(dose_str)
                pairs.append((herb_name, dose))
            except (ValueError, TypeError):
                # 如果轉換失敗，印出警告
                print(f"      - 警告：無法將劑量 '{dose_str}' 轉換為浮點數，略過此藥材。")
                
    # --- 邏輯分支三：處理未知格式 ---
    else:
        # 如果輸入的資料類型不是預期的 list 或 str，則印出警告
        print(f"    - 警告：無法解析的資料格式：{type(data)}")

    # 回傳最終解析完成的列表
    return pairs