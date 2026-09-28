"use client";

/**
 * Redimensionne et recompresse une photo côté client avant tout envoi.
 *
 * Pourquoi : une photo prise directement avec l'appareil d'un smartphone
 * (surtout un iPhone récent) pèse souvent plusieurs Mo ; une fois encodée en
 * base64 (obligatoire pour la mettre en file d'attente hors-ligne dans
 * IndexedDB), elle dépasse fréquemment 6-10 Mo. Or Vercel refuse toute
 * requête vers une fonction serverless au-delà d'environ 4,5 Mo, avec
 * l'erreur plateforme "FUNCTION_PAYLOAD_TOO_LARGE" (413) — une erreur qui
 * survient AVANT que le code de la route ne s'exécute, et qui a été prise
 * pendant un temps pour un problème de connexion ou d'hébergement FTP,
 * alors que la vraie cause était simplement la taille du fichier.
 *
 * On redimensionne donc chaque photo à une taille raisonnable pour un
 * usage de recensement terrain (1600px sur le plus grand côté suffit
 * largement à l'écran) et on la recompresse en JPEG qualité 0.72, ce qui
 * ramène une photo typique à quelques centaines de Ko — largement sous la
 * limite, et bien plus rapide à envoyer/stocker.
 */
function tailleApproximative(dataUrl: string): number {
  // Une data URL base64 pèse ~4/3 de la taille réelle du fichier ; on en
  // déduit une estimation en octets suffisante pour décider s'il faut
  // recompresser davantage.
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  return Math.round((base64.length * 3) / 4);
}

function redimensionnerEtCompresser(img: HTMLImageElement, maxDimension: number, qualite: number): string {
  let { width, height } = img;
  if (width > maxDimension || height > maxDimension) {
    if (width >= height) {
      height = Math.round((height * maxDimension) / width);
      width = maxDimension;
    } else {
      width = Math.round((width * maxDimension) / height);
      height = maxDimension;
    }
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return img.src; // Environnement sans Canvas (très rare) : on renvoie l'original.
  ctx.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", qualite);
}

/**
 * Redimensionne/recompresse une photo, en réessayant avec un réglage plus
 * agressif si le résultat dépasse encore `maxOctets` (marge de sécurité
 * sous la limite Vercel de ~4,5 Mo par requête, une fois l'encodage
 * base64 et le reste du payload JSON pris en compte).
 */
export function compresserImage(
  dataUrl: string,
  maxDimension = 1600,
  qualite = 0.72,
  maxOctets = 3_000_000
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        let resultat = redimensionnerEtCompresser(img, maxDimension, qualite);

        const paliers: [number, number][] = [
          [1200, 0.55],
          [1000, 0.45],
          [800, 0.4],
        ];
        let i = 0;
        while (tailleApproximative(resultat) > maxOctets && i < paliers.length) {
          const [dim, q] = paliers[i];
          resultat = redimensionnerEtCompresser(img, dim, q);
          i++;
        }

        resolve(resultat);
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => reject(new Error("Image illisible."));
    img.src = dataUrl;
  });
}
