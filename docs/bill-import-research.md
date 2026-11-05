# 账单导入研究资料

调研日期：2026-11-04。个人对账账单与商家结算账单不同，研究范围为个人账单。

当前格式支持、字段方向、账户映射、去重、隐私边界与撤销规则统一维护于 [Wiki：账单导入](wiki/bill-import.md)。此页保留研究来源和兼容依据，原路径继续可用。

## 查阅的社区原始实现

- [china_bean_importers](https://github.com/jiegec/china_bean_importers)：微信、支付宝手机端与招行借记卡导入器；账户尾号匹配、平台与银行卡重叠流水的处理思路。
- [double-entry-generator](https://github.com/deb-sig/double-entry-generator)，调研版本 `97a4f653347dcacfc383580ab00d78d7e8eeda8f`：阅读 `pkg/provider/{wechat,alipay,cmb}`、对应文档及公开 CSV/XLSX 样例。招行储蓄卡与信用卡的符号方向相反，信用卡月日需要账单年月。
- [bill-file-converter](https://github.com/deb-sig/bill-file-converter)，调研版本 `3fbf237166aab5aaa5ad5394c7675b7f4ec0c79b`：阅读招行 PDF 的表头坐标、换行与分页处理，使用其公开的脱敏 TextItem fixtures 与期望 CSV 逐行比对。本项目自行实现解析，没有复制社区源码或真实用户账单。
- [SheetJS 安装文档](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/)：使用官方发布的 0.20.3，而非 npm 旧版 0.18.5。
- [Mozilla PDF.js](https://mozilla.github.io/pdf.js/examples/)：浏览器读取 PDF 文本，worker 同源提供，不执行文档脚本。

## 兼容依据与限制

研究使用社区公开的四类来源 CSV、微信 XLSX，以及招行公开脱敏 PDF 文本 fixtures；本项目测试采用公开脱敏数据或合成数据，不以真实用户文件作通用兼容承诺。PDF 版式、表头和账单月份识别仍须由用户在预览中核对。

解析测试与数据库事务验证入口见 [Wiki：账单导入](wiki/bill-import.md)。历史研究和验证不代表本次运行结果。
