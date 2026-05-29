import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const SALT_SIZE = 16;
const KEY_SIZE = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_SIZE).toString("hex");
  const derivedKey = (await scrypt(password, salt, KEY_SIZE)) as Buffer;

  return `scrypt$${salt}$${derivedKey.toString("hex")}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  if (!storedHash.startsWith("scrypt$")) {
    return password === storedHash;
  }

  const [algorithm, salt, hash] = storedHash.split("$");

  if (algorithm !== "scrypt" || !salt || !hash) {
    return false;
  }

  const hashBuffer = Buffer.from(hash, "hex");
  const derivedKey = (await scrypt(password, salt, hashBuffer.length)) as Buffer;

  if (derivedKey.length !== hashBuffer.length) {
    return false;
  }

  return timingSafeEqual(derivedKey, hashBuffer);
}
