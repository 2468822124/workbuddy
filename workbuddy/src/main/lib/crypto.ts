import { safeStorage } from 'electron'

export function encrypt(plain: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('SAFE_STORAGE_UNAVAILABLE')
  }
  return safeStorage.encryptString(plain).toString('base64')
}

export function decrypt(b64: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('SAFE_STORAGE_UNAVAILABLE')
  }
  return safeStorage.decryptString(Buffer.from(b64, 'base64'))
}
