# BeninSpeed

Test de vitesse Internet mobile-first pour le Bénin (et Afrique de l’Ouest).

## Fonctionnalités

- Mesure réelle : Ping, Download, Upload, Jitter
- Écran de résultats pro + partage / copie
- Sélection de serveur (prêt pour multi-serveurs)
- Détection ISP / opérateur
- Historique local des tests (localStorage)
- Interface mobile soignée

## Lancer localement

```bash
npm install
npm start
```

Puis ouvrir `http://localhost:8080`.

**Attention :** lancé sur le même appareil que celui qui fait le test, le serveur local ne mesure pas la vitesse Internet réelle.  
Pour un vrai test, déployer sur un VPS distant.

## Endpoints

- `GET /api/ping` → latence
- `GET /api/download?bytes=N` → téléchargement
- `POST /api/upload` → envoi

## Déploiement recommandé

1. VPS proche des utilisateurs (Bénin / Afrique de l’Ouest)
2. HTTPS obligatoire en production
3. Débit sortant suffisant (au moins 100–200 Mbps idéalement)

### Exemples de plateformes simples

- **Railway / Render / Fly.io** → très rapide à déployer
- **VPS** (Contabo, Hetzner, OVH, DigitalOcean…) → plus de contrôle

## Structure

```
BeninSpeed/
├── package.json
├── server/server.js
└── public/
    ├── index.html
    ├── app.js
    └── style.css
```
