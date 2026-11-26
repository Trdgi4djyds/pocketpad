; Propose l'installation du pilote ViGEmBus (manettes virtuelles) s'il est absent.
!macro customInstall
  ReadRegStr $0 HKLM "SYSTEM\CurrentControlSet\Services\ViGEmBus" "ImagePath"
  ${If} $0 == ""
    MessageBox MB_YESNO|MB_ICONQUESTION "PocketPad Hub a besoin du pilote ViGEmBus pour que Windows reconnaisse vos téléphones comme de vraies manettes.$\r$\n$\r$\nL'installer maintenant ?" IDNO pocketpad_skip_vigem
      ExecWait '"$INSTDIR\resources\vendor\ViGEmBus_Setup.exe"'
    pocketpad_skip_vigem:
  ${EndIf}
!macroend
