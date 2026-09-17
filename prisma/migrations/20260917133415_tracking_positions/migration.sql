-- AlterTable
ALTER TABLE "users" ADD COLUMN     "derniere_position_at" TIMESTAMP(3),
ADD COLUMN     "derniere_position_lat" DECIMAL(10,7),
ADD COLUMN     "derniere_position_lng" DECIMAL(10,7);
