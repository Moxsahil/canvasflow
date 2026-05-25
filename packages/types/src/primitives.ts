/**
 * Branded primitive types. These prevent accidentally passing a UserId
 * where a BoardId is expected — the TS compiler enforces the distinction
 * at compile time even though both are strings at runtime.
 */

declare const __brand: unique symbol;
type Brand<T, B> = T & { readonly [__brand]: B };

export type UserId = Brand<string, 'UserId'>;
export type BoardId = Brand<string, 'BoardId'>;
export type WorkspaceId = Brand<string, 'WorkspaceId'>;
export type ShapeId = Brand<string, 'ShapeId'>;
export type CommentId = Brand<string, 'CommentId'>;
export type MembershipId = Brand<string, 'MembershipId'>;
export type AuditEventId = Brand<string, 'AuditEventId'>;
export type BoardVersionId = Brand<string, 'BoardVersionId'>;

/** ISO 8601 timestamp string */
export type ISODateString = Brand<string, 'ISODateString'>;

/** Hex color string like #FF5733 */
export type HexColor = Brand<string, 'HexColor'>;
