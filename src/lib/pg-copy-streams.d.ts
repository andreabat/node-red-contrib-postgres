declare module 'pg-copy-streams' {
  import { Readable, Writable } from 'node:stream';

  export function from(txt: string, options?: any): Writable;
  export function to(txt: string, options?: any): Readable;
}
