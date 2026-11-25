import { HttpStatus, PipeTransform } from "@nestjs/common";
import type { ZodSchema } from "zod";
import { AppException } from "./app-exception";

export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown): T {
    const parsed = this.schema.safeParse(value);
    if (!parsed.success) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        "VALIDATION_ERROR",
        "Thông tin chưa hợp lệ.",
        parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      );
    }
    return parsed.data;
  }
}
