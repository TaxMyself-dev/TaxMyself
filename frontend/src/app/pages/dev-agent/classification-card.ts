export interface ClassificationCard {
  businessNumber: string; businessName: string; date: string; merchant: string;
  amount: number; currency: string; currentCategory: string | null;
  currentSubCategory: string | null; category: string; subCategory: string;
  vatPercent: number; taxPercent: number;
  modeChoice?: boolean; isSingleUpdate?: boolean; account?: string; backfillFrom?: string;
  replacesOneTime?: boolean; replacesRule?: boolean;
  reductionPercent?: number; isEquipment?: boolean; isRecognized?: boolean;
}
/** Resolve approval presentation from the original preparation, including after reload. */
export function classificationCard(part: { type: string }, messages: readonly { role: string; parts: readonly { type: string }[] }[]): ClassificationCard | null {
  const tool = part as unknown as { type: string; toolName?: string; input?: { proposalId?: string } };
  if ((tool.toolName ?? tool.type.replace(/^tool-/, '')) !== 'classifyTransaction' || !tool.input?.proposalId) return null;
  for (const message of messages) {
    if (message.role !== 'assistant') continue;
    for (const item of message.parts) {
      const prepared = item as unknown as { type: string; state?: string; output?: { proposalId?: string; display?: ClassificationCard } };
      if (prepared.type === 'tool-prepareTransactionClassification' && prepared.state === 'output-available' && prepared.output?.proposalId === tool.input.proposalId) {
        const value = prepared.output.display;
        if (value && ['businessNumber','businessName','date','merchant','currency','category','subCategory'].every(key=>typeof (value as any)[key] === 'string') && ['amount','vatPercent','taxPercent'].every(key=>typeof (value as any)[key] === 'number' && Number.isFinite((value as any)[key]))) return value;
      }
    }
  }
  return null;
}

/** Only the mode checkbox is submitted alongside the existing approval decision. */
export function classificationApprovalDecision(id: string, approved: boolean, card: ClassificationCard | null, single: boolean): {id: string; approved: boolean; reason?: string} {
  return { id, approved, ...(approved && card?.modeChoice === true && {
    reason: single ? 'classification-mode:one-time' : 'classification-mode:rule',
  }) };
}
