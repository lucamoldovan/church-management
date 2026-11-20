import { constants, chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { openDatabase } from "../src/database.js";

const databasePath = resolve(process.env.VEYRA_DATABASE_PATH ?? "data/veyra.sqlite");
const pairingSecretPath = resolve(process.env.VEYRA_PAIRING_SECRET_PATH ?? "data/pairing-secret");
const mediaDirectoryPath = resolve(process.env.VEYRA_MEDIA_DIRECTORY ?? "data/media");
const backupDirectory = resolve(process.argv[2] ?? "backups");

if (!existsSync(databasePath)) {
  throw new Error(`Veyra database does not exist: ${databasePath}`);
}
if (!existsSync(pairingSecretPath)) {
  throw new Error(`Veyra pairing secret does not exist: ${pairingSecretPath}`);
}

const secretInfo = lstatSync(pairingSecretPath);
if (!secretInfo.isFile()) {
  throw new Error("Veyra pairing secret must be a regular file");
}
chmodSync(pairingSecretPath, 0o600);

const unsafeBackupTargets = new Set([
  "/", "/tmp", "/var", "/var/cache", "/var/lib", "/home", "/root",
  "/etc", "/usr", "/opt", "/run", "/mnt", "/media", "/dev", "/proc",
  "/sys", "/boot",
]);
const homeDirectory = process.env.HOME ? resolve(process.env.HOME) : "";
if (backupDirectory === process.cwd() || (homeDirectory && backupDirectory === homeDirectory) ||
    unsafeBackupTargets.has(backupDirectory)) {
  throw new Error("Veyra backups must be written to a dedicated private directory");
}
mkdirSync(backupDirectory, { recursive: true, mode: 0o700 });
const backupDirectoryInfo = lstatSync(backupDirectory);
if (!backupDirectoryInfo.isDirectory() || backupDirectoryInfo.isSymbolicLink()) {
  throw new Error("Veyra backup path must be a real directory, not a symlink");
}
chmodSync(backupDirectory, 0o700);

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const databaseBackup = join(backupDirectory, `veyra-${timestamp}.sqlite`);
const secretBackup = join(backupDirectory, `pairing-secret-${timestamp}`);
const manifestPath = join(backupDirectory, `veyra-${timestamp}.json`);
const mediaBackupDirectory = join(backupDirectory, `media-${timestamp}`);

const database = openDatabase(databasePath);
try {
  await database.backup(databaseBackup);
} finally {
  database.close();
}

copyFileSync(pairingSecretPath, secretBackup, constants.COPYFILE_EXCL);
chmodSync(databaseBackup, 0o600);
chmodSync(secretBackup, 0o600);

mkdirSync(mediaBackupDirectory, { recursive: false, mode: 0o700 });
let mediaFileCount = 0;
let mediaBytes = 0;
if (existsSync(mediaDirectoryPath)) {
  const mediaInfo = lstatSync(mediaDirectoryPath);
  if (!mediaInfo.isDirectory()) {
    throw new Error("Veyra media path must be a regular directory");
  }
  for (const entry of readdirSync(mediaDirectoryPath, { withFileTypes: true })) {
    if (!entry.isFile()) {
      throw new Error("Veyra media directory contains a non-regular entry; refusing an incomplete backup");
    }
    const sourcePath = join(mediaDirectoryPath, entry.name);
    const sourceInfo = lstatSync(sourcePath);
    if (!sourceInfo.isFile()) {
      throw new Error("Veyra media directory contains a non-regular file");
    }
    const destinationPath = join(mediaBackupDirectory, entry.name);
    copyFileSync(sourcePath, destinationPath, constants.COPYFILE_EXCL);
    chmodSync(destinationPath, 0o600);
    mediaFileCount += 1;
    mediaBytes += sourceInfo.size;
  }
}

const manifest = {
  formatVersion: 1,
  createdAt: new Date().toISOString(),
  databaseFile: databaseBackup.split(/[\\/]/).pop(),
  pairingSecretFile: secretBackup.split(/[\\/]/).pop(),
  mediaDirectory: mediaBackupDirectory.split(/[\\/]/).pop(),
  mediaFileCount,
  mediaBytes,
  note: "Restore the SQLite database, matching pairing secret, and media directory together while the Veyra server is stopped.",
};
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", {
  encoding: "utf8",
  mode: 0o600,
  flag: "wx",
});

process.stdout.write(`Veyra backup created:\n- ${databaseBackup}\n- ${secretBackup}\n- ${mediaBackupDirectory}\n- ${manifestPath}\n`);
