import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

export interface RequestMeta {
  requestId?: string;
}

export function requestIdMiddleware(req: Request & RequestMeta, res: Response, next: NextFunction) {
  const incoming = req.header("x-request-id");
  req.requestId = incoming && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID();
  res.setHeader("x-request-id", req.requestId);
  next();
}

export function clientMeta(req: Request & RequestMeta) {
  return {
    ip: req.ip ?? null,
    userAgent: req.header("user-agent")?.slice(0, 300) ?? null,
    requestId: req.requestId ?? null,
  };
}
