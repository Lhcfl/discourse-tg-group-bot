import { getConfig } from "./config";
import { useKeyPair } from "./keypair";
import forge from "node-forge";


export type generateUserApiKeyParams = {
  /**
   * the name of the application making the request (will be displayed in the user account’s Apps tab)
   * @defaultValue `"NodeDiscourseApi"`
   */
  application_name?: string;
  /**
   * url to redirect back to with the generated token
   */
  auth_redirect?: string;
  /**
   * comma-separated list of access scopes allowed for the key, see `allow user api key scopes` for the full list of available scopes
   *
   * @defaultValue `"read"`
   */
  scopes?: string;
  /**
   * a unique identifier for the client
   * @defaultValue `"NodeDiscourseApi"`
   */
  client_id?: string;
  /**
   * url to push notifications to (required and valid only if `push` or `notifications` are included in the scopes)
   */
  push_url?: string;
};

export type UserApiKeyLink = {
  /**
   * A link that allows the user to generate a User API key. The user should visit this link, explicitly agree to the authorization, and then copy the content it produces and provide it to `api.decryptUserApiKey` to obtain the User API key. Alternatively, if `auth_redirect` has the correct value, discourse will redirect to `auth_redirect` url after user authorization.
   */
  url: string;
  /**
   * The nonce generated. It can be used to verify and identify its source after decrypting the user api key.
   */
  nonce: string;
};

// Helper function to convert ArrayBuffer to PEM format
function arrayBufferToPem(buffer: ArrayBuffer, label: string): string {
  const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
  const lines = base64.match(/.{1,64}/g) || [];
  return `-----BEGIN ${label}-----\n${lines.join('\n')}\n-----END ${label}-----\n`;
}

export async function generateUserApiKey(baseUrl: string, params: generateUserApiKeyParams): Promise<UserApiKeyLink> {
  const urlParams = new URLSearchParams();
  const res: UserApiKeyLink = {
    url: "",
    nonce: Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map(b => b.toString(16).padStart(2, '0'))
      .join(''),
  };
  urlParams.set(
    "application_name",
    params.application_name || "NodeDiscourseApi",
  );
  urlParams.set("scopes", params.scopes || "read");
  urlParams.set("client_id", params.client_id || "NodeDiscourseApi");
  urlParams.set("public_key", useKeyPair().publicKey);
  if (params.auth_redirect) {
    urlParams.set("auth_redirect", params.auth_redirect);
  }
  urlParams.set("nonce", res.nonce);
  res.url = `${baseUrl}/user-api-key/new?${urlParams.toString()}`;
  return res;
}

export async function decryptUserApiKey(
  encrypted: string,
): Promise<{
  key: string;
  nonce: string;
  push: boolean;
  api: string | number;
}> {
  const privateKey = forge.pki.privateKeyFromPem(useKeyPair().privateKey);
  const decrypted = privateKey.decrypt(forge.util.decode64(encrypted), "RSAES-PKCS1-V1_5");
  return JSON.parse(decrypted);
}

export async function verify(key: string) {
  const config = getConfig();
  try {
    void await fetch(config.site_url + `/t/${config.check_topic_id}.json`, {
      method: "GET",
      headers: {
        "User-Api-Key": key,
        "User-Api-Client-Id": config.client_id,
      }
    }).then(res => res.json());
    return null;
  } catch (err) {
    const msg = (err as any)?.message || "unknown";
    return msg as string;
  }
}

export async function getMe(key: string) {
  const config = getConfig();
  try {
    const res = await fetch(config.site_url + "/session/current.json", {
      method: "GET",
      headers: {
        "User-Api-Key": key,
        "User-Api-Client-Id": config.client_id,
      }
    });
    return await res.json();
  } catch (err) {
    console.error('Failed to fetch user info:', err);
    throw err;
  }
}