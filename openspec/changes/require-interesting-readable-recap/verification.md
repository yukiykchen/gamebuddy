## Verification

- 最终规则版本recap-29。
- node --test review/recap/editorial.test.js：7/7通过。覆盖名称查询失败保留、低趣味拒绝、措辞拒绝、评审缺失/重复拒绝、错误数值/增量拒绝、满血与数字不符、标题/正文长度、跨引用章节数值。
- 正式RecapStore真实模型重生成：ready，1张“211血磨到1，自己剩28”，趣味2分且wordingOk=true；普通回血候选不凑数。
- 正式结果经src/review-ui.js的renderRecap渲染，确认卡片标题出现在HTML内。属于渲染检查，非实际桌面截图验收。
- 主流程：事实入库→历史摘要→review:getRunRecap→RecapStore→buildRecap→数值/篇幅/措辞检查→模型趣味评审→一次修复→缓存→renderRecap。新版本使旧缓存失效。
- 已结束历史摘要可生成观测复盘，不伪造run.ended；不同故事共享引用不再自动丢卡。
- 仅提交相关文件，未提交其他任务的采集/策略/UI改动。当前应用用户数据未写入离线结果。模型/网络与素材会影响输出，不能承诺任意新局固定三张或固定文案。
