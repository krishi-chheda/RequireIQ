// vitest maps the `server-only` package here. The real package throws on import
// outside a React Server Component graph, which would block testing any module
// that legitimately guards itself with it.
export {};
