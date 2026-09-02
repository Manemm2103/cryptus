# Cryptus

Cryptus ist ein kleiner Docker-basierter Zwei-Personen-Chat für `User A` und `User B`.
Beide Benutzer haben unterschiedliche Passwörter, die per Environment gesetzt werden.

## Funktionen

- Login nur über das Passwort; der Server erkennt daran automatisch `User A` oder `User B`
- unterschiedliche Passwörter über `USER_A_PASSWORD` und `USER_B_PASSWORD`
- Nachrichten bleiben lesbar, bis die Gegenseite auf `Gelesen` klickt
- gelesene Nachrichten werden in der Historie unkenntlich gemacht
- Tippanzeige, wenn die Gegenseite gerade schreibt
- Bildnachrichten mit JPEG, PNG, WebP und GIF
- Bilder werden nach dem Lesen vom Server gelöscht
- größere Emoji-Auswahl direkt im Composer
- keine externen npm-Abhängigkeiten

## Lokal mit Docker starten

```powershell
Copy-Item .env.example .env
notepad .env
docker compose up --build
```

Danach im Browser öffnen:

```text
http://localhost:3000
```

## Portainer

Nutze `docker-compose.portainer.yml` als Stack-Datei und setze mindestens diese Stack-Variablen:

```text
USER_A_PASSWORD=...
USER_B_PASSWORD=...
```

Optional:

```text
CRYPTUS_PORT=3000
MAX_UPLOAD_MB=8
SESSION_TTL_HOURS=12
USER_A_LABEL=User A
USER_B_LABEL=User B
```

Wenn Portainer den Stack direkt aus einem Git-Repository baut, kann `build: .` so bleiben.
Falls dein Portainer-Setup nicht lokal bauen darf, baue und pushe vorher ein Image und ersetze `image: cryptus:latest` durch dein Registry-Image.

## Projekt nach GitHub pushen

Das Repository auf GitHub heißt standardmäßig `cryptus`.
Wenn es schon existiert, reicht dein GitHub-Benutzername oder Organisationsname:

```powershell
.\scripts\push.ps1 -GithubOwner DEIN-NAME
```

Alternativ kannst du die komplette Remote-URL angeben:

```powershell
.\scripts\push.ps1 -RemoteUrl https://github.com/DEIN-NAME/cryptus.git
```

Wenn du die GitHub CLI (`gh`) installiert und eingeloggt hast, kann das Skript das private Repo auch erstellen:

```powershell
.\scripts\push.ps1 -GithubOwner DEIN-NAME -CreateRepo
```

Nach dem ersten Push reicht meistens:

```powershell
.\scripts\push.ps1
```

## Sicherheitshinweis

Cryptus schützt den Zugang über zwei Server-Passwörter und entfernt gelesene Inhalte.
Es ist in dieser Version keine echte Ende-zu-Ende-Verschlüsselung wie bei Signal.
Für produktiven Betrieb sollte die App hinter HTTPS laufen, zum Beispiel hinter Traefik, Caddy, Nginx Proxy Manager oder einem Portainer-Stack mit Reverse Proxy.
