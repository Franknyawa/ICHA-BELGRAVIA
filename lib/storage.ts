import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { v4 as uuid } from "uuid";

/**
 * Adaptateur de stockage des photos terrain — plusieurs drivers possibles,
 * pilotés par STORAGE_DRIVER :
 *
 * - "local" (défaut) : écrit sur disque sous public/uploads. Pratique en
 *   développement, mais NE FONCTIONNE PAS sur une plateforme serverless
 *   sans disque persistant (ex. Vercel) — usage dev/démo uniquement.
 * - "ftp" : dépose le fichier via FTP/FTPS classique dans le dossier public
 *   de l'hébergement. C'EST LE DRIVER À UTILISER POUR LA PLUPART DES
 *   HÉBERGEMENTS MUTUALISÉS (LWS compris) : la majorité de ces offres ne
 *   fournissent qu'un accès FTP/FTPS, pas un vrai SFTP (SSH).
 * - "sftp" : dépose le fichier via SFTP (SSH) — uniquement si ton hébergeur
 *   fournit explicitement un accès SSH/SFTP (typiquement un VPS), pas un
 *   simple compte FTP mutualisé.
 * - "s3" : envoie vers un bucket S3-compatible (AWS S3, Cloudflare R2...).
 *
 * Comment savoir lequel utiliser : ouvre un client comme FileZilla avec tes
 * identifiants LWS. S'il faut choisir "SFTP - SSH File Transfer Protocol" et
 * que ça se connecte → utilise "sftp". Si c'est "FTP" ou "FTP - FTPS" qui
 * fonctionne (le cas le plus fréquent en mutualisé) → utilise "ftp".
 */
export async function stockerPhoto(dataUrl: string): Promise<string> {
  const matches = dataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
  if (!matches) throw new Error("Format d'image invalide.");
  const [, ext, base64] = matches;
  const extension = ext === "jpeg" ? "jpg" : ext;
  const filename = `${uuid()}.${extension}`;
  const buffer = Buffer.from(base64, "base64");

  switch (process.env.STORAGE_DRIVER) {
    case "s3":
      return stockerSurS3(filename, buffer, `image/${ext}`);
    case "sftp":
      return stockerSurSftp(filename, buffer);
    case "ftp":
      return stockerSurFtp(filename, buffer);
    default:
      return stockerEnLocal(filename, buffer);
  }
}

async function stockerEnLocal(filename: string, buffer: Buffer): Promise<string> {
  const uploadsDir = path.join(process.cwd(), "public", "uploads");
  await mkdir(uploadsDir, { recursive: true });
  await writeFile(path.join(uploadsDir, filename), buffer);
  return `/uploads/${filename}`;
}

async function stockerSurS3(filename: string, buffer: Buffer, contentType: string): Promise<string> {
  // Import différé : évite de charger le SDK AWS quand STORAGE_DRIVER != s3.
  const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");

  const bucket = requireEnv("S3_BUCKET");
  const region = requireEnv("S3_REGION");

  const client = new S3Client({
    region,
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: !!process.env.S3_ENDPOINT, // requis pour R2/MinIO
    credentials: {
      accessKeyId: requireEnv("S3_ACCESS_KEY_ID"),
      secretAccessKey: requireEnv("S3_SECRET_ACCESS_KEY"),
    },
  });

  const key = `points-vente/${filename}`;
  await client.send(
    new PutObjectCommand({ Bucket: bucket, Key: key, Body: buffer, ContentType: contentType })
  );

  const base = process.env.S3_PUBLIC_URL_BASE || `${process.env.S3_ENDPOINT || `https://${bucket}.s3.${region}.amazonaws.com`}`;
  return `${base.replace(/\/$/, "")}/${key}`;
}

/**
 * Dépose le fichier via FTP/FTPS classique — le driver à utiliser pour la
 * grande majorité des hébergements mutualisés (LWS inclus), qui ne
 * proposent généralement pas de vrai SFTP (SSH) sur leurs offres standard.
 *
 * Variables requises : SFTP_HOST, SFTP_USER, SFTP_PASSWORD, SFTP_REMOTE_DIR,
 * SFTP_PUBLIC_URL_BASE (les mêmes noms de variables que le driver sftp, pour
 * ne pas multiplier les réglages — seul STORAGE_DRIVER change).
 * FTP_SECURE=false désactive le FTPS explicite si l'hébergeur ne le supporte
 * pas (par défaut : activé, plus sûr).
 */
async function stockerSurFtp(filename: string, buffer: Buffer): Promise<string> {
  const { Client } = await import("basic-ftp");

  const host = requireEnv("SFTP_HOST");
  const user = requireEnv("SFTP_USER");
  const password = requireEnv("SFTP_PASSWORD");
  const remoteDir = requireEnv("SFTP_REMOTE_DIR");
  const publicUrlBase = requireEnv("SFTP_PUBLIC_URL_BASE");
  const port = Number(process.env.SFTP_PORT || 21);
  const secure = process.env.FTP_SECURE !== "false";

  const client = new Client(20000); // 20s de timeout — évite un blocage silencieux
  try {
    await client.access({ host, port, user, password, secure });
    await client.ensureDir(remoteDir);
    const { Readable } = await import("stream");
    await client.uploadFrom(Readable.from(buffer), filename);
  } catch (e) {
    console.error("[stockage FTP] échec de l'upload :", e);
    throw new Error(
      "Échec de l'envoi de la photo vers l'hébergement (FTP). Vérifie SFTP_HOST/SFTP_USER/SFTP_PASSWORD/SFTP_REMOTE_DIR et que le protocole FTP/FTPS est bien celui fourni par ton hébergeur."
    );
  } finally {
    client.close();
  }

  return `${publicUrlBase.replace(/\/$/, "")}/${filename}`;
}

/**
 * Dépose le fichier dans le dossier public de l'hébergement via SFTP (SSH),
 * puis retourne l'URL publique correspondante. Ne fonctionne QUE si
 * l'hébergeur fournit un vrai accès SSH/SFTP (typiquement un VPS) — pour un
 * compte FTP mutualisé classique, utiliser STORAGE_DRIVER=ftp à la place.
 *
 * Variables requises : SFTP_HOST, SFTP_USER, et soit SFTP_PASSWORD soit
 * SFTP_PRIVATE_KEY (clé privée, contenu PEM). SFTP_PORT défaut 22.
 * SFTP_REMOTE_DIR : chemin du dossier public sur l'hébergement.
 * SFTP_PUBLIC_URL_BASE : URL publique correspondant à ce dossier.
 */
async function stockerSurSftp(filename: string, buffer: Buffer): Promise<string> {
  // Import différé : évite de charger le client SFTP quand inutilisé.
  const SftpClient = (await import("ssh2-sftp-client")).default;

  const host = requireEnv("SFTP_HOST");
  const username = requireEnv("SFTP_USER");
  const remoteDir = requireEnv("SFTP_REMOTE_DIR");
  const publicUrlBase = requireEnv("SFTP_PUBLIC_URL_BASE");
  const port = Number(process.env.SFTP_PORT || 22);

  const sftp = new SftpClient();
  try {
    await sftp.connect({
      host,
      port,
      username,
      password: process.env.SFTP_PASSWORD || undefined,
      privateKey: process.env.SFTP_PRIVATE_KEY || undefined,
      readyTimeout: 15000, // évite un blocage silencieux si le port 22 ne répond pas
    });

    const exists = await sftp.exists(remoteDir);
    if (!exists) await sftp.mkdir(remoteDir, true);

    const remotePath = `${remoteDir.replace(/\/$/, "")}/${filename}`;
    await sftp.put(buffer, remotePath);
  } catch (e) {
    console.error("[stockage SFTP] échec de l'upload :", e);
    throw new Error(
      "Échec de l'envoi de la photo vers l'hébergement (SFTP). Si ton hébergement ne fournit qu'un accès FTP classique (cas fréquent en mutualisé), utilise plutôt STORAGE_DRIVER=ftp."
    );
  } finally {
    await sftp.end().catch(() => {});
  }

  return `${publicUrlBase.replace(/\/$/, "")}/${filename}`;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Variable d'environnement manquante : ${name}`);
  return value;
}
