import { JournalReferenceType } from "src/enum";

export interface JournalEntryInput {
    businessNumber: string;
    date: string;
    referenceType: JournalReferenceType;
    referenceId: number;
    description?: string;
    lines: {
      accountCode: string;
      debit?: number;
      credit?: number;
    }[];
  }
  