; Also install a Windows screen saver: "Living Space.scr" is the app itself, which
; recognises the /s (show), /c (configure) and /p (preview) screen-saver arguments.
; Right-click it in the install folder → Install, or pick it in Screen Saver Settings.
!macro customInstall
  CopyFiles /SILENT "$INSTDIR\Living Space.exe" "$INSTDIR\Living Space.scr"
!macroend
!macro customUnInstall
  Delete "$INSTDIR\Living Space.scr"
!macroend
