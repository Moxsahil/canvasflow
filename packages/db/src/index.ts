export * from './schema/index.js';
export * from './schema/auth-adapter.js';
export * from './client.js';
export * from './env.js';

/**
 * Board authorization. Every service resolves access through this one module
 * rather than reimplementing the join — see resolveBoardAccess.
 */
export * from './access/board-access.js';
export * from './access/workspaces.js';
export * from './access/access-requests.js';
export * from './access/share-links.js';
export * from './access/board-roles.js';
