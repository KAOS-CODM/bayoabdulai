import dns from 'node:dns';

// Optional DNS override for SRV lookups (mongodb+srv connection strings).
// Some machines route DNS through a local proxy that c-ares cannot reach;
// DNS_SERVERS in .env points the resolver at working servers (comma-separated,
// e.g. "41.73.9.114,8.8.8.8"). No-op when unset — Render/Linux resolve
// normally without it.
export function configureDns(env = process.env) {
  const raw = String(env.DNS_SERVERS ?? '').trim();
  if (!raw) return false;
  const servers = raw.split(',').map((s) => s.trim()).filter(Boolean);
  if (servers.length === 0) return false;
  dns.setServers(servers);
  return true;
}
