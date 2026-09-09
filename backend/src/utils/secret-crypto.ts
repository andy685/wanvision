import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

const PREFIX = 'enc:v1:'

function key() {
  const secret = process.env.API_KEY_ENCRYPTION_SECRET
  return secret ? createHash('sha256').update(secret).digest() : null
}

export function encryptSecret(value: string | null | undefined) {
  if (!value) return value || ''
  const encryptionKey = key()
  if (!encryptionKey || value.startsWith(PREFIX)) return value
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey, iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return `${PREFIX}${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${encrypted.toString('base64url')}`
}

export function decryptSecret(value: string | null | undefined) {
  if (!value || !value.startsWith(PREFIX)) return value || ''
  const encryptionKey = key()
  if (!encryptionKey) throw new Error('API_KEY_ENCRYPTION_SECRET 未配置，无法解密 AI 服务密钥')
  const [ivRaw, tagRaw, dataRaw] = value.slice(PREFIX.length).split('.')
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey, Buffer.from(ivRaw, 'base64url'))
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'))
  return Buffer.concat([decipher.update(Buffer.from(dataRaw, 'base64url')), decipher.final()]).toString('utf8')
}
