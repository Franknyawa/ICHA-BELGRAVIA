-- CreateTable
CREATE TABLE "produits" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "prixUnitaire" DECIMAL(10,2) NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "ordre" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "produits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commandes" (
    "id" TEXT NOT NULL,
    "uuid_client" TEXT NOT NULL,
    "point_vente_id" TEXT NOT NULL,
    "commercial_id" TEXT NOT NULL,
    "date_commande" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "observations" TEXT,
    "montant_total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commandes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lignes_commande" (
    "id" TEXT NOT NULL,
    "commande_id" TEXT NOT NULL,
    "produit_id" TEXT,
    "libelle_libre" TEXT,
    "quantite" INTEGER NOT NULL,
    "prix_unitaire" DECIMAL(10,2) NOT NULL,
    "sous_total" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "lignes_commande_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "produits_nom_key" ON "produits"("nom");

-- CreateIndex
CREATE UNIQUE INDEX "commandes_uuid_client_key" ON "commandes"("uuid_client");

-- CreateIndex
CREATE INDEX "commandes_point_vente_id_idx" ON "commandes"("point_vente_id");

-- CreateIndex
CREATE INDEX "commandes_commercial_id_idx" ON "commandes"("commercial_id");

-- CreateIndex
CREATE INDEX "commandes_created_at_idx" ON "commandes"("created_at");

-- CreateIndex
CREATE INDEX "lignes_commande_commande_id_idx" ON "lignes_commande"("commande_id");

-- AddForeignKey
ALTER TABLE "commandes" ADD CONSTRAINT "commandes_point_vente_id_fkey" FOREIGN KEY ("point_vente_id") REFERENCES "points_vente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commandes" ADD CONSTRAINT "commandes_commercial_id_fkey" FOREIGN KEY ("commercial_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lignes_commande" ADD CONSTRAINT "lignes_commande_commande_id_fkey" FOREIGN KEY ("commande_id") REFERENCES "commandes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lignes_commande" ADD CONSTRAINT "lignes_commande_produit_id_fkey" FOREIGN KEY ("produit_id") REFERENCES "produits"("id") ON DELETE SET NULL ON UPDATE CASCADE;
