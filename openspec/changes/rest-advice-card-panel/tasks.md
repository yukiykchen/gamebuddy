## 1. 广播与窗口

- [x] 1.1 `publishRecommendation` 对 `rest_site` 走建议卡通道并使用 card 窗口尺寸；`rest.opened` 不清除已发布的休息建议卡。`npm run test:syntax` 通过

## 2. 桌宠建议卡

- [x] 2.1 建议卡支持休息处标题、理由、要点和来源；气泡只保留短提示。关闭按钮仍可收起面板
- [x] 2.2 `setRecommendation` 不再把休息处全文写入气泡

## 3. 验证

- [x] 3.1 运行 `npm run test:syntax` 并通过
- [x] 3.2 在 LIVE 或 Demo 打开休息处：左侧出现与选牌同款建议卡，桌宠气泡不再被长文本挡住
