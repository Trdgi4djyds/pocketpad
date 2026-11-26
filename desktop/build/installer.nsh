; Installation administrateur (une seule demande UAC) :
;  - règles de pare-feu : téléphones et TV en Wi-Fi (ports 47800 à 47809) et diffusion d'écran (UDP) ;
;  - pilote ViGEmBus (manettes virtuelles Xbox 360 / DualShock 4) s'il est absent.
!macro customInstall
  nsExec::Exec 'netsh advfirewall firewall delete rule name=PocketPadHub'
  nsExec::Exec 'netsh advfirewall firewall add rule name=PocketPadHub dir=in action=allow protocol=TCP localport=47800-47809'
  nsExec::Exec 'netsh advfirewall firewall delete rule name=PocketPadHubApp'
  nsExec::Exec 'netsh advfirewall firewall add rule name=PocketPadHubApp dir=in action=allow enable=yes program="$INSTDIR\${APP_EXECUTABLE_FILENAME}"'
  ReadRegStr $0 HKLM "SYSTEM\CurrentControlSet\Services\ViGEmBus" "ImagePath"
  ${If} $0 == ""
    MessageBox MB_YESNO|MB_ICONQUESTION "PocketPad Hub a besoin du pilote ViGEmBus pour que Windows et les jeux (GTA V…) reconnaissent votre téléphone comme une vraie manette Xbox.$\r$\n$\r$\nL'installer maintenant ?" IDNO pocketpad_skip_vigem
      ExecWait '"$INSTDIR\resources\vendor\ViGEmBus_Setup.exe"'
    pocketpad_skip_vigem:
  ${EndIf}
!macroend

!macro customUnInstall
  nsExec::Exec 'netsh advfirewall firewall delete rule name=PocketPadHub'
  nsExec::Exec 'netsh advfirewall firewall delete rule name=PocketPadHubApp'
!macroend
