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
  const subIndex = userIdentifier.indexOf('_sub');

  let firebaseId: string | null = null;
  let tppId: string | null = fallbackTppId || null;

  if (subIndex > 0) {
    firebaseId = userIdentifier.substring(0, subIndex);
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
