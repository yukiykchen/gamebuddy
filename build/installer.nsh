; macOS 交叉打包时，electron-builder 对 PE 的后处理会弄坏 NSIS 末尾 CRC，
; 安装尤其是卸载会弹出 “Installer integrity check has failed”。
; 正式 Windows CI 产物仍应优先在 Windows 上构建；本地/应用宝交付关闭 CRC。
!macro customHeader
  CRCCheck off
!macroend

!macro customCheckAppRunning
  ; The default check asks PowerShell whether any process path starts with the
  ; install directory. 应用宝 Wine reports that query as successful even when
  ; GameBuddy.exe is not running, so the installer cannot continue.
  ; Match the executable name in tasklist output instead, and ignore a failed
  ; or empty command.
  nsExec::ExecToStack `"$SYSDIR\cmd.exe" /C tasklist /FI "IMAGENAME eq ${APP_EXECUTABLE_FILENAME}" /FO CSV /NH`
  Pop $0
  Pop $1
  StrCpy $2 "$\"${APP_EXECUTABLE_FILENAME}"
  StrLen $3 $2
  StrCpy $4 $1 $3
  ${If} $4 == $2
    MessageBox MB_OKCANCEL|MB_ICONEXCLAMATION "$(appRunning)" /SD IDOK IDOK customStopApp
    Quit
    customStopApp:
      nsExec::Exec `taskkill /F /IM "${APP_EXECUTABLE_FILENAME}"`
      Sleep 500
  ${EndIf}
!macroend

; 桌面端装完后，让用户选择 STS2 根目录并拷贝内置 Bridge。静默安装跳过。
!macro customInstall
  IfSilent bridge_done

  bridge_pick:
    nsDialogs::SelectFolderDialog "请选择《杀戮尖塔 2》游戏根目录（含 SlayTheSpire2.exe 的文件夹）" ""
    Pop $R8
    ${If} $R8 == "error"
      MessageBox MB_YESNO|MB_ICONQUESTION "未选择游戏目录。是否跳过 Bridge Mod 安装？$\r$\n可稍后把安装目录下 resources\bridge 复制到游戏 mods\GameBuddyBridge。" IDYES bridge_done IDNO bridge_pick
    ${EndIf}

    IfFileExists "$R8\SlayTheSpire2.exe" bridge_copy 0
    IfFileExists "$R8\data_sts2_windows_x86_64" bridge_copy 0

    MessageBox MB_YESNO|MB_ICONEXCLAMATION "所选目录不像《杀戮尖塔 2》根目录。$\r$\n是否重新选择？" IDYES bridge_pick IDNO bridge_done
    Goto bridge_done

  bridge_copy:
    CreateDirectory "$R8\mods"
    CreateDirectory "$R8\mods\GameBuddyBridge"
    ClearErrors
    CopyFiles /SILENT "$INSTDIR\resources\bridge\gamebuddy_bridge.dll" "$R8\mods\GameBuddyBridge\"
    CopyFiles /SILENT "$INSTDIR\resources\bridge\GameBuddyBridge.json" "$R8\mods\GameBuddyBridge\"
    IfFileExists "$R8\mods\GameBuddyBridge\gamebuddy_bridge.dll" 0 bridge_copy_fail
    IfFileExists "$R8\mods\GameBuddyBridge\GameBuddyBridge.json" 0 bridge_copy_fail
    MessageBox MB_ICONINFORMATION|MB_OK "已将 GameBuddy Bridge 安装到：$\r$\n$R8\mods\GameBuddyBridge$\r$\n请完整退出并重启游戏后启用该 Mod。"
    Goto bridge_done

  bridge_copy_fail:
    MessageBox MB_ICONEXCLAMATION|MB_OK "Bridge 复制失败。请稍后手动把$\r$\n$INSTDIR\resources\bridge$\r$\n复制到游戏 mods\GameBuddyBridge。"

  bridge_done:
!macroend
