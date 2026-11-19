import { DocumentProcessorService } from '../documents/document-processor.service';
describe('Protected PDF final AI boundary', () => {
  const previous = process.env.PROTECTED_PDF_ENABLED;
  afterEach(() => {
    if (previous === undefined) delete process.env.PROTECTED_PDF_ENABLED;
    else process.env.PROTECTED_PDF_ENABLED = previous;
  });
  it.each(['password_required', 'invalid', 'limit'])(
    'never calls AI for %s PDFs',
    async (kind) => {
      process.env.PROTECTED_PDF_ENABLED = 'true';
      const inspect = jest.fn().mockResolvedValue({ kind });
      const processor = new DocumentProcessorService({ inspect } as any);
      const create = jest.fn();
      (processor as any).client = { messages: { create } };
      await expect(
        processor.extract(Buffer.from('%PDF-synthetic'), 'application/pdf'),
      ).rejects.toThrow();
      expect(create).not.toHaveBeenCalled();
    },
  );
});
