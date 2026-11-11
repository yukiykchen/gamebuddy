## 1. Windows pointer

- [x] 1.1 在 Windows 上由主进程采样光标并让弹幕页命中测试，命中弹幕或发弹幕区域时关闭穿透。

## 2. Package

- [x] 2.1 用当前 Mod 源码重新编译，并更新 distribution 中的预编译 Bridge。
- [x] 2.2 将安装包版本标为 0.2.0，生成本地 Windows 安装包、Mod 压缩包和校验值。
- [x] 2.3 打出 0.2.2（含退出进程、共享弹幕默认地址、NSIS CRCCheck off），并装入应用宝 Wine 安装目录。

## 3. Packaged defaults

- [x] 3.1 把共享弹幕服务地址写成代码默认值，安装包不依赖本机 `.env`；环境变量仍可覆盖。

## 4. Quit and installer integrity

- [x] 4.1 桌宠菜单「关闭」改为退出整个应用进程。
- [x] 4.2 NSIS 关闭 CRC 完整性校验，避免 macOS 交叉打包后安装/卸载报 integrity check failed。
