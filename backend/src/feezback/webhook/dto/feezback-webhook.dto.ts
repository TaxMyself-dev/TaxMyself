export interface FeezbackWebhookEventPayload {
  user: string;
  consent?: string;
  flow?: string;
  context?: string;
  tpp?: string;
  fetchedAccounts?: any[];
  failedToFetchAccounts?: any[];
  currentStatus?: string;
  status?: string;
  validUntil?: string;
  expirationDate?: string;
  expires?: string;
  validFrom?: string;
  consentTerminationDate?: string;
  recurringIndicator?: boolean | string;
  aspspCode?: string;
  [key: string]: any;
}

export interface FeezbackWebhookEventBody {
  event: string;
  timestamp: string;
  payload: FeezbackWebhookEventPayload;
  [key: string]: any;
}
