## 1. 本机记录

- [x] 1.1 增加不依赖游戏程序集的记录类，把确认的读档追加到指定目录的 `save-loads.json`，包含 `gamebuddy.save-load.v1`、累计次数、序号和 UTC 时间，并用临时文件替换。用 `dotnet run --project mod/GameBuddyBridge.Tests` 验证连续两次记录、损坏 JSON 后的下一次成功写入，以及写失败不抛出。
- [x] 1.2 在 `SaveManager.IncrementNumReloads` 上注册只读 postfix，把记录写到 Mod 程序集目录。补丁失败只写 `GameBuddyBridge.log`，不阻断其余采集，也不改游戏存档。用本机 STS2 程序集执行 `dotnet build mod/GameBuddyBridge/GameBuddyBridge.csproj -c Release -p:Sts2Dir="/Users/houwenhao/Applications/steam/steamapps/common/Slay the Spire 2"` 确认编译通过。

## 2. 边界

- [x] 2.1 确认状态和事件协议不新增读档字段，桌面端不读取、不展示、不上传该文件。运行 `npm run harness:validate-protocol` 和 `npm run spec:validate`。
