import path from 'path';

export function resolvePublicDir(): string {
  const dir = path.resolve(__dirname, '../../public');
  return dir;
}
