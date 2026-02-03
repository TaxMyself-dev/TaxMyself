/**
 * DTO for SHAAM invoice approval response
 * Based on ResponseApproval schema from SHAAM API
 */
export class ShaamApprovalResponseDto {
  /**
   * HTTP status code
   */
  status: number;

  /**
   * Response message
   */
  message?: string | null;

  /**
   * Confirmation number (מספר הקצאה) - the allocation number
   */
  confirmation_number?: string | null;

  /**
   * Whether the invoice was approved
   */
  approved: boolean;
}

