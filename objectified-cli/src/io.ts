import { mkdirSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';

export function writeStdoutOrFile(data: string, outputPath?: string): void {
  if (!outputPath || outputPath === '-') {
    process.stdout.write(data);
    return;
  }
  const abs = resolve(outputPath);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, data, 'utf8');
}

export function writeJson(data: unknown, outputPath?: string, pretty = true): void {
  const body = pretty ? `${JSON.stringify(data, null, 2)}\n` : `${JSON.stringify(data)}\n`;
  writeStdoutOrFile(body, outputPath);
}
