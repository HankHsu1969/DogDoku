# 汪汪數獨 Dogdoku

可愛狗狗版的邏輯解謎（玩法類似 Meowdoku / Queens），共 50 關，桌機與手機都能玩。

**線上試玩：https://hankhsu1969.github.io/DogDoku/**

## 規則
1. 每個顏色區塊放 1 隻狗
2. 每一橫列、每一直行各放 1 隻狗
3. 狗狗不能相鄰（斜角也不行）

點格子放狗狗，放錯扣一顆愛心（共 3 顆）；長按、右鍵或切到「標記」模式可以畫 ✕，拖曳可連續標記。
骨頭提示會直接放好一隻狗，三星過關可再拿一根。鍵盤：方向鍵移動、空白鍵放狗、X 標記、Z 復原、H 提示、M 切換模式。

## 執行
直接用瀏覽器開 `index.html` 即可（字型需連網，離線會改用系統字型）。
開發時建議用不快取的本機伺服器：

```bash
python tools/serve.py 8765
```

## 檔案
| 路徑 | 內容 |
|---|---|
| `index.html`, `css/style.css` | 畫面與樣式 |
| `js/game.js` | 遊戲邏輯、存檔（localStorage）、輸入、動畫 |
| `js/audio.js` | Web Audio 即時合成的音樂與音效，沒有任何音檔：主選單一首，加上每章一首柔和的多聲部配樂（午後爵士、圓舞曲、搖籃曲、Bossa Nova、海邊 Lo-fi） |
| `js/levels.js` | 50 關資料（由產生器輸出） |
| `tools/gen_levels.js` | 關卡產生器：確保每關唯一解且可純邏輯推理，依難度排序 |
| `tools/build_artifact.py` | 輸出 `dist/`，用來發佈成線上版本 |
| `assets/img/` | 角色、各章過關慶祝圖與主視覺（Higgsfield GPT Image 2 產生、去背） |

重新產生關卡：`node tools/gen_levels.js`（固定亂數種子，結果可重現）。
