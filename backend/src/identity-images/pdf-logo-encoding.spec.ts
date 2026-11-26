import {ImageStorageService} from './image-storage.service';
import sharp = require('sharp');
import * as admin from 'firebase-admin';
jest.mock('firebase-admin',()=>({storage:jest.fn()}));
describe('PDF-only selective JPEG encoding',()=>{
  const service=new ImageStorageService();
  async function noisy(alpha=false){
    const channels=alpha?4:3,raw=Buffer.alloc(640*640*channels);let seed=12345;
    for(let i=0;i<raw.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;raw[i]=seed>>>24;}
    return sharp(raw,{raw:{width:640,height:640,channels:channels as 3|4}}).png().toBuffer();
  }
  it('compresses opaque photographic content while ordinary normalized images remain PNG',async()=>{
    const source=await noisy();const pdf=await service.normalize(source,'business',true);
    expect((await sharp(pdf).metadata()).format).toBe('jpeg');expect(pdf.length).toBeLessThan(source.length*.8);
    expect((await sharp(await service.normalize(source,'business')).metadata()).format).toBe('png');
    const metadata=await sharp(pdf).metadata();expect(metadata.width).toBe(640);expect(metadata.height).toBe(640);
  });
  it('preserves transparent PNGs and small flat artwork, without enlargement',async()=>{
    const alpha=await noisy(true);const output=await service.normalize(alpha,'business',true);
    expect((await sharp(output).metadata()).hasAlpha).toBe(true);expect((await sharp(output).metadata()).format).toBe('png');
    const flat=await sharp({create:{width:64,height:64,channels:3,background:'#fff'}}).png().toBuffer();
    const meta=await sharp(await service.normalize(flat,'business',true)).metadata();expect(meta.format).toBe('png');expect(meta.width).toBe(64);
  });
  it('serves the matching MIME type and caches JPEG separately from the original',async()=>{
    const input=await noisy(),download=jest.fn().mockResolvedValue([input]);
    (admin.storage as unknown as jest.Mock).mockReturnValue({bucket:()=>({file:()=>({getMetadata:async()=>[{size:input.length}],download})})});
    const storage=new ImageStorageService(),path='identity-images/business/1/11111111-1111-4111-8111-111111111111.png';
    expect((await storage.download(path,'pdf')).contentType).toBe('image/jpeg');
    expect((await storage.download(path)).contentType).toBe('image/png');
    await storage.download(path,'pdf');expect(download).toHaveBeenCalledTimes(2);
  });
});
