图示：

<img width="227" height="311" alt="image" src="https://github.com/user-attachments/assets/cc4a4b8c-a40b-443f-aca7-142d40eaa4b3" />

<img width="547" height="744" alt="image" src="https://github.com/user-attachments/assets/fc4781f9-e93e-4ba9-bf8c-79207994cc6e" />


# Price Dashboard

实时加密货币和股票价格监控浏览器扩展

## 功能

- 实时显示加密货币价格（OKX API）
- 实时显示股票价格（Yahoo Finance API）
- 支持的加密货币：BTC, ADA, OKB, PAXG, BNB
- 支持的股票：AAPL, GOOGL, NVDA
- 可自定义每项资产的持有数量并自动保存
- 可在设置中添加数字货币（OKX）或美股（Yahoo Finance）
- 根据自定义持有数量计算组合资产总额
- 通过 USD/CNY 汇率换算人民币，行情不可用时使用默认汇率 7.20
- 默认持仓：ADA 10000、OKB 100，其余为 0
- 每 5 分钟自动刷新价格和汇率，也支持手动刷新
- 主界面顶部单行显示组合资产总额，下方按两列展示 Symbol 和 Price
- 设置页可分别选择标的物价格币种和资产总额币种，默认分别为美元 USD 和人民币 CNY
- 设置页集中管理持有数量、自定义标的物、刷新状态、汇率和 OKX/Yahoo Finance 价格来源

## 安装

1. 下载或克隆本仓库
2. 打开 Chrome 浏览器，访问 `chrome://extensions/`
3. 开启"开发者模式"
4. 点击"加载已解压的扩展程序"
5. 选择本目录

## 使用

点击浏览器工具栏中的扩展图标即可查看价格和资产总额。在“持有数量”中输入资产数量，总额会即时更新，并保存到浏览器本地。

## API

- OKX API: https://www.okx.com/api/v5/market/tickers
- Yahoo Finance API: https://query1.finance.yahoo.com/v8/finance/chart/

## 开发

- `manifest.json` - 扩展配置
- `background.js` - 后台服务脚本
- `popup.html` - 弹窗页面
- `popup.css` - 弹窗样式
- `portfolio.js` - 持仓计算逻辑
- `popup.js` - 弹窗逻辑

## License

MIT
