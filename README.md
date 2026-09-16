# BELGRAVIA — Recensement & qualification terrain

Application de recensement des points de vente et qualification commerciale
pour la marque de cocktails RTD BELGRAVIA. Voir `docs/cahier-des-charges.md`
pour le détail fonctionnel complet.

Deux espaces :
- **`/terrain`** — PWA mobile pour les commerciaux (formulaire en 4 sections, fonctionne hors-ligne).
- **`/dashboard`**, **`/statistiques`**, **`/utilisateurs`** — Espace admin.

## Mise en route (avec Supabase + hébergement LWS)

### 1. Base de données — Supabase

1. Crée un projet sur [supabase.com](https://supabase.com) (gratuit pour démarrer).
2. Dans **Project Settings > Database > Connection string**, récupère :
   - la chaîne **poolée** (Supavisor, port `6543`) → `DATABASE_URL`
   - la chaîne **directe** (port `5432`) → `DIRECT_URL`
3. Colle-les dans `.env` (voir `.env.example` pour le format exact avec `?pgbouncer=true`).

### 2. Stockage des photos — hébergement LWS (FTP/SFTP)

1. Dans ton panneau LWS, récupère les identifiants FTP/SFTP (hôte, utilisateur,
   mot de passe) — section "FTP" ou "Comptes FTP" de l'espace client.
2. Repère le **dossier public** de ton hébergement (celui servi par ton nom de
   domaine) — généralement `www/` sur un mutualisé LWS classique. Crée-y (ou
   laisse l'app créer automatiquement) un sous-dossier `uploads/`.
3. Renseigne dans `.env` :
   - `SFTP_HOST`, `SFTP_USER`, `SFTP_PASSWORD` (identifiants FTP/SFTP LWS)
   - `SFTP_REMOTE_DIR="www/uploads"` (adapte si ton dossier public a un autre nom)
   - `SFTP_PUBLIC_URL_BASE="https://tondomaine.fr/uploads"`
4. Laisse `STORAGE_DRIVER="sftp"`.

> Vérifie bien le nom exact du dossier public dans la doc LWS de ton offre
> (mutualisé vs VPS) : certaines offres utilisent `www/`, d'autres la racine
> du compte FTP directement. Si le dossier n'existe pas encore, l'app le crée
> automatiquement au premier upload (`SFTP_REMOTE_DIR`), mais elle ne peut pas
> deviner l'URL publique correspondante — c'est à toi de renseigner
> `SFTP_PUBLIC_URL_BASE` correctement.

### 3. Installation et lancement

```bash
npm install
cp .env.example .env   # renseigner les variables ci-dessus + SESSION_SECRET
npx prisma migrate dev --name init
npx prisma db seed
npm run dev
```

Comptes créés par le seed :
- Admin : `admin@belgravia.local` / `belgravia-admin`
- Commercial : `agent1` / `1234`

**À changer en production** : ces mots de passe de démonstration, et
`SESSION_SECRET` (chaîne aléatoire longue).

## Déploiement (Vercel)

Le projet est un Next.js standard, prêt à déployer sur Vercel.

1. **Créer un dépôt GitHub** et y pousser le code (un dépôt Git local est déjà
   initialisé dans ce dossier avec un premier commit) :
   ```bash
   git remote add origin https://github.com/<ton-compte>/<ton-repo>.git
   git push -u origin main
   ```
2. Sur [vercel.com](https://vercel.com), clique **Add New > Project**, choisis
   ce dépôt GitHub. Vercel détecte automatiquement Next.js.
3. Avant de cliquer "Deploy", renseigne les **variables d'environnement**
   (Settings > Environment Variables), avec exactement les mêmes valeurs que
   dans ton `.env` local :
   - `DATABASE_URL`, `DIRECT_URL` (Supabase)
   - `SESSION_SECRET`
   - `STORAGE_DRIVER=sftp` + `SFTP_HOST`, `SFTP_USER`, `SFTP_PASSWORD`,
     `SFTP_REMOTE_DIR`, `SFTP_PUBLIC_URL_BASE`
4. Déploie. Le `postinstall` du projet lance automatiquement
   `prisma generate` — aucune action supplémentaire requise pour ça.
5. **Les tables ne sont pas créées automatiquement par Vercel.** Si ce n'est
   pas déjà fait sur ta base Supabase, lance une fois depuis ton poste (avec
   le même `.env`) :
   ```bash
   npx prisma migrate deploy
   npx prisma db seed
   ```

### À savoir une fois en ligne

- **Domaine** : Vercel fournit une URL `*.vercel.app` par défaut ; un nom de
  domaine personnalisé peut être ajouté ensuite dans Settings > Domains.
- **Flux temps réel (SSE)** : les fonctions serverless Vercel ont une durée
  maximale d'exécution (limitée sur le plan Hobby). Le projet demande déjà la
  durée maximale disponible (`maxDuration`), et le navigateur reconnecte
  automatiquement le flux si la connexion est coupée — donc aucune action
  requise, mais c'est pour ça qu'un badge "nouvelle visite" peut mettre
  quelques secondes à réapparaître après une reconnexion.
- **Chaque `git push` sur `main`** déclenche un nouveau déploiement
  automatique — c'est ce qui permet de continuer le développement au fur et
  à mesure, comme prévu.



- Authentification par rôle (Admin / Commercial), sessions révocables en base.
- Formulaire terrain complet (sections 1 à 4 du cahier des charges) : date/heure/agent
  automatiques, capture photo, capture GPS, résolution automatique de la ville
  (best-effort, avec repli manuel), marques multi-sélection + 3 champs libres,
  grille jours/créneaux d'affluence, qualification commerciale.
- **Mode hors-ligne** : si le réseau est coupé au moment d'enregistrer une visite,
  elle est conservée dans IndexedDB (`lib/offlineQueue.ts`) et synchronisée
  automatiquement dès le retour de la connexion (ou via le bouton "Synchroniser"
  affiché sur `/terrain`). Un service worker (`public/sw.js`) met en cache l'app
  shell pour un chargement possible hors-ligne.
- Idempotence des écritures terrain (`uuidClient`) : une visite rejouée après
  coupure réseau n'est jamais dupliquée en base.
- Dashboard admin avec réception **temps réel** (Server-Sent Events), filtres
  (ville, type, potentiel, recherche), fiche détail par point de vente.
- **Statistiques & carte** (`/statistiques`) : indicateurs clés, répartitions
  (potentiel, type, ville, agent), carte des points de vente (Leaflet/OpenStreetMap).
- **Export CSV** de toutes les visites (bouton sur le dashboard et sur les statistiques).
- Gestion des comptes commerciaux (création, activation/désactivation).
- Référentiels (villes, types d'établissement, marques) en base, gérables
  sans redéploiement — aucune valeur codée en dur dans le code.
- **Stockage photo** piloté par variable d'environnement `STORAGE_DRIVER` :
  `local` (disque du serveur, dev), `sftp` (dossier public d'un hébergement
  LWS — voir ci-dessus) ou `s3` (bucket S3-compatible : AWS S3, Cloudflare R2,
  MinIO...). Voir `.env.example` pour les variables requises par driver.

## Points d'attention avant une mise en production à grande échelle

1. **Temps réel multi-instance** : le flux SSE utilise un bus d'événements en
   mémoire (`lib/events.ts`), qui fonctionne pour une seule instance de serveur.
   Pour un déploiement avec plusieurs instances (scaling horizontal), prévoir un
   pub/sub partagé (Redis, Postgres LISTEN/NOTIFY).
2. **Driver SFTP (LWS)** : chaque photo ouvre et referme une connexion SFTP
   (`lib/storage.ts`), ce qui est simple et fiable pour un volume terrain
   normal, mais plus lent qu'un vrai stockage objet et dépendant des limites
   de connexions FTP simultanées de l'offre LWS. Si le volume de photos monte
   fortement, basculer vers `STORAGE_DRIVER=s3` (Cloudflare R2 par exemple)
   sans changer le reste du code applicatif.
2. **Tuiles de carte** : `components/CarteBelgravia.tsx` utilise les tuiles
   OpenStreetMap publiques (`tile.openstreetmap.org`), adaptées à un usage
   léger/démo. Pour un trafic important en production, passer par un fournisseur
   de tuiles dédié (MapTiler, Mapbox, etc.) conformément à la politique d'usage
   d'OpenStreetMap.
3. **Icônes PWA** : icônes 192/512 générées à titre de placeholder
   (`public/icon-192.png`, `public/icon-512.png`) — à remplacer par le logo
   officiel BELGRAVIA.
4. **Synchronisation hors-ligne** : la file d'attente couvre le cas "j'ai rempli
   le formulaire sans réseau, puis je le renvoie plus tard". Elle ne couvre pas
   un scénario de navigation 100% hors-ligne prolongée sur plusieurs jours avec
   changement d'appareil — dans ce cas, prévoir une politique d'expiration/purge
   de la file locale.
5. Détail de commande (produits/quantités) si le point de vente veut commander —
   volontairement hors périmètre V1 (cf. cahier des charges), la structure de
   données permet de l'ajouter sans tout refondre.
