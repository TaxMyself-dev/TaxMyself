import { spawn } from 'child_process';

export type IsolatedPdfResult =
  | { kind: 'readable'; pages: number }
  | { kind: 'text'; pages: number; text: string }
  | { kind: 'password_required' | 'invalid' | 'limit' | 'unavailable' };

// This program is passed to the same Node executable, with no Nest bootstrap,
// application credentials, console output or user-controlled source code.
const PROGRAM = String.raw`
const chunks = [];
let length = 0;
process.stdin.on('data', bytes => {
  length += bytes.length;
  if (length > 15 * 1024 * 1024) process.exit(2);
  chunks.push(bytes);
});
process.stdin.on('end', async () => {
  let task, document, result;
  try {
    const pdfjs = require(process.argv[1]);
    // pdf.js 1.10 reads these from PDFJS globals, NOT getDocument options.
    pdfjs.PDFJS.disableFontFace = true;
    pdfjs.PDFJS.isEvalSupported = false;
    pdfjs.PDFJS.disableWorker = true;
    pdfjs.PDFJS.verbosity = 0;
    task = pdfjs.getDocument({data: new Uint8Array(Buffer.concat(chunks)), stopAtErrors: true});
    document = await (task.promise || task);
    const pages = document.numPages;
    if (!Number.isInteger(pages) || pages < 1) result = {kind:'invalid'};
    else if (process.argv[2] === 'inspect') {
      if (pages > 100) result = {kind:'limit'};
      else {
        for(let i=1;i<=pages;i++) {
          const page=await document.getPage(i);
          await page.getOperatorList();
          page.cleanup && page.cleanup();
        }
        result={kind:'readable',pages};
      }
    } else {
      let text='';
      for(let i=1;i<=Math.min(pages,3) && text.length<20000;i++) {
        const page=await document.getPage(i);
        const content=await page.getTextContent({normalizeWhitespace:false,disableCombineTextItems:false});
        let lastY;
        for(const item of content.items) {
          text += lastY === undefined || lastY === item.transform[5] ? item.str : '\n'+item.str;
          lastY=item.transform[5];
          if(text.length>=20000)break;
        }
        text+='\n';
        page.cleanup && page.cleanup();
      }
      result={kind:'text',pages,text:text.slice(0,20000)};
    }
  } catch(error) {
    result={kind:error && error.name==='PasswordException'?'password_required':'invalid'};
  } finally {
    try { if(task && task.destroy) await task.destroy(); else if(document && document.destroy) await document.destroy(); } catch {}
  }
  if(process.send) process.send(result, () => process.disconnect());
});
`;

/** Crash/resource boundary, not a filesystem or network security sandbox. */
export function runIsolatedPdfParser(
  bytes: Uint8Array,
  mode: 'inspect' | 'text',
  timeoutMs = 15000,
): Promise<IsolatedPdfResult> {
  if (!bytes?.length) return Promise.resolve({ kind: 'invalid' });
  if (bytes.length > 15 * 1024 * 1024)
    return Promise.resolve({ kind: 'limit' });
  let parser: string;
  try {
    parser = require.resolve('pdf-parse/lib/pdf.js/v1.10.100/build/pdf.js');
  } catch {
    return Promise.resolve({ kind: 'unavailable' });
  }
  return new Promise((resolve) => {
    let done = false,
      reply: IsolatedPdfResult,
      received = false,
      timer: NodeJS.Timeout;
    let child: ReturnType<typeof spawn>;
    const finish = (result: IsolatedPdfResult, terminate = false) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (terminate) {
        try {
          child?.kill();
        } catch {}
      }
      resolve(result);
    };
    try {
      child = spawn(
        process.execPath,
        [
          '--max-old-space-size=256',
          '--unhandled-rejections=strict',
          '-e',
          PROGRAM,
          parser,
          mode,
        ],
        {
          windowsHide: true,
          stdio: ['pipe', 'ignore', 'ignore', 'ipc'],
          env: {
            SystemRoot: process.env.SystemRoot,
            WINDIR: process.env.WINDIR,
            TEMP: process.env.TEMP,
            TMP: process.env.TMP,
          },
        },
      );
      timer = setTimeout(() => finish({ kind: 'limit' }, true), timeoutMs);
      child.on('message', (message: any) => {
        if (received) {
          finish({ kind: 'invalid' }, true);
          return;
        }
        received = true;
        if (
          message &&
          ['password_required', 'invalid', 'limit'].includes(message.kind)
        )
          reply = { kind: message.kind };
        else if (
          message &&
          Number.isInteger(message.pages) &&
          message.pages > 0
        ) {
          if (
            mode === 'inspect' &&
            message.kind === 'readable' &&
            message.pages <= 100
          )
            reply = { kind: 'readable', pages: message.pages };
          if (
            mode === 'text' &&
            message.kind === 'text' &&
            typeof message.text === 'string' &&
            message.text.length <= 20000
          )
            reply = { kind: 'text', pages: message.pages, text: message.text };
        }
      });
      // A payload alone is not success: a late parser crash must still fail closed.
      child.once('close', (code) =>
        finish(code === 0 && reply ? reply : { kind: 'invalid' }),
      );
      child.once('error', () => finish({ kind: 'unavailable' }, true));
      child.stdin.on('error', () => finish({ kind: 'invalid' }, true));
      child.stdin.end(bytes);
    } catch {
      finish({ kind: 'unavailable' }, true);
    }
  });
}
