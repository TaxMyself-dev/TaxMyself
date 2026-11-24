import { signal } from '@angular/core';
import { convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { SettingsNewPage } from './settings-new.page';

// Real DOM, native scroll animation, and ResizeObserver; no mocked scrollTo.
describe('settings scroll coordination in the browser', () => {
  let wasHydrated: boolean;
  let page: any, scroller: HTMLElement, host: HTMLElement, activated: jasmine.Spy;
  const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
  async function until(check: () => boolean): Promise<void> {
    const deadline = performance.now() + 2500;
    while (!check()) {
      if (performance.now() > deadline) throw new Error('Scroll did not settle: '+JSON.stringify({scrollTop:scroller.scrollTop,scrollHeight:scroller.scrollHeight,clientHeight:scroller.clientHeight,target:page.scrollTarget,destination:page.scrollDestination,offset:offset(page.scrollTarget||'account'),display:getComputedStyle(scroller).display,flex:getComputedStyle(scroller.firstElementChild!).flex}));
      await frame();
    }
    await frame(); await frame();
  }
  function section(key: string): HTMLElement { return scroller.querySelector(`[data-settings-section="${key}"]`)!; }
  function offset(key: string): number { return section(key).getBoundingClientRect().top - scroller.getBoundingClientRect().top; }
  beforeEach(async () => {
    // Ionic hides the entire body before hydration; this fixture represents a rendered app.
    wasHydrated = document.documentElement.classList.contains('hydrated');
    document.documentElement.classList.add('hydrated');
    host = document.createElement('div');
    host.style.cssText = 'position:fixed;inset:0;z-index:9999;background:white;direction:rtl';
    host.innerHTML = `<main style="height:500px;overflow-y:auto;scroll-behavior:smooth"><div style="padding:48px 53px 80px">${['account','businesses','subscription','payment','history','categories','permissions','banking'].map(key => `<section data-settings-section="${key}" style="height:${key === 'history' ? 80 : 450}px">${key}</section>`).join('')}<footer style="height:800px"></footer></div></main>`;
    document.body.appendChild(host); scroller = host.querySelector('main')!;
    page = Object.create(SettingsNewPage.prototype);
    activated = jasmine.createSpy('activate');
    Object.assign(page, {
      scroller: {nativeElement: scroller}, businessSection: {nativeElement: section('businesses')},
      agentAccess: {canAccessAi: () => true}, activeSection: signal('account'),
      navigationSession: {open: () => ({context:'owner',section:'account'}), remember:jasmine.createSpy('remember')},
      agentRoute: {queryParamMap:of(convertToParamMap({})),snapshot:{queryParamMap:convertToParamMap({})}},
      navigationCdr: {detectChanges: () => {}}, activateSection: activated,
    });
    scroller.addEventListener('scroll', () => page.onScroll());
    for (const type of ['wheel','touchstart','pointerdown','keydown']) scroller.addEventListener(type, event => page.stopRestoringSection(event));
    page.ngAfterViewInit(); await frame(); await frame(); activated.calls.reset(); page.navigationSession.remember.calls.reset();
    expect(scroller.clientHeight).toBe(500);expect(scroller.scrollHeight).toBeGreaterThan(500);
  });
  afterEach(() => { page.ngOnDestroy(); host.remove(); if (!wasHydrated) document.documentElement.classList.remove('hydrated'); });

  it('keeps a short clicked section selected without activating sections crossed along the way', async () => {
    page.goTo('history'); await until(() => Math.abs(offset('history') - 32) <= 1);
    expect(page.activeSection()).toBe('history');
    expect(activated).toHaveBeenCalledOnceWith('history');
    expect(page.navigationSession.remember).toHaveBeenCalledOnceWith('history','owner');
  });
  it('retargets when async content above the destination grows during smooth scrolling', async () => {
    page.goTo('permissions'); await until(() => scroller.scrollTop > 10);
    section('categories').style.height = '1100px';
    await until(() => Math.abs(offset('permissions') - 32) <= 1);
    expect(page.activeSection()).toBe('permissions');expect(activated).toHaveBeenCalledOnceWith('permissions');
  });
  it('holds the anchor after arrival when earlier content grows, without repeating activation or memory writes', async () => {
    page.goTo('permissions', true); await until(() => Math.abs(offset('permissions') - 32) <= 1);
    section('categories').style.height = '1100px';await until(() => Math.abs(offset('permissions') - 32) <= 1);
    expect(activated).toHaveBeenCalledOnceWith('permissions');
    expect(page.navigationSession.remember).toHaveBeenCalledOnceWith('permissions','owner');
  });
  it('replaces an in-flight target on rapid repeated clicks', async () => {
    page.goTo('banking');await until(() => scroller.scrollTop > 10);page.goTo('payment');
    await until(() => Math.abs(offset('payment') - 32) <= 1);
    expect(page.activeSection()).toBe('payment');expect(activated.calls.allArgs()).toEqual([['banking'],['payment']]);
  });
  it('cancels the old animation when a new target is already at the current position', async () => {
    scroller.scrollTo({top:0,behavior:'instant'});page.goTo('banking');page.goTo('account');
    for (let i=0;i<12;i++) await frame();
    expect(scroller.scrollTop).toBe(0);expect(page.activeSection()).toBe('account');
  });
  for (const type of ['wheel','touchstart','pointerdown','keydown']) {
    it(`cancels animation and anchor on ${type} without snapping back on resize`, async () => {
      page.goTo('banking');await until(() => scroller.scrollTop > 10);
      const event = type === 'keydown' ? new KeyboardEvent('keydown',{key:'PageDown'}) : new Event(type);
      scroller.dispatchEvent(event);
      expect(page.scrollTarget).toBeNull();expect(page.scrollingToTarget).toBeFalse();
      const destination = scroller.scrollTop;
      scroller.querySelector('footer')!.setAttribute('style','height:1000px');
      await frame();await frame();await frame();
      expect(Math.abs(scroller.scrollTop - destination)).toBeLessThanOrEqual(1);
    });
  }
  it('does not restart scrolling for unrelated resizes and clamps the last section to the scroll range', async () => {
    scroller.querySelector('footer')!.remove();section('banking').style.height = '80px';
    const scroll = spyOn(scroller,'scrollTo').and.callThrough();page.goTo('banking',true);
    await until(() => Math.abs(scroller.scrollTop - (scroller.scrollHeight - scroller.clientHeight)) <= 1);
    const calls = scroll.calls.count();page.alignScrollTarget('smooth');page.alignScrollTarget('instant');
    expect(scroll.calls.count()).toBe(calls);expect(page.activeSection()).toBe('banking');
    scroller.style.height = '600px';await until(() => Math.abs(scroller.scrollTop - (scroller.scrollHeight - scroller.clientHeight)) <= 1);
    expect(page.activeSection()).toBe('banking');
  });
  it('keeps an anchor for typing keys but releases it for navigation keys', () => {
    page.goTo('history',true);scroller.dispatchEvent(new KeyboardEvent('keydown',{key:'a'}));
    expect(page.scrollTarget).toBe('history');scroller.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown'}));
    expect(page.scrollTarget).toBeNull();
  });
  it('uses an instant destination for reduced motion', () => {
    spyOn(window,'matchMedia').and.returnValue({matches:true} as MediaQueryList);
    const scroll:jasmine.Spy=spyOn(scroller,'scrollTo').and.callThrough();page.goTo('permissions');
    expect(scroll).toHaveBeenCalledWith(jasmine.objectContaining({behavior:'instant'}));expect(page.scrollingToTarget).toBeFalse();
  });
});
