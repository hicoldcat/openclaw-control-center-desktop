!macro customHeader
  !define MUI_WELCOMEPAGE_TITLE "欢迎安装 OpenClaw 桌面端"
  !define MUI_WELCOMEPAGE_TEXT "该向导将引导你完成 OpenClaw Control Center Desktop 的安装。$\r$\n$\r$\n建议先关闭其他程序再继续。"
  !define MUI_FINISHPAGE_RUN_TEXT "安装完成后立即启动 OpenClaw 桌面端"
!macroend

!macro customWelcomePage
  !insertmacro MUI_PAGE_WELCOME
!macroend
