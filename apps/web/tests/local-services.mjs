/** Isolated protocol doubles. Run only on loopback; never import into application code. */
import http from "node:http";
import { randomUUID, createHash } from "node:crypto";

const users = new Map(), tokens = new Map(), refreshTokens = new Map(), codes = new Map();
const events = [];
let mode = {};
const blank = (id) => ({ id: `profile-${id}`, user_id: id, degree_level: null, university: null, field_of_study: null, graduation_year: null, location: null });
function userBody(user) { return { id: user.id, aud: "authenticated", role: "authenticated", email: user.email, email_confirmed_at: new Date().toISOString(), phone: "", app_metadata: { provider: user.provider ?? "email", providers: [user.provider ?? "email"] }, user_metadata: {}, identities: [], created_at: new Date().toISOString(), updated_at: new Date().toISOString() }; }
function session(user, lifetime = 3600) {
  const expires = Math.floor(Date.now() / 1000) + lifetime;
  // Unsigned JWT-shaped strings exist only inside this local protocol double. The real app uses the Supabase SDK.
  const token = `${Buffer.from('{"alg":"none"}').toString("base64url")}.${Buffer.from(JSON.stringify({ sub: user.id, aud: "authenticated", exp: expires, role: "authenticated" })).toString("base64url")}.${randomUUID()}`;
  const refresh = randomUUID(); tokens.set(token, user); refreshTokens.set(refresh, user);
  return { access_token: token, token_type: "bearer", expires_in: lifetime, expires_at: expires, refresh_token: refresh, user: userBody(user) };
}
const skillList = ["python", "typescript", "react", "sql"].map((name, index) => ({ id: `skill-${index}`, name }));
const jobs = ["Frontend Engineering Intern", "Data Engineering Intern", "Software Engineering Intern"].map((title, index) => ({ id: `00000000-0000-4000-8000-00000000000${index}`, title, organization: "Local Test Company", opportunity_type: "internship", description: "A local integration test opportunity. Build useful tools with a small engineering team.", location: "Berlin, Germany", url: "https://example.test/internship", deadline: "2027-01-01", posted_at: "2026-11-01", is_active: true, skills: skillList.slice(index, index + 2) }));
async function body(request) { let value = ""; for await (const chunk of request) value += chunk; return value ? JSON.parse(value) : {}; }
function reply(response, status, value) { response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" }); response.end(JSON.stringify(value)); }
const error = (response, status, code) => reply(response, status, { code, error_code: code, msg: code, error: { code, message: code, details: [] } });

async function handler(request, response) {
  const origin = request.headers.origin;
  if (origin === "http://127.0.0.1:3102") { response.setHeader("Access-Control-Allow-Origin", origin); response.setHeader("Access-Control-Allow-Headers", "authorization, apikey, content-type, x-client-info, x-supabase-api-version"); response.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS"); }
  if (request.method === "OPTIONS") { response.writeHead(204); response.end(); return; }
  const url = new URL(request.url, "http://127.0.0.1");
  const input = ["POST", "PATCH", "PUT"].includes(request.method) ? await body(request) : {};
  if (url.pathname === "/auth/v1/settings") {
    if (mode.authOffline) return error(response, 503, "unexpected_failure");
    reply(response, 200, { external: { email: true, google: !!mode.googleEnabled, apple: !!mode.appleEnabled, linkedin_oidc: !!mode.linkedinEnabled }, disable_signup: false }); return;
  }
  if (url.pathname === "/auth/v1/authorize") {
    const provider = url.searchParams.get("provider");
    const enabled = { google: mode.googleEnabled, apple: mode.appleEnabled, linkedin_oidc: mode.linkedinEnabled };
    if (!enabled[provider]) return error(response, 400, "provider_disabled");
    const callback = new URL(url.searchParams.get("redirect_to"));
    const pkce = url.searchParams.get("code_challenge_method") === "s256" && !!url.searchParams.get("code_challenge");
    if (callback.origin !== "http://127.0.0.1:3102" || callback.pathname !== "/auth/callback" || !pkce) return error(response, 400, "invalid_oauth_request");
    events.push({ type: `${provider}-oauth`, pkce, prompt: url.searchParams.get("prompt") });
    if (mode.googleDeny || mode.deniedProvider === provider) {
      callback.searchParams.set("error", "access_denied"); callback.searchParams.set("error_description", "upstream-detail-must-not-be-displayed");
    } else {
      const email = `${provider}-only@example.test`;
      let user = users.get(email);
      if (!user) { user = { id: randomUUID(), email, provider, skills: [] }; user.profile = blank(user.id); users.set(email, user); }
      const code = randomUUID(); codes.set(code, { user, challenge: url.searchParams.get("code_challenge") }); callback.searchParams.set("code", code);
    }
    response.writeHead(302, { Location: callback.href, "Cache-Control": "no-store" }); response.end(); return;
  }
  if (url.pathname === "/__test") {
    if (request.method === "POST") {
      mode = { ...mode, ...input };
      if (input.reset) { users.clear(); tokens.clear(); refreshTokens.clear(); codes.clear(); events.length = 0; mode = {}; }
      if (input.seed) {
        const user = { id: randomUUID(), email: input.seed.email, passwordHash: createHash("sha256").update(input.seed.password).digest("hex"), skills: [], profile: null };
        user.profile = input.seed.completed ? { ...blank(user.id), degree_level: "master", university: "Second Test University", field_of_study: "Mathematics", graduation_year: 2026, location: "Paris, France" } : blank(user.id);
        users.set(user.email, user);
      }
    }
    reply(response, 200, { events, profiles: [...users.values()].map(({ profile, skills }) => ({ profile, skills })), confirmationCode: [...codes.keys()].at(-1) ?? null }); return;
  }
  if (url.pathname === "/auth/v1/signup") {
    if (mode.authOffline) return error(response, 503, "unexpected_failure");
    if (mode.emailRateLimit) return error(response, 429, "over_email_send_rate_limit");
    if (users.has(input.email)) return error(response, 422, "user_already_exists");
    const user = { id: randomUUID(), email: input.email, passwordHash: createHash("sha256").update(input.password).digest("hex"), skills: [], profile: null };
    user.profile = blank(user.id); users.set(user.email, user);
    if (mode.confirmEmail) { const code = randomUUID(); codes.set(code, { user, challenge: input.code_challenge }); reply(response, 200, userBody(user)); }
    else reply(response, 200, session(user));
    return;
  }
  if (url.pathname === "/auth/v1/token") {
    if (mode.authOffline) return error(response, 503, "unexpected_failure");
    if (mode.rateLimit) return error(response, 429, "over_request_rate_limit");
    const grant = url.searchParams.get("grant_type");
    if (grant === "refresh_token") {
      const user = refreshTokens.get(input.refresh_token);
      if (!user) return error(response, 400, "refresh_token_not_found");
      events.push({ type: "refresh", user: user.id }); reply(response, 200, session(user)); return;
    }
    if (grant === "pkce") {
      const code = codes.get(input.auth_code);
      if (!code || createHash("sha256").update(input.code_verifier).digest("base64url") !== code.challenge) return error(response, 400, "bad_code_verifier");
      codes.delete(input.auth_code); reply(response, 200, session(code.user)); return;
    }
    const user = users.get(input.email);
    if (!user || user.passwordHash !== createHash("sha256").update(input.password).digest("hex")) return error(response, 400, "invalid_credentials");
    reply(response, 200, session(user, mode.shortSession ? 30 : 3600)); return;
  }
  const user = tokens.get(request.headers.authorization?.replace(/^Bearer /, ""));
  if (url.pathname === "/auth/v1/user") {
    if (mode.authOffline) return error(response, 503, "unexpected_failure");
    if (!user || mode.revoked) return error(response, 401, "bad_jwt");
    reply(response, 200, userBody(user)); return;
  }
  if (url.pathname === "/auth/v1/logout") { if (user) for (const [token, owner] of tokens) if (owner === user) tokens.delete(token); reply(response, 200, {}); return; }
  if (!user) return error(response, 401, "unauthorized");
  events.push({ type: request.method, path: url.pathname, user: user.id });
  if (mode.apiOffline) return error(response, 503, "unavailable");
  if (url.pathname === "/api/v1/profile") {
    if (request.method === "PATCH") { if (mode.failProfile) return error(response, 503, "unavailable"); user.profile = { ...user.profile, ...input }; }
    reply(response, 200, mode.wrongOwner ? { ...user.profile, user_id: "other-user" } : user.profile); return;
  }
  if (url.pathname === "/api/v1/profile/skills") {
    if (request.method === "PUT") { if (mode.failSkills) return error(response, 503, "unavailable"); user.skills = input.names.map((name, index) => ({ id: `user-skill-${index}`, name })); }
    reply(response, 200, user.skills); return;
  }
  if (url.pathname === "/api/v1/skills") { reply(response, 200, skillList); return; }
  if (url.pathname === "/api/v1/opportunities") { const items = jobs.filter((job) => job.title.toLowerCase().includes((url.searchParams.get("search") ?? "").toLowerCase())); reply(response, 200, { items, page: 1, page_size: 12, total: items.length }); return; }
  if (url.pathname.endsWith("/match")) { if (mode.failMatch) return error(response, 503, "unavailable"); reply(response, 200, { score: 84, eligibility: "possibly_eligible", components: { skills: 80, field_fit: 90, interests: 0, location: 60, ai: 0 }, reasons: ["Your study field matches this internship."] }); return; }
  if (url.pathname === "/api/v1/applications") { reply(response, 200, { items: [], total: 0 }); return; }
  error(response, 404, "not_found");
}
for (const port of [8300, 8301]) http.createServer((request, response) => handler(request, response).catch(() => error(response, 500, "test_error"))).listen(port, "127.0.0.1");
console.log("Isolated test services listening on loopback ports 8300 and 8301. No hosted services are used.");
