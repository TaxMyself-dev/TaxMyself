export interface ParsedUserIdentifier {
  firebaseId: string | null;
  tppId: string | null;
  userIdentifier: string | null;
}

export function parseFeezbackUserIdentifier(userIdentifier?: string | null, fallbackTppId?: string | null): ParsedUserIdentifier {
  if (!userIdentifier || typeof userIdentifier !== 'string') {
    return {
      firebaseId: null,
      tppId: fallbackTppId || null,
      userIdentifier: userIdentifier || null,
    };
  }

  const atIndex = userIdentifier.indexOf('@');
  const rawSub = atIndex >= 0 ? userIdentifier.substring(0, atIndex) : userIdentifier;
  const suffix = rawSub.endsWith('_sub_spouse') ? '_sub_spouse' : rawSub.endsWith('_sub') ? '_sub' : null;

  let firebaseId: string | null = null;
  let tppId: string | null = fallbackTppId || null;

  if (suffix) {
    firebaseId = rawSub.slice(0, -suffix.length);
  } else if (atIndex > 0) {
    firebaseId = userIdentifier.substring(0, atIndex);
  }

  if (atIndex >= 0 && atIndex + 1 < userIdentifier.length) {
    tppId = userIdentifier.substring(atIndex + 1);
  }

  return {
    firebaseId: firebaseId || null,
    tppId: tppId || null,
    userIdentifier,
  };
}

export function extractFirebaseIdFromContext(context: string): string {
  if (context.endsWith('_context')) {
    return context.replace('_context', '');
  }

  return context;
}
