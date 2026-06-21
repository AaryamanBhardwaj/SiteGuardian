import jwt from "jsonwebtoken";
import jwksClient from "jwks-rsa";

export function createRemoteJWKSigner(issuer) {
  return jwksClient({
    jwksUri: `${issuer}/.well-known/jwks.json`,
    cache: true,
    cacheMaxAge: 600000,
    rateLimit: true,
  });
}

export async function verifyToken(token, client, issuer) {
  const decoded = jwt.decode(token, { complete: true });
  if (!decoded) throw new Error("Invalid token");

  const key = await new Promise((resolve, reject) => {
    client.getSigningKey(decoded.header.kid, (err, signingKey) => {
      if (err) return reject(err);
      resolve(signingKey.getPublicKey());
    });
  });

  return jwt.verify(token, key, {
    issuer,
    algorithms: ["RS256"],
  });
}
