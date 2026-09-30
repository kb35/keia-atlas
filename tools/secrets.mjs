// Secret check for the data validator.
//
// An estate repository must never hold a real secret. This walks any parsed YAML
// value and reports every field whose KEY looks like a secret (password, passwd,
// secret, token, api_key, apikey, private_key, client_secret) unless its VALUE is
// a vault reference: the name of an entry in the password vault, never the secret.
//
// A vault reference is either
//   - "vault:" followed by the entry name, for example  vault:site/admin-password
//   - a sentence that starts "From the vault" or "From the password vault",
//     for example  "From the password vault, per site"   (the pattern the demo data uses)
//
// Empty values, null and true/false pass: none of them can hold a secret.

const SECRET_KEY = /(pass(word|wd)|secret|token|api[-_ ]?key|private[-_ ]?key|client[-_ ]?secret)/i;
const VAULT_REF = /^\s*(vault:\s*\S|from the (password )?vault\b)/i;

// Known harmless fields, each named by file (relative to data/) and path, where * matches
// a list position. Keep this list short and give a reason for every entry.
const ALLOWED = [
  {
    file: 'standards/cables.yaml',
    at: 'labelling.parts.*.token',
    why: 'the name of a part of a cable label (SITE, ROOM, RACK...), not a credential',
  },
];

function isAllowed(file, at) {
  const dotted = at.join('.');
  return ALLOWED.some(
    (a) =>
      a.file === file &&
      new RegExp('^' + a.at.replace(/\./g, '\\.').replace(/\*/g, '\\d+') + '$').test(dotted),
  );
}

export function looksLikeSecretKey(key) {
  return SECRET_KEY.test(String(key));
}

export function isVaultReference(value) {
  return typeof value === 'string' && VAULT_REF.test(value);
}

// Returns [{ at: [path segments], key, message }]. `at` is usable with doc.getIn().
export function findSecrets(data, file = '') {
  const found = [];
  const walk = (node, at, secretKey) => {
    if (Array.isArray(node)) {
      node.forEach((item, i) => walk(item, [...at, i], secretKey));
    } else if (node && typeof node === 'object') {
      for (const [k, v] of Object.entries(node)) walk(v, [...at, k], secretKey ?? (looksLikeSecretKey(k) ? k : null));
    } else if (secretKey) {
      if (node === null || node === undefined || typeof node === 'boolean') return;
      if (isAllowed(file, at)) return;
      if (typeof node === 'string' && (node.trim() === '' || isVaultReference(node))) return;
      found.push({
        at,
        key: secretKey,
        message:
          `field "${secretKey}" looks like a secret, and its value is not a vault reference. ` +
          `Never commit a real secret: write "vault:<entry name>" or "From the password vault, per site" instead`,
      });
    }
  };
  walk(data, [], null);
  return found;
}
