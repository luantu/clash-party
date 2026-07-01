import { readdirSync, readFileSync, writeFileSync } from 'fs'
import { createHash } from 'crypto'

const targets = process.argv.slice(2)
const files =
  targets.length > 0
    ? readdirSync('dist').filter((f) => targets.some((ext) => f.endsWith(ext)))
    : readdirSync('dist').filter((f) => !f.endsWith('.sha256') && !f.endsWith('.yml'))

for (const file of files) {
  const content = readFileSync(`dist/${file}`)
  const checksum = createHash('sha256').update(content).digest('hex')
  writeFileSync(`dist/${file}.sha256`, checksum)
}
