/** Public, read-only production smoke check. Never sends account credentials. */
const origin = new URL(process.env.DEPLOYMENT_URL ?? "https://interncalling.vercel.app");
if (origin.protocol !== "https:" || origin.username || origin.password || origin.search || origin.hash || origin.pathname !== "/") {
  throw new Error("Set DEPLOYMENT_URL to the HTTPS deployment origin.");
}
for (const path of ["/", "/sign-in", "/sign-up", "/forgot-password"]) {
  const response = await fetch(new URL(path, origin), { redirect: "manual", signal: AbortSignal.timeout(30_000) });
  if (response.status !== 200 || !response.headers.get("content-type")?.includes("text/html")) {
    throw new Error(`${path}: expected HTML 200, received ${response.status}`);
  }
  const html = await response.text();
  if (!html.includes("InternCalling")) throw new Error(`${path}: missing application branding`);
  console.log(`PASS ${path}: HTML 200`);
}
// Authenticated data must stay private even when production services are unconfigured.
const profile = await fetch(new URL("/profile", origin), {redirect:"manual",signal:AbortSignal.timeout(30_000)});
if (![302,303,307,308].includes(profile.status) || !profile.headers.get("location")?.includes("/sign-in")) {
  throw new Error("Guest profile request did not redirect to sign-in");
}
console.log("PASS guest profile redirects to sign-in");
