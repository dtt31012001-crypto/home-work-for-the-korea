import { Injectable } from "@nestjs/common";
import { hash, verify } from "@node-rs/argon2";
import { randomInt } from "node:crypto";

// Tham số Argon2id theo khuyến nghị OWASP (19 MiB, t=2, p=1)
const ARGON2_OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 };
// Không có ký tự dễ nhầm (0/o, 1/l/i) để trung tâm đọc cho học viên/phụ huynh
const TEMP_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const TEMP_LENGTH = 10;

@Injectable()
export class PasswordService {
  private dummyHash?: Promise<string>;

  hash(password: string): Promise<string> {
    return hash(password, ARGON2_OPTIONS);
  }

  async verify(storedHash: string, password: string): Promise<boolean> {
    try {
      return await verify(storedHash, password);
    } catch {
      return false;
    }
  }

  /** Chạy một lần verify giả để thời gian phản hồi không lộ việc SĐT/email có tồn tại hay không. */
  async verifyDummy(password: string): Promise<void> {
    this.dummyHash ??= this.hash("dummy-password-for-timing");
    await this.verify(await this.dummyHash, password);
  }

  generateTemporary(): string {
    let out = "";
    for (let i = 0; i < TEMP_LENGTH; i++) out += TEMP_ALPHABET[randomInt(TEMP_ALPHABET.length)];
    return out;
  }
}
