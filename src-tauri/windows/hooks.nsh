!macro NSIS_HOOK_POSTINSTALL
  CreateShortCut "$DESKTOP\EasyCLI.lnk" "$INSTDIR\EasyCLI.exe"
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  Delete "$DESKTOP\EasyCLI.lnk"
!macroend
