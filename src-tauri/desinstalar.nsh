; Al desinstalar en Windows, quita también el arranque automático.
!macro NSIS_HOOK_PREUNINSTALL
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "alba"
!macroend
