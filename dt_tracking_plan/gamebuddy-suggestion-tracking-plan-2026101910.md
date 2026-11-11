## 埋点事件表

| 触发时机 trigger | 示意图 ui | 事件 event_code | 页面 dt_pgid | 元素 dt_eid | 私有参数 udf_kv | 说明 remark |
|----------|:----:|---------|---------|:------------:|-------|-------|
| 应用完成启动时 | — | `app_start` 应用启动 | `desktop` 桌面端 | — | `surface` 表面 | 沿用已有上报，参数保持 surface=desktop |
| 本机第一次生成设备标识后 | — | `first_open` 首次启动 | `desktop` 桌面端 | — | `surface` 表面 | 只在设备标识文件不存在时上报一次 |
| 应用退出前 | — | `dt_appout` 应用切后台 | `desktop` 桌面端 | — | `stay_duration` 停留时长(ms) | 从本次启动到退出 |
| 主面板加载完成时 | — | `dt_pgin` 页面曝光 | `main_panel` 主面板 | — | — | 重复显示不重复上报，直到离开 |
| 主面板被隐藏或关闭时 | — | `dt_pgout` 页面结束曝光 | `main_panel` 主面板 | — | `stay_duration` 页面停留时长(ms) | — |
| 悬浮桌宠展示时 | — | `dt_pgin` 页面曝光 | `pet` 悬浮桌宠 | — | — | 重复置顶不重复上报，直到隐藏 |
| 悬浮桌宠被隐藏时 | — | `dt_pgout` 页面结束曝光 | `pet` 悬浮桌宠 | — | `stay_duration` 页面停留时长(ms) | — |
| 本次启动第一次进入实时对局，或退出时仍未进入 | — | `bridge_connect_result` 对局接入结果 | — | — | `result` 结果 | success 或 fail，每次启动只上报一次 |
| 桌宠展示一条新的决策建议时 | — | `dt_imp` 元素曝光 | `pet` 悬浮桌宠 | `suggestion_card` 建议卡 | `feature_name` 决策场景；`source` 建议来源 | feature_name 为 card_reward、map_route、rest_site、event_choice、shop_choice；source 为 rules 或 llm |
| 桌宠自动打开遭遇攻略时 | — | `dt_imp` 元素曝光 | `pet` 悬浮桌宠 | `encounter_guide` 遭遇攻略 | `feature_name` 决策场景；`source` 建议来源 | feature_name 固定 encounter_guide |
| 决策复核请求成功返回或抛错退回规则时 | — | `llm_review_result` LLM复核结果 | — | — | `feature_name` 决策场景；`result` 结果 | result 为 success 或 fallback；未发起复核不上报 |
