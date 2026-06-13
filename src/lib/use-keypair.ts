import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  exportPublicKey,
  generateKeyPair,
  loadPrivateKey,
  savePrivateKey,
} from "@/lib/crypto";

/**
 * Ensures the signed-in user has an E2EE keypair on this device, and that
 * the matching public key is stored on their profile so peers can encrypt
 * messages to them.  Runs once per user session.
 */
export function useEnsureKeypair(userId: string | undefined) {
  const [privateKey, setPrivateKey] = useState<CryptoKey | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!userId) {
      setPrivateKey(null);
      setReady(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        // 1. Get this device's private key — or make a fresh keypair.
        let priv = await loadPrivateKey();
        let pubB64: string | null = null;

        if (!priv) {
          const pair = await generateKeyPair();
          await savePrivateKey(pair.privateKey);
          priv = pair.privateKey;
          pubB64 = await exportPublicKey(pair.publicKey);
        }

        // 2. Make sure the server has a public key for us.  If the profile
        //    has none (or doesn't match a freshly generated one), upload it.
        const { data: profile } = await supabase
          .from("profiles")
          .select("public_key")
          .eq("id", userId)
          .maybeSingle();

        if (!profile?.public_key) {
          if (!pubB64) {
            // Re-derive from JWK: load priv, re-export as public via a
            // generated keypair only if we don't already have one.  Easiest
            // path is to regenerate — but that would orphan old ciphertext.
            // Instead, derive the public key from the JWK's `x`/`y` coords.
            pubB64 = await derivePublicFromPrivateJwk();
          }
          if (pubB64) {
            await supabase
              .from("profiles")
              .update({ public_key: pubB64 })
              .eq("id", userId);
          }
        }

        if (!cancelled) {
          setPrivateKey(priv);
          setReady(true);
        }
      } catch (err) {
        console.error("[e2ee] keypair init failed", err);
        if (!cancelled) setReady(true); // unblock UI even if E2EE fails
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return { privateKey, ready };
}

/** Re-derive the SPKI public key from the stored private JWK. */
async function derivePublicFromPrivateJwk(): Promise<string | null> {
  const raw = localStorage.getItem("univers.e2ee.priv.v1");
  if (!raw) return null;
  const jwk = JSON.parse(raw) as JsonWebKey;
  // Strip the `d` (private scalar) and import as a public key.
  const pubJwk: JsonWebKey = {
    kty: jwk.kty,
    crv: jwk.crv,
    x: jwk.x,
    y: jwk.y,
    ext: true,
    key_ops: [],
  };
  const pub = await crypto.subtle.importKey(
    "jwk",
    pubJwk,
    { name: "ECDH", namedCurve: "P-256" },
    true,
    [],
  );
  const spki = await crypto.subtle.exportKey("spki", pub);
  let s = "";
  const bytes = new Uint8Array(spki);
  for (let i = 0; i < bytes.byteLength; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}
