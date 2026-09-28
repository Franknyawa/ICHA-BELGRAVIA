/*
  Warnings:

  - You are about to drop the column `prixUnitaire` on the `produits` table. All the data in the column will be lost.
  - Added the required column `prix_unitaire` to the `produits` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "ModePaiement" AS ENUM ('ESPECES', 'MOBILE_MONEY', 'CREDIT_PARTIEL', 'CREDIT_TOTAL');

-- CreateEnum
CREATE TYPE "TypeMouvementStock" AS ENUM ('ENTREE', 'SORTIE', 'AJUSTEMENT');

-- AlterTable
ALTER TABLE "commandes" ADD COLUMN     "mode_paiement" "ModePaiement" NOT NULL DEFAULT 'ESPECES',
ADD COLUMN     "montant_recu" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "reste_a_payer" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "produits" DROP COLUMN "prixUnitaire",
ADD COLUMN     "prix_unitaire" DECIMAL(10,2) NOT NULL,
ADD COLUMN     "volume_ml" INTEGER NOT NULL DEFAULT 275;

-- CreateTable
CREATE TABLE "paliers_prix_carton" (
    "id" TEXT NOT NULL,
    "cartons_min" INTEGER NOT NULL,
    "cartons_max" INTEGER,
    "prix_carton" DECIMAL(10,2) NOT NULL,
    "ordre" INTEGER NOT NULL DEFAULT 0,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "paliers_prix_carton_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock" (
    "id" TEXT NOT NULL,
    "produit_id" TEXT NOT NULL,
    "quantite_cartons" INTEGER NOT NULL DEFAULT 0,
    "seuil_alerte" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mouvements_stock" (
    "id" TEXT NOT NULL,
    "produit_id" TEXT NOT NULL,
    "type" "TypeMouvementStock" NOT NULL,
    "quantite_cartons" INTEGER NOT NULL,
    "reference_type" TEXT,
    "reference_id" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mouvements_stock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stock_produit_id_key" ON "stock"("produit_id");

-- CreateIndex
CREATE INDEX "mouvements_stock_produit_id_idx" ON "mouvements_stock"("produit_id");

-- CreateIndex
CREATE INDEX "mouvements_stock_created_at_idx" ON "mouvements_stock"("created_at");

-- CreateIndex
CREATE INDEX "commandes_mode_paiement_idx" ON "commandes"("mode_paiement");

-- AddForeignKey
ALTER TABLE "stock" ADD CONSTRAINT "stock_produit_id_fkey" FOREIGN KEY ("produit_id") REFERENCES "produits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mouvements_stock" ADD CONSTRAINT "mouvements_stock_produit_id_fkey" FOREIGN KEY ("produit_id") REFERENCES "produits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
