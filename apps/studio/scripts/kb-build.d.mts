export const KB_DIR: string;
export const BUNDLE_PATHS: string[];
export function buildKnowledgeBase(dir?: string): { version: number; articles: unknown[] };
export function serializeKnowledgeBase(kb: { version: number; articles: unknown[] }): string;
