//General
import { Response } from 'express';
import { Controller, Post, Patch, Get, Query, Param, Body, Headers, UseGuards, ValidationPipe, Res, Req, UploadedFile, UseInterceptors, HttpException, HttpStatus, UsePipes, BadRequestException} from '@nestjs/common';
//Services
import { ReportsService } from './reports.service';
import { ReportReviewService, ReviewOverrides } from './report-review.service';
import { SharedService } from '../shared/shared.service';
import { UsersService } from '../users/users.service';
import { VatReportRequestDto } from './dtos/vat-report-request.dto';
import { VatReportDto } from './dtos/vat-report.dto';
import { AdvanceIncomeTaxReportDto } from './dtos/advance-income-tax-report.dto';
import { PnLReportDto } from './dtos/pnl-report.dto';
import { PnLReportRequestDto } from './dtos/pnl-report-request.dto';
import { LedgerReportDto } from './dtos/ledger-report.dto';
import { LedgerReportRequestDto } from './dtos/ledger-report-request.dto';
import { DepreciationReportRequestDto } from './dtos/depreciation-report-request.dto';
import { Form1342ReportDto } from './dtos/depreciation-report.dto';
import { FirebaseAuthGuard } from 'src/guards/firebase-auth.guard';
import { AuthenticatedRequest } from 'src/interfaces/authenticated-request.interface';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { SubscriptionGuard } from 'src/guards/subscription.guard';
import { RequireModule } from 'src/decorators/require-module.decorator';
import { DocumentKind, ModuleName } from 'src/enum';


@Controller('reports')
export class ReportsController {

    constructor(
      private reportsService: ReportsService,
      private reviewService: ReportReviewService,
      private sharedService: SharedService,
      private usersService: UsersService) { }


    // =====================================================================
    // UNIFIED REVIEW PRE-FLIGHT
    // =====================================================================
    // All endpoints here are called by the new ReportReviewDialogComponent
    // on the VAT and P&L report pages — replaces the two-step chain
    // (PullDriveDocsDialog → ConfirmTransDialog) that ran before.

    /** Cheap pre-flight (no OCR, no matcher) — does the user have anything
     *  worth reviewing before the report? Returns booleans for inbox files
     *  + unconfirmed-expense slim rows. The frontend uses this to decide
     *  whether to open the review modal at all. */
    @Get('me/preview-check')
    @UseGuards(FirebaseAuthGuard)
    async previewCheck(
      @Req() request: AuthenticatedRequest,
      @Query() query: { businessNumber: string },
    ): Promise<{ hasPendingDocs: boolean; hasUnconfirmedExpenses: boolean }> {
      const firebaseId = request.user?.firebaseId;
      if (!firebaseId) throw new BadRequestException('Not authenticated');
      const bn = query?.businessNumber?.trim();
      if (!bn) throw new BadRequestException('businessNumber is required');
      return this.reviewService.previewCheck(firebaseId, bn);
    }

    /** Preview: process inbox, run matching (if Open Banking), return the
     *  unified review rows. Body: { businessNumber, startDate, endDate }. */
    @Post('me/preview')
    @UseGuards(FirebaseAuthGuard)
    async getReportPreview(
      @Req() request: AuthenticatedRequest,
      @Body() body: { businessNumber: string; startDate: string; endDate: string },
    ) {
      const firebaseId = request.user?.firebaseId;
      if (!firebaseId) throw new BadRequestException('Not authenticated');
      const bn = body?.businessNumber?.trim();
      if (!bn) throw new BadRequestException('businessNumber is required');
      const from = this.sharedService.convertStringToDateObject(body.startDate);
      const to = this.sharedService.convertStringToDateObject(body.endDate);
      if (!from || !to) throw new BadRequestException('startDate/endDate are required ISO dates');
      return this.reviewService.getReportPreview(firebaseId, bn, { from, to });
    }

    /** Approve a "matched" row — creates one Expense linked to both the
     *  document and the transaction; flips both source rows. Inline edits
     *  made in the review modal (category/sub-category/vat%/tax%/period)
     *  ride along in `overrides` and win over the source row's values. */
    @Post('me/review/approve-matched')
    @RequireModule(ModuleName.OPEN_BANKING)
    @UseGuards(FirebaseAuthGuard, SubscriptionGuard)
    async approveMatched(
      @Req() request: AuthenticatedRequest,
      @Body() body: { businessNumber: string; documentId: number; transactionId: number; overrides?: ReviewOverrides },
    ) {
      const firebaseId = request.user?.firebaseId;
      if (!firebaseId) throw new BadRequestException('Not authenticated');
      const bn = body?.businessNumber?.trim();
      if (!bn) throw new BadRequestException('businessNumber is required');
      if (!body?.documentId || !body?.transactionId) {
        throw new BadRequestException('documentId and transactionId are required');
      }
      return this.reviewService.approveMatched(
        firebaseId, bn, Number(body.documentId), Number(body.transactionId), body.overrides ?? {},
      );
    }

    /** Approve a "doc_only" row — creates an Expense from the document
     *  alone (typical cash-receipt path). Overrides as above. */
    @Post('me/review/approve-doc-cash')
    @UseGuards(FirebaseAuthGuard)
    async approveDocCash(
      @Req() request: AuthenticatedRequest,
      @Body() body: { businessNumber: string; documentId: number; overrides?: ReviewOverrides },
    ) {
      const firebaseId = request.user?.firebaseId;
      if (!firebaseId) throw new BadRequestException('Not authenticated');
      const bn = body?.businessNumber?.trim();
      if (!bn) throw new BadRequestException('businessNumber is required');
      if (!body?.documentId) throw new BadRequestException('documentId is required');
      return this.reviewService.approveDocCash(firebaseId, bn, Number(body.documentId), body.overrides ?? {});
    }

    /** Approve a "tx_only" row — creates an Expense from the transaction
     *  alone ("mark as no-doc-needed"). Overrides as above. */
    @Post('me/review/approve-tx-no-doc')
    @RequireModule(ModuleName.OPEN_BANKING)
    @UseGuards(FirebaseAuthGuard, SubscriptionGuard)
    async approveTxNoDoc(
      @Req() request: AuthenticatedRequest,
      @Body() body: { businessNumber: string; transactionId: number; overrides?: ReviewOverrides },
    ) {
      const firebaseId = request.user?.firebaseId;
      if (!firebaseId) throw new BadRequestException('Not authenticated');
      const bn = body?.businessNumber?.trim();
      if (!bn) throw new BadRequestException('businessNumber is required');
      if (!body?.transactionId) throw new BadRequestException('transactionId is required');
      return this.reviewService.approveTxNoDoc(firebaseId, bn, Number(body.transactionId), body.overrides ?? {});
    }

    /** Manual link from a tx_only row to an existing doc_only document. */
    @Post('me/review/link-doc-to-tx')
    @UseGuards(FirebaseAuthGuard)
    async linkDocToTx(
      @Req() request: AuthenticatedRequest,
      @Body() body: { businessNumber: string; documentId: number; transactionId: number },
    ) {
      const firebaseId = request.user?.firebaseId;
      if (!firebaseId) throw new BadRequestException('Not authenticated');
      const bn = body?.businessNumber?.trim();
      if (!bn) throw new BadRequestException('businessNumber is required');
      if (!body?.documentId || !body?.transactionId) {
        throw new BadRequestException('documentId and transactionId are required');
      }
      return this.reviewService.linkDocToTx(
        firebaseId, bn, Number(body.documentId), Number(body.transactionId),
      );
    }

    /** Archive a document row — delegates to the existing per-row archive
     *  in DocumentsService (status flip; file stays in processed/). */
    @Post('me/review/archive-doc/:documentId')
    @UseGuards(FirebaseAuthGuard)
    async archiveDoc(
      @Req() request: AuthenticatedRequest,
      @Param('documentId') documentId: string,
    ) {
      const firebaseId = request.user?.firebaseId;
      if (!firebaseId) throw new BadRequestException('Not authenticated');
      return this.reviewService.archiveDoc(firebaseId, Number(documentId));
    }

    /** Delete a document row — flips status to REJECTED; the Drive file
     *  stays in processed/. See ReportReviewService.deleteDoc for the
     *  semantic distinction vs archive. */
    @Post('me/review/delete-doc/:documentId')
    @UseGuards(FirebaseAuthGuard)
    async deleteDoc(
      @Req() request: AuthenticatedRequest,
      @Param('documentId') documentId: string,
    ) {
      const firebaseId = request.user?.firebaseId;
      if (!firebaseId) throw new BadRequestException('Not authenticated');
      return this.reviewService.deleteDoc(firebaseId, Number(documentId));
    }

    /** D8 "תייק" (Phase 4.3): file a document for the ANNUAL report —
     *  terminal NOT_AN_EXPENSE + documentKind=ANNUAL_DOCUMENT; never
     *  creates an expense or journal entry. Idempotent. */
    @Post('me/review/file-doc/:documentId')
    @UseGuards(FirebaseAuthGuard)
    async fileDocAsAnnual(
      @Req() request: AuthenticatedRequest,
      @Param('documentId') documentId: string,
    ) {
      const firebaseId = request.user?.firebaseId;
      if (!firebaseId) throw new BadRequestException('Not authenticated');
      return this.reviewService.fileDocAsAnnual(firebaseId, Number(documentId));
    }

    /** D8 triage (Phase 4.3): re-kind a PENDING_REVIEW document (e.g. an
     *  UNIDENTIFIED row the user recognizes as an expense invoice). */
    @Patch('me/review/doc-kind/:documentId')
    @UseGuards(FirebaseAuthGuard)
    async setDocKind(
      @Req() request: AuthenticatedRequest,
      @Param('documentId') documentId: string,
      @Body() body: { documentKind: DocumentKind },
    ) {
      const firebaseId = request.user?.firebaseId;
      if (!firebaseId) throw new BadRequestException('Not authenticated');
      if (!body?.documentKind) throw new BadRequestException('documentKind is required');
      return this.reviewService.setDocKind(firebaseId, Number(documentId), body.documentKind);
    }

    /** Unpair an invoice↔receipt pair set by DocumentPairingService.
     *  Either side of the pair can be the entry point — the service
     *  follows the back-pointer to find the partner. */
    @Post('me/review/unpair/:documentId')
    @UseGuards(FirebaseAuthGuard)
    async unpair(
      @Req() request: AuthenticatedRequest,
      @Param('documentId') documentId: string,
    ) {
      const firebaseId = request.user?.firebaseId;
      if (!firebaseId) throw new BadRequestException('Not authenticated');
      if (!documentId) throw new BadRequestException('documentId is required');
      return this.reviewService.unpair(firebaseId, Number(documentId));
    }

    /** Upload a PDF/image as the source doc for a tx_only row and auto-
     *  link the new extracted_document to the slim transaction. multipart/
     *  form-data with `file` (required) + `businessNumber` form field.
     *  Synchronous OCR — caller waits on the Claude call. Returns the
     *  new documentId so the frontend can refresh the row in-place. */
    @Post('me/review/upload-doc-to-tx/:transactionId')
    @RequireModule(ModuleName.OPEN_BANKING)
    @UseGuards(FirebaseAuthGuard, SubscriptionGuard)
    @UseInterceptors(
      FileInterceptor('file', {
        limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB cap — generous for invoice PDFs
      }),
    )
    async uploadDocToTx(
      @Req() request: AuthenticatedRequest,
      @Param('transactionId') transactionId: string,
      @Body() body: { businessNumber: string },
      @UploadedFile() file: Express.Multer.File,
    ) {
      const firebaseId = request.user?.firebaseId;
      if (!firebaseId) throw new BadRequestException('Not authenticated');
      const bn = body?.businessNumber?.trim();
      if (!bn) throw new BadRequestException('businessNumber is required');
      if (!transactionId) throw new BadRequestException('transactionId is required');
      if (!file) throw new BadRequestException('file is required');
      return this.reviewService.uploadDocAndLinkToTx(
        firebaseId, bn, Number(transactionId), file,
      );
    }

    /** Reject a tx_only row — marks the slim transaction not-an-expense
     *  and locks it to the current period so it doesn't re-surface. */
    @Post('me/review/reject-tx')
    @RequireModule(ModuleName.OPEN_BANKING)
    @UseGuards(FirebaseAuthGuard, SubscriptionGuard)
    async rejectTx(
      @Req() request: AuthenticatedRequest,
      @Body() body: { businessNumber: string; transactionId: number },
    ) {
      const firebaseId = request.user?.firebaseId;
      if (!firebaseId) throw new BadRequestException('Not authenticated');
      const bn = body?.businessNumber?.trim();
      if (!bn) throw new BadRequestException('businessNumber is required');
      if (!body?.transactionId) throw new BadRequestException('transactionId is required');
      return this.reviewService.rejectTx(firebaseId, bn, Number(body.transactionId));
    }


    /**
     * Form 1342 (Israeli Tax Authority) — equipment depreciation report.
     * Returns one row per equipment asset purchased on or before `year`,
     * with the columns 1..11 already computed (see Form1342ReportRowDto).
     */
    @Get('depreciation-report')
    @UseGuards(FirebaseAuthGuard)
    @UsePipes(new ValidationPipe({ transform: true }))
    async getDepreciationReport(
        @Req() request: AuthenticatedRequest,
        @Query() query: DepreciationReportRequestDto,
    ): Promise<Form1342ReportDto> {
        const firebaseId = request.user?.firebaseId;
        if (!firebaseId) {
            throw new BadRequestException('Firebase ID is missing');
        }
        const year = Number(query.year);
        return this.reportsService.createForm1342Report(
            firebaseId,
            query.businessNumber,
            year,
        );
    }

    @Get('advance-income-tax-report')
    @UseGuards(FirebaseAuthGuard)
    @UsePipes(new ValidationPipe({ transform: true }))
    async getAdvanceIncomeTaxReport(
        @Req() request: AuthenticatedRequest,
        @Query() query: VatReportRequestDto,
    ): Promise<AdvanceIncomeTaxReportDto> {
        try {
            const firebaseId = request.user?.firebaseId;
            if (!firebaseId) {
                throw new BadRequestException('Firebase ID is missing');
            }
            const startDate = this.sharedService.convertStringToDateObject(query.startDate);
            const endDate = this.sharedService.convertStringToDateObject(query.endDate);
            return await this.reportsService.getAdvanceIncomeTaxReportData(
                firebaseId,
                query.businessNumber,
                startDate,
                endDate,
            );
        } catch (error) {
            console.error("❌ Error in getAdvanceIncomeTaxReport controller:", error);
            throw error;
        }
    }

    /**
     * VAT report — computed from journal entries.
     */
    @Get('vat-report-journal')
    @UseGuards(FirebaseAuthGuard)
    @UsePipes(new ValidationPipe({ transform: true }))
    async getVatReportFromJournal(
        @Req() request: AuthenticatedRequest,
        @Query() query: VatReportRequestDto,
    ): Promise<VatReportDto> {
        const firebaseId = request.user?.firebaseId;
        if (!firebaseId) {
            throw new BadRequestException('Firebase ID is missing');
        }
        const startDate = this.sharedService.convertStringToDateObject(query.startDate);
        const endDate = this.sharedService.convertStringToDateObject(query.endDate);
        return this.reportsService.createVatReportFromJournal(
            firebaseId, query.businessNumber, startDate, endDate,
        );
    }

    /**
     * P&L report — computed from journal entries.
     */
    @Get('pnl-report-journal')
    @UseGuards(FirebaseAuthGuard)
    async getPnLReportFromJournal(
        @Req() request: AuthenticatedRequest,
        @Query() query: any,
    ): Promise<PnLReportDto> {
        const firebaseId = request.user?.firebaseId;
        const startDate = this.sharedService.convertStringToDateObject(query.startDate);
        const endDate = this.sharedService.convertStringToDateObject(query.endDate);
        return this.reportsService.createPnLReportFromJournal(
            firebaseId, query.businessNumber, startDate, endDate, query.osekZair === 'true',
        );
    }

    /**
     * VAT report as a PDF (server-rendered, RTL Hebrew) — the interactive
     * "ייצא כ-PDF" button. Includes the expense line-item breakdown.
     */
    @Get('vat-report-pdf')
    @UseGuards(FirebaseAuthGuard)
    @UsePipes(new ValidationPipe({ transform: true }))
    async getVatReportPdf(
        @Req() request: AuthenticatedRequest,
        @Query() query: VatReportRequestDto,
        @Res() res: Response,
    ) {
        const firebaseId = request.user?.firebaseId;
        if (!firebaseId) {
            throw new BadRequestException('Firebase ID is missing');
        }
        const startDate = this.sharedService.convertStringToDateObject(query.startDate);
        const endDate = this.sharedService.convertStringToDateObject(query.endDate);
        const pdfBuffer = await this.reportsService.generateVatReportPdfForExport(
            firebaseId, query.businessNumber, startDate, endDate,
        );
        res.setHeader('Content-Type', 'application/pdf');
        return res.send(pdfBuffer);
    }

    /**
     * P&L report as a PDF (server-rendered, RTL Hebrew) — the interactive
     * "ייצא כ-PDF" button.
     */
    @Get('pnl-report-pdf')
    @UseGuards(FirebaseAuthGuard)
    async getPnlReportPdf(
        @Req() request: AuthenticatedRequest,
        @Query() query: any,
        @Res() res: Response,
    ) {
        const firebaseId = request.user?.firebaseId;
        if (!firebaseId) {
            throw new BadRequestException('Firebase ID is missing');
        }
        const startDate = this.sharedService.convertStringToDateObject(query.startDate);
        const endDate = this.sharedService.convertStringToDateObject(query.endDate);
        const parsedIncomeOverride = Number(query.incomeOverride);
        const incomeOverride = query.incomeOverride !== undefined && query.incomeOverride !== '' && !isNaN(parsedIncomeOverride)
            ? parsedIncomeOverride
            : undefined;
        const pdfBuffer = await this.reportsService.generatePnlReportPdfForExport(
            firebaseId, query.businessNumber, startDate, endDate, query.osekZair === 'true', incomeOverride,
        );
        res.setHeader('Content-Type', 'application/pdf');
        return res.send(pdfBuffer);
    }

    @Get('ledger-report')
    @UseGuards(FirebaseAuthGuard)
    @UsePipes(new ValidationPipe({ transform: true }))
    async getLedgerReport(
        @Req() request: AuthenticatedRequest,
        @Query() query: LedgerReportRequestDto,
    ): Promise<LedgerReportDto> {
        const firebaseId = request.user?.firebaseId;
        if (!firebaseId) {
            throw new BadRequestException('Firebase ID is missing');
        }
        const startDate = this.sharedService.convertStringToDateObject(query.startDate);
        const endDate = this.sharedService.convertStringToDateObject(query.endDate);
        return this.reportsService.createLedgerReport(
            firebaseId, query.businessNumber, startDate, endDate, query.accountCode ?? null,
        );
    }

    /** Full journal entry detail — all lines enriched with account names. */
    @Get('journal-entry/:entryId')
    @UseGuards(FirebaseAuthGuard)
    async getJournalEntryDetail(
        @Req() request: AuthenticatedRequest,
        @Param('entryId') entryId: string,
        @Query('businessNumber') businessNumber: string,
    ) {
        const firebaseId = request.user?.firebaseId;
        if (!firebaseId) throw new BadRequestException('Not authenticated');
        if (!businessNumber) throw new BadRequestException('businessNumber is required');
        return this.reportsService.getJournalEntryDetail(firebaseId, businessNumber, Number(entryId));
    }

    /** Chart of accounts for the ledger filter dropdown, scoped to the
     *  business's visible charts (Phase 6.4 — was global, leaking every
     *  tenant's custom card names into everyone's dropdown). */
    @Get('ledger-accounts')
    @UseGuards(FirebaseAuthGuard)
    async getLedgerAccounts(
        @Req() request: AuthenticatedRequest,
        @Query('businessNumber') businessNumber?: string,
    ): Promise<{ code: string; name: string; type: string }[]> {
        const firebaseId = request.user?.firebaseId;
        if (!firebaseId) {
            throw new BadRequestException('Firebase ID is missing');
        }
        return this.reportsService.getLedgerAccounts(
            businessNumber?.trim() || request.user?.businessNumber || null,
            firebaseId,
        );
    }

    /** Posting accounts for the manual journal-entry dropdown (technical
     *  accounts excluded — no section), grouped by accounting section and
     *  scoped to the business's visible charts (Phase 4.5). */
    @Get('ledger-entry-accounts')
    @UseGuards(FirebaseAuthGuard)
    async getLedgerEntryAccounts(
        @Req() request: AuthenticatedRequest,
        @Query('businessNumber') businessNumber?: string,
    ): Promise<{ code: string; name: string; type: string; sectionCode: string | null; sectionName: string | null }[]> {
        const firebaseId = request.user?.firebaseId;
        if (!firebaseId) {
            throw new BadRequestException('Firebase ID is missing');
        }
        return this.reportsService.getLedgerEntryAccounts(businessNumber?.trim() || null, firebaseId);
    }


    /**
     * Self-employed user clicks "סמן כדווח" on the VAT/PnL report page after
     * submitting at the tax authority. Locks every transaction stamped with
     * the matching period label. Idempotent — already-locked rows stay locked.
     */
    @Post('mark-submitted')
    @UseGuards(FirebaseAuthGuard)
    async markSubmitted(
        @Req() request: AuthenticatedRequest,
        @Body() body: { businessNumber: string; startDate: string },
    ): Promise<{ count: number; periodLabel: string }> {
        const firebaseId = request.user?.firebaseId;
        if (!firebaseId) throw new BadRequestException('Firebase ID is missing');
        if (!body?.businessNumber) throw new BadRequestException('businessNumber is required');
        if (!body?.startDate) throw new BadRequestException('startDate is required');
        const startDate = this.sharedService.convertStringToDateObject(body.startDate);
        return this.reportsService.markReportAsSubmitted(firebaseId, body.businessNumber, startDate);
    }


    /**
     * Was the report for `(businessNumber, startDate)` already marked as
     * submitted? Frontend swaps the "סמן כדווח" button for a "הדוח הוגש"
     * success indicator when true.
     */
    @Get('submission-status')
    @UseGuards(FirebaseAuthGuard)
    async submissionStatus(
        @Req() request: AuthenticatedRequest,
        @Query() query: { businessNumber: string; startDate: string },
    ): Promise<{ isSubmitted: boolean; periodLabel: string }> {
        const firebaseId = request.user?.firebaseId;
        if (!firebaseId) throw new BadRequestException('Firebase ID is missing');
        if (!query?.businessNumber) throw new BadRequestException('businessNumber is required');
        if (!query?.startDate) throw new BadRequestException('startDate is required');
        const startDate = this.sharedService.convertStringToDateObject(query.startDate);
        return this.reportsService.getReportSubmissionStatus(firebaseId, query.businessNumber, startDate);
    }


    @RequireModule(ModuleName.INVOICES)
    @UseGuards(FirebaseAuthGuard, SubscriptionGuard)
    @Post('create-uniform-file')
    async getHelloWorldZip(
        @Req() request: AuthenticatedRequest,
        @Body() body: any,
        @Res() res: Response) {  
            const userId = request.user?.firebaseId;
            console.log("startDate is ", body.startDate);
            console.log("endDate is ", body.endDate);
            console.log("businessNumber is ", body.businessNumber);

            const { filePath, zipBuffer, document_summary, list_summary } =
            await this.reportsService.createUniformFile(
              userId,
              body.startDate,
              body.endDate,
              body.businessNumber
            );

                    // ✅ Print the response data before sending
        const responseData = {
          filePath,
          file: zipBuffer.toString('base64'),
          document_summary,
          list_summary,
        };
        
      
        // respond with JSON: { fileName, file (base64), arrays }
        res.json(responseData);

          // // respond with JSON: { fileName, file (base64), arrays }
          // res.json({
          //   filePath,
          //   file: zipBuffer.toString('base64'),
          //   document_summary,
          //   list_summary,
          // });
        
    }


    @Get('summary')
    async getDocumentsSummary(
      @Query('startDate') startDate: string,
      @Query('endDate') endDate: string,
      @Query('businessNumber') businessNumber: string,
    ) {
    
      if (!startDate || !endDate || !businessNumber) {
        return {
          error: 'Missing required query parameters: startDate, endDate, businessNumber',
        };
      }

      const summary = await this.reportsService.getDocsSummary(
        startDate,
        endDate,
        businessNumber,
      );

    // Convert string numbers to real numbers for clean JSON
    return summary.map((row) => ({
      docType: row.docType,
      totalDocs: Number(row.totalDocs),
      totalSum: Number(row.totalSum),
    }));
  }



    @Post('upload-and-debug')
    @UseInterceptors(
      FileInterceptor('file', {
        storage: diskStorage({
          destination: './src/generated/', // Save uploaded files here
          filename: (req, file, callback) => {
            const fileExt = extname(file.originalname);
            const fileName = file.originalname.replace(fileExt, '') + '-' + Date.now() + fileExt;
            callback(null, fileName);
          }
        })
      })
    )
    async uploadAndDebug(@UploadedFile() file: Express.Multer.File, @Res() res: Response) {
      if (!file) {
        throw new HttpException('No file uploaded', HttpStatus.BAD_REQUEST);
      }
  
      try {
        // Parse and generate debug file
        const debugFilePath = await this.reportsService.parseAndSaveDebugFile(file.filename);
  
        // Send the debug file as a download
        res.download(debugFilePath);
      } catch (error) {
        throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
      }
    }


}