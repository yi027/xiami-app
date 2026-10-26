import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();

let sequence = 0;

export async function makeUser(name: string) {
  sequence += 1;
  const email = `${name}.${Date.now()}.${sequence}@test.app`.toLowerCase();
  return prisma.user.create({
    data: { email, name, passwordHash: "x" },
  });
}

export const PNG = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  ),
);

export function tinyMp4() {
  const bytes = new Uint8Array(16);
  bytes.set([0x00, 0x00, 0x00, 0x10], 0);
  bytes.set([0x66, 0x74, 0x79, 0x70], 4);
  bytes.set([0x69, 0x73, 0x6f, 0x6d], 8);
  return bytes;
}

export function tinyWebm() {
  return Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01]);
}
