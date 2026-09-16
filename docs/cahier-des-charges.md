# Cahier des charges — Application de recensement & vente terrain BELGRAVIA

## 1. Contexte

BELGRAVIA est une marque de cocktails RTD (*Ready-To-Drink*) en cours de distribution. Une équipe de commerciaux est déployée sur le terrain pour recenser les points de vente potentiels (bars, caves, restaurants, hôtels, etc.), évaluer leur potentiel commercial et initier la vente des produits BELGRAVIA.

L'entreprise a besoin d'un système digital permettant :
- aux **commerciaux** de recenser rapidement les points de vente depuis le terrain (mobile) ;
- aux **administrateurs** de recevoir ces informations en temps réel et de les analyser.

Ce projet reprend la même architecture technique et le même modèle de gestion des utilisateurs qu'un projet précédent similaire (plateforme PWA terrain + dashboard admin, Next.js/PostgreSQL/Prisma), mais avec **un formulaire métier différent** et **une identité visuelle entièrement nouvelle et distincte**.

## 2. Objectifs du projet

1. Digitaliser le recensement des points de vente sur le terrain.
2. Centraliser en temps réel les données collectées pour analyse.
3. Fournir aux administrateurs une vision claire du potentiel commercial par point de vente, par zone et par agent.
4. Poser les bases d'un futur suivi des ventes/commandes sur ces mêmes points de vente.

## 3. Acteurs et rôles

| Rôle | Description |
|---|---|
| **Commercial (agent terrain)** | Utilise l'application mobile (PWA) pour remplir le formulaire de recensement à chaque visite d'un point de vente. |
| **Admin** | Consulte le dashboard web, reçoit les formulaires en temps réel, analyse les données, gère les comptes commerciaux. |

**Gestion des comptes utilisateurs** : reprendre le même modèle que le projet de référence :
- Connexion **Admin** : identifiant/e-mail + mot de passe.
- Connexion **Commercial** : identifiant + code personnel (ou mot de passe simplifié adapté à un usage mobile terrain).
- Création/désactivation des comptes commerciaux depuis l'espace Admin.
- Historique de connexion et gestion de session (comme dans le modèle de référence).
- Chaque commercial peut être rattaché à une ville / zone d'affectation.

## 4. Périmètre fonctionnel

### 4.1 Application terrain (PWA Commercial) — Formulaire de recensement

Le formulaire est organisé en **4 sections**, remplies dans l'ordre lors de chaque visite.

#### Section 1 — Informations sur le vendeur (agent)
- **Date de la visite** : capturée automatiquement (non modifiable par l'agent).
- **Heure de la visite** : capturée automatiquement.
- **Nom de l'agent commercial** : récupéré automatiquement depuis le compte connecté.

#### Section 2 — Informations sur le point de vente
- Nom de l'établissement *(texte, obligatoire)*
- Nom du vendeur *(texte)*
- Numéro de téléphone du vendeur *(texte, format téléphone)*
- Numéro de téléphone du patron, si différent *(texte, optionnel)*
- Ville : **récupérée automatiquement** (géolocalisation → résolution de la ville, avec liste déroulante de secours si la résolution échoue ou doit être corrigée)
- Quartier : **saisie manuelle** *(texte libre ou liste + "autre")*
- Repère du quartier : **saisie manuelle** *(texte libre, ex. "en face de la pharmacie X")*
- Type d'établissement : **choix unique** parmi :
  - Cave
  - Bar
  - Lounge
  - Snack
  - Restaurant / Fast Food
  - Hôtel
  - Autre *(champ texte libre affiché si sélectionné)*
- **2 emplacements photo** de la devanture du point de vente :
  - Accès direct à l'appareil photo du téléphone (capture instantanée, pas d'upload depuis la galerie comme mode par défaut — l'import galerie peut rester en option de secours).
- **Localisation GPS** : capture automatique des coordonnées exactes (latitude/longitude + précision), déclenchée à l'ouverture de la section ou à la validation du formulaire.
- Statut du point de vente : **choix unique** :
  - Ouvert
  - Fermé temporairement
  - En travaux

#### Section 3 — Offre et potentiel
- Vend des spiritueux ? : **Oui / Non**
- Marques présentes : **sélection multiple** :
  - VK
  - Le Coq
  - Booster (SABC)
  - ICE
  - Autre 1 : *(champ texte libre)*
  - Autre 2 : *(champ texte libre)*
  - Autre 3 : *(champ texte libre)*
- Propose des cocktails ? : **choix unique** : Oui / Non / Intéressé
- Capacité estimée : **choix unique** :
  - Moins de 20 places
  - 20 à 50
  - 50 à 100
  - Plus de 100
- **Jours / heures d'affluence** : interface dédiée permettant de renseigner, pour chaque jour de la semaine (Lundi → Dimanche), une ou plusieurs plages horaires d'affluence (ex. sélection des jours concernés puis, pour chacun, une plage "de … à …" ou des créneaux prédéfinis Matin / Après-midi / Soir). Champ synthétisé en base sous une structure structurée (jour → créneaux), pas en texte libre, pour rester exploitable en analyse.
- Fournisseur actuel : **sélection multiple** (cases à cocher) :
  - Grossiste
  - Marché
  - Livraison directe
  - Ne sait pas

#### Section 4 — Qualification commerciale
- Potentiel estimé : **choix unique** : Fort / Moyen / Faible
- Intéressé par une visite commerciale ? : **Oui / Non**
- Observations : *(texte libre, zone de commentaire)*
- Répondant : **choix unique** :
  - Gérant / Patron
  - Employé
  - Autre : *(champ texte libre)*
- Le client veut passer une commande ? : **Oui / Non**

> Note pour le développeur : si "Oui" à la commande, prévoir un point d'extension pour une future section "détail de commande" (produits/quantités), même si elle n'est pas développée dans cette première version.

### 4.2 Réception en temps réel côté Admin

- Dès la validation d'un formulaire côté commercial (et sa synchronisation réseau), l'information doit apparaître **en temps réel** dans le dashboard Admin (nouvelle entrée dans la liste + compteurs mis à jour), sans rechargement manuel de la page.
- Solution technique proposée : mise à jour live via Server-Sent Events (SSE) ou rafraîchissement automatique à intervalle court (polling), à trancher en phase technique selon la stack retenue.
- Une notification visuelle (badge / toast) doit signaler l'arrivée d'un nouveau formulaire pendant que l'admin est connecté.

### 4.3 Dashboard Admin

- Liste paginée de tous les points de vente recensés, avec recherche et filtres : ville, quartier, type d'établissement, statut, potentiel estimé, agent commercial, période (date de visite), marques présentes.
- Fiche détail d'un point de vente : toutes les données du formulaire + les 2 photos + position sur carte.
- Carte des points de vente recensés (géolocalisation), avec filtre par zone/ville et code couleur par potentiel estimé ou statut.
- Statistiques : nombre de points de vente recensés par agent / par jour / par ville, répartition par type d'établissement, répartition du potentiel estimé, taux d'intérêt pour une visite commerciale, taux d'intention de commande.
- Export des données (Excel/CSV) pour analyse externe.
- Gestion des comptes commerciaux (création, désactivation, affectation à une ville/zone).
- Gestion des référentiels modifiables sans redéploiement (villes, types d'établissement, marques listées par défaut) — même principe que le projet de référence : rien n'est codé en dur.

## 5. Identité visuelle et UX

- **Contrainte explicite : ne pas reprendre l'identité visuelle du projet précédent.** Le style graphique, la palette de couleurs, la typographie et la mise en page des interfaces (PWA terrain et dashboard admin) doivent être clairement différents, de façon à ce que les deux applications ne se ressemblent pas visuellement.
- Palette et ton à définir en cohérence avec l'univers de la marque BELGRAVIA (cocktail RTD) : suggestion d'une direction premium/nocturne (ex. tons profonds, dorés/cuivrés, contrastes marqués) plutôt qu'une direction "corporate" classique — à valider avec les éléments de charte graphique de la marque si disponibles.
- Interface terrain pensée mobile-first, utilisable rapidement en conditions réelles (peu de manipulations, gros boutons, formulaire séquencé par section).
- Interface admin pensée desktop-first, dense en information mais lisible (tableaux, filtres, carte, graphiques).

## 6. Exigences techniques

Reprendre la même architecture éprouvée que le projet de référence, adaptée à ce nouveau contexte métier :

| Couche | Choix |
|---|---|
| Frontend + Backend | Next.js (App Router) + TypeScript — une seule base de code pour la PWA terrain et le dashboard admin |
| Base de données | PostgreSQL |
| ORM | Prisma (migrations versionnées, aucune donnée de configuration codée en dur : villes, types d'établissement, marques) |
| Stockage des photos | Service compatible S3 (ex. Cloudflare R2), jamais de fichier stocké en base |
| PWA | Web App Manifest + Service Worker + stockage local (IndexedDB) pour un fonctionnement **offline-first** |
| Temps réel | SSE ou polling côté dashboard admin (voir §4.2) |
| Déploiement | Vercel (environnements dev / preview / production) |

Principes structurants à conserver :
- **Offline-first** : un commercial doit pouvoir remplir un formulaire sans connexion ; la synchronisation se fait dès que le réseau est disponible.
- **Idempotence** : chaque formulaire créé côté terrain porte un identifiant unique généré sur le téléphone avant synchronisation, pour éviter tout doublon en cas de nouvelle tentative après coupure réseau.
- **Pagination systématique** de toutes les listes côté admin.
- **Aucune donnée de configuration codée en dur** (villes, types d'établissement, marques par défaut) : tout doit être gérable depuis l'admin.

## 7. Exigences non fonctionnelles

- Fonctionnement fiable en connectivité faible ou instable (contexte terrain).
- Sécurité des accès (authentification par rôle, sessions gérées et révocables côté serveur).
- Photos et position GPS liées de façon fiable au bon point de vente et à la bonne visite.
- Scalabilité : le système doit pouvoir monter en charge avec l'ajout de nouveaux commerciaux et de nouvelles villes sans changement de structure.

## 8. Livrables attendus

- Application PWA terrain (formulaire de recensement en 4 sections décrit au §4.1).
- Dashboard Admin (réception temps réel, liste, fiche détail, carte, statistiques, export, gestion des utilisateurs et référentiels).
- Base de données structurée (schéma Prisma / PostgreSQL).
- Documentation technique de l'architecture (sur le modèle du projet de référence).

## 9. Hors périmètre (évolutions futures possibles)

- Détail de commande produit/quantité si "Oui" en section 4 (prévoir juste le point d'extension).
- Module de gestion des ventes et du stock (comme dans le projet de référence), à envisager dans une phase ultérieure.
- Objectifs commerciaux par agent/équipe.
