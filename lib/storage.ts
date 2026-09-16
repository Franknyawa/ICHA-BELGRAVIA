import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { v4 as uuid } from "uuid";

/**
 * Adaptateur de stockage des photos terrain — trois drivers possibles,
 * pilotés par STORAGE_DRIVER :
 *
 * - "local" (défaut) : écrit sur disque sous public/uploads. Pratique en
 *   développement, mais NE FONCTIONNE PAS sur une plateforme serverless
 *   sans disque persistant (ex. Vercel) — usage dev/démo uniquement.
 * - "sftp" : dépose le fichier via SFTP dans le dossier public de
 *   l'hébergement LWS (mutualisé/VPS), servi ensuite en HTTP classique par
 *   Apache/Nginx. C'est le driver à utiliser avec un hébergement LWS
 *   classique (voir SFTP_* dans .env.example).
 * - "s3" : envoie vers un bucket S3-compatible (AWS S3, Cloudflare R2...).
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
 * Dépose le fichier dans le dossier public de l'hébergement LWS via SFTP,
 * puis retourne l'URL publique correspondante (le fichier est servi
 * directement par le serveur web LWS, comme n'importe quel fichier statique).
 *
 * Variables requises : SFTP_HOST, SFTP_USER, et soit SFTP_PASSWORD soit
 * SFTP_PRIVATE_KEY (clé privée, contenu PEM). SFTP_PORT défaut 22.
 * SFTP_REMOTE_DIR : chemin absolu ou relatif du dossier public sur
 * l'hébergement (ex. "www/uploads" ou "public_html/uploads" selon la
 * structure LWS — à vérifier dans le panneau FTP LWS).
 * SFTP_PUBLIC_URL_BASE : URL publique correspondant à ce dossier
 * (ex. "https://mondomaine.fr/uploads").
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
    });

    const exists = await sftp.exists(remoteDir);
    if (!exists) await sftp.mkdir(remoteDir, true);

    const remotePath = `${remoteDir.replace(/\/$/, "")}/${filename}`;
    await sftp.put(buffer, remotePath);
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
