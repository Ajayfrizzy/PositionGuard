export function databaseConnectionString(
  connectionString: string,
  allowSelfSignedCertificate: boolean,
) {
  if (!allowSelfSignedCertificate) return connectionString;

  const url = new URL(connectionString);
  url.searchParams.delete("uselibpqcompat");
  url.searchParams.set("sslmode", "no-verify");
  return url.toString();
}
