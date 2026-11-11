# 单局详情图片

来源：[Spire Codex 单局详情](https://spire-codex.com/zhs/runs/7fa2f0c9e820e554)、[开发者文档](https://spire-codex.com/zhs/developers)及项目已有本地图鉴的 image_url。

这些为《杀戮尖塔2》的游戏图片，相关权利属于原权利人。图片仅用于GameBuddy对应游戏实体的本地展示，不代表自行创作。每张源地址、字节数和SHA-256见manifest.json。

重新同步：`node scripts/sync-run-detail-assets.js`。仅开发阶段下载公开静态图片，不传输玩家日志；应用运行期不请求图片站。

卡牌使用开发者文档提供的中文完整卡面（`cards-full/stable/zhs/`），分别保存基础版与升级版，只用于列表中的小缩略图，不提供放大。同步范围限定为项目已有图鉴的卡牌ID，不修改图鉴规则或数值。API或本地化文件缺少某个卡面时保存肖像插画作为降级，未知卡使用通用小卡图层。遗物和药水使用实际图标。卡面是图鉴标准版本，本局附魔与费用变化仍以旁边的文字记录为准。
