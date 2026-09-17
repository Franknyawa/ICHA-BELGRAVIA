-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'COMMERCIAL');

-- CreateEnum
CREATE TYPE "StatutPointVente" AS ENUM ('OUVERT', 'FERME_TEMPORAIREMENT', 'EN_TRAVAUX');

-- CreateEnum
CREATE TYPE "ReponseCocktails" AS ENUM ('OUI', 'NON', 'INTERESSE');

-- CreateEnum
CREATE TYPE "CapaciteEstimee" AS ENUM ('MOINS_20', 'DE_20_A_50', 'DE_50_A_100', 'PLUS_100');

-- CreateEnum
CREATE TYPE "PotentielEstime" AS ENUM ('FORT', 'MOYEN', 'FAIBLE');

-- CreateEnum
CREATE TYPE "Repondant" AS ENUM ('GERANT_PATRON', 'EMPLOYE', 'AUTRE');

-- CreateTable
CREATE TABLE "villes" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "villes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "types_etablissement" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "ordre" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "types_etablissement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marques" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "ordre" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "marques_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "identifiant" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "nom" TEXT NOT NULL,
    "prenom" TEXT NOT NULL,
    "telephone" TEXT,
    "ville_id" TEXT,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "points_vente" (
    "id" TEXT NOT NULL,
    "nom_etablissement" TEXT NOT NULL,
    "nom_vendeur" TEXT,
    "tel_vendeur" TEXT,
    "tel_patron" TEXT,
    "ville_id" TEXT,
    "quartier" TEXT,
    "repere_quartier" TEXT,
    "type_id" TEXT,
    "type_autre_precision" TEXT,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "precision_gps" DECIMAL(6,2),
    "statut" "StatutPointVente" NOT NULL DEFAULT 'OUVERT',
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "points_vente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visites" (
    "id" TEXT NOT NULL,
    "uuid_client" TEXT NOT NULL,
    "point_vente_id" TEXT NOT NULL,
    "commercial_id" TEXT NOT NULL,
    "date_visite" TIMESTAMP(3) NOT NULL,
    "vend_spiritueux" BOOLEAN,
    "propose_cocktails" "ReponseCocktails",
    "capacite_estimee" "CapaciteEstimee",
    "affluence" JSONB,
    "fournisseur_grossiste" BOOLEAN NOT NULL DEFAULT false,
    "fournisseur_marche" BOOLEAN NOT NULL DEFAULT false,
    "fournisseur_livraison" BOOLEAN NOT NULL DEFAULT false,
    "fournisseur_ne_sait_pas" BOOLEAN NOT NULL DEFAULT false,
    "potentiel_estime" "PotentielEstime",
    "interesse_visite_commerciale" BOOLEAN,
    "observations" TEXT,
    "repondant" "Repondant",
    "repondant_autre_precision" TEXT,
    "veut_commander" BOOLEAN,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "visites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marques_presentes" (
    "id" TEXT NOT NULL,
    "visite_id" TEXT NOT NULL,
    "marque_id" TEXT,
    "libelle_libre" TEXT,

    CONSTRAINT "marques_presentes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "photos" (
    "id" TEXT NOT NULL,
    "uuid_client" TEXT NOT NULL,
    "point_vente_id" TEXT NOT NULL,
    "visite_id" TEXT,
    "url" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "photos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "villes_nom_key" ON "villes"("nom");

-- CreateIndex
CREATE UNIQUE INDEX "types_etablissement_nom_key" ON "types_etablissement"("nom");

-- CreateIndex
CREATE UNIQUE INDEX "marques_nom_key" ON "marques"("nom");

-- CreateIndex
CREATE UNIQUE INDEX "users_identifiant_key" ON "users"("identifiant");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "points_vente_ville_id_idx" ON "points_vente"("ville_id");

-- CreateIndex
CREATE INDEX "points_vente_type_id_idx" ON "points_vente"("type_id");

-- CreateIndex
CREATE INDEX "points_vente_created_at_idx" ON "points_vente"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "visites_uuid_client_key" ON "visites"("uuid_client");

-- CreateIndex
CREATE INDEX "visites_point_vente_id_idx" ON "visites"("point_vente_id");

-- CreateIndex
CREATE INDEX "visites_commercial_id_idx" ON "visites"("commercial_id");

-- CreateIndex
CREATE INDEX "visites_date_visite_idx" ON "visites"("date_visite");

-- CreateIndex
CREATE INDEX "marques_presentes_visite_id_idx" ON "marques_presentes"("visite_id");

-- CreateIndex
CREATE UNIQUE INDEX "photos_uuid_client_key" ON "photos"("uuid_client");

-- CreateIndex
CREATE INDEX "photos_point_vente_id_idx" ON "photos"("point_vente_id");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "points_vente" ADD CONSTRAINT "points_vente_ville_id_fkey" FOREIGN KEY ("ville_id") REFERENCES "villes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "points_vente" ADD CONSTRAINT "points_vente_type_id_fkey" FOREIGN KEY ("type_id") REFERENCES "types_etablissement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "points_vente" ADD CONSTRAINT "points_vente_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visites" ADD CONSTRAINT "visites_point_vente_id_fkey" FOREIGN KEY ("point_vente_id") REFERENCES "points_vente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visites" ADD CONSTRAINT "visites_commercial_id_fkey" FOREIGN KEY ("commercial_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marques_presentes" ADD CONSTRAINT "marques_presentes_visite_id_fkey" FOREIGN KEY ("visite_id") REFERENCES "visites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marques_presentes" ADD CONSTRAINT "marques_presentes_marque_id_fkey" FOREIGN KEY ("marque_id") REFERENCES "marques"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photos" ADD CONSTRAINT "photos_point_vente_id_fkey" FOREIGN KEY ("point_vente_id") REFERENCES "points_vente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photos" ADD CONSTRAINT "photos_visite_id_fkey" FOREIGN KEY ("visite_id") REFERENCES "visites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

