# 🎮 PocketPad

**Transforme ton smartphone en manette pour jeux PC.** Une manette Xbox 360 virtuelle est créée sur ton ordinateur ; ton téléphone (navigateur, rien à installer) envoie les entrées en temps réel : sticks analogiques, croix directionnelle, A/B/X/Y, LB/RB, LT/RT, Start/Back/Guide, retour de vibration.

| Mode | Comment ça marche | Latence |
|---|---|---|
| 🔌 **Câble USB** | `adb reverse` : le téléphone parle au PC par le câble (Android) ou via le partage de connexion USB | la plus basse |
| 📶 **Wi-Fi / Ethernet** | Le téléphone ouvre le lien affiché (ou le QR code) sur le même réseau | très basse |
| 🔵 **Bluetooth** | Via le partage de connexion Bluetooth (PAN) : le PC et le téléphone forment un réseau, même lien | basse |
| 🌍 **Internet** | Un petit relais (`pocketpad-relay`) sur un VPS met en relation PC et téléphone, sans ouvrir de port | dépend du réseau |

## Installation

```bash
git clone <ce-dépôt> && cd pocketpad
pip install -e ".[windows,qr]"      # Windows  (installe vgamepad + driver ViGEmBus)
pip install -e ".[linux,qr]"        # Linux    (uinput : accès à /dev/uinput requis)
pip install -e ".[keyboard,qr]"     # autre / jeux sans manette : émulation clavier
```

> **Windows** : le driver [ViGEmBus](https://github.com/nefarius/ViGEmBus/releases) est requis ; `vgamepad` propose de l'installer.

## Utilisation

```bash
pocketpad                # Wi-Fi / Bluetooth PAN : affiche les liens + un QR code
pocketpad --usb          # + mode câble USB (nécessite adb, Android platform-tools)
pocketpad --backend keyboard   # émulation clavier (ZQSD = stick gauche, etc.)
```

Ouvre le lien sur le téléphone (il contient une clé d'appairage aléatoire), mets-le en paysage, touche **Plein écran**. C'est prêt : lance ton jeu.

### 🔌 USB
1. Active le *débogage USB* sur le téléphone Android et branche le câble.
2. `pocketpad --usb` puis ouvre `http://localhost:8765/?key=…` sur le téléphone.
   (iPhone : active le partage de connexion USB, puis utilise le lien « Réseau » affiché.)

### 🔵 Bluetooth
Associe le téléphone et le PC en Bluetooth, active le **partage de connexion Bluetooth** sur le téléphone, puis utilise le lien du réseau Bluetooth affiché par `pocketpad`.
*Le Bluetooth sert ici de transport réseau ; il n'est pas émulé comme manette HID.*

### 🌍 Internet
Sur un serveur (VPS), derrière HTTPS/WSS (Caddy, nginx, Cloudflare Tunnel…) :
```bash
pocketpad-relay --port 9000
```
Sur le PC :
```bash
pocketpad --relay wss://relais.exemple.com --room monsalon
```
Ouvre le lien `https://relais.exemple.com/?room=monsalon&key=…` sur le téléphone. Le PC se connecte *vers* le relais : aucune redirection de port.

## Protocole (WebSocket JSON)
```json
{"t":"s","b":["a","up"],"lx":0.0,"ly":1.0,"rx":0,"ry":0,"lt":0,"rt":1}
```
`t:"s"` = état complet (boutons actifs `b`, sticks −1…1, gâchettes 0…1), `ping/pong` = latence, `rumble` = vibrations PC → téléphone. Toutes les entrées sont validées et bornées côté serveur ; tous les boutons sont relâchés à la déconnexion.

## Sécurité
- Clé d'appairage aléatoire obligatoire (`--key` pour la fixer).
- Sur réseau non fiable ou Internet, utilise **toujours TLS** (WSS).
- Ne transmet que des états de manette, jamais de fichiers ni de commandes système.

## Tests
```bash
pip install -e ".[dev]" && pytest
```

## Feuille de route
Multi-joueurs (1 téléphone = 1 manette), gyroscope, profils de disposition, exécutable Windows (PyInstaller), appli de bureau avec interface.

## Licence
MIT
