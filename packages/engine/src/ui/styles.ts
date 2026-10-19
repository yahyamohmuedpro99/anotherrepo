/**
 * The HUD stylesheet, scoped to `.rihla`. Look carried over from the prototypes: night glass, gold hairlines,
 * khayamiya tent-cloth band (Giza) or a lapis mission ribbon (space), Ruqaa calligraphy for names.
 * Layout uses logical properties so RTL mirrors automatically.
 */
const KHAYAMIYA = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='10'%3E%3Crect width='24' height='10' fill='%23f1e3c6'/%3E%3Cpath d='M0 10L6 0L12 10Z' fill='%23c4533c'/%3E%3Cpath d='M12 10L18 0L24 10Z' fill='%232f63b0'/%3E%3Cpath d='M6 0L12 10L18 0Z' fill='%23e8b54b'/%3E%3Ccircle cx='12' cy='3.4' r='1.3' fill='%23239a8c'/%3E%3C/svg%3E")`;
const DIAMONDS = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='8'%3E%3Crect width='20' height='8' fill='%23142a5c'/%3E%3Cpath d='M5 0L9 4L5 8L1 4Z' fill='%23e9b44c'/%3E%3Ccircle cx='15' cy='4' r='1.6' fill='%2333b7a9'/%3E%3C/svg%3E")`;

export function themeVars(preset: 'lapis' | 'space', band: 'khayamiya' | 'diamonds'): string {
  const lapis = preset === 'lapis';
  return [
    `--lapis:${lapis ? '#0c1530' : '#02030a'}`,
    `--glass:${lapis ? 'rgba(11,19,40,.80)' : 'rgba(8,14,34,.80)'}`,
    `--glass-hi:${lapis ? 'rgba(25,39,76,.86)' : 'rgba(22,34,72,.86)'}`,
    `--line:${lapis ? 'rgba(240,206,140,.26)' : 'rgba(236,204,140,.26)'}`,
    `--papyrus:${lapis ? '#f6ead0' : '#f4ecda'}`,
    `--muted:${lapis ? '#d0be98' : '#c3b89f'}`,
    `--band:${band === 'khayamiya' ? KHAYAMIYA : DIAMONDS}`,
    `--band-size:${band === 'khayamiya' ? '21px 7px' : '18px 7px'}`,
    `--bg:${lapis ? '#c99a63' : '#02030a'}`,
  ].join(';');
}

export const CSS = `
.rihla{--gold:#e9b44c;--gold-hi:#f6d58a;--gold-ink:#2b1c04;--faience:#33b7a9;--carnelian:#cf5a40;
 --f-title:"Aref Ruqaa","Reem Kufi",Tahoma,serif;--f-alt:"Reem Kufi","Trebuchet MS",Tahoma,sans-serif;--f-label:"Reem Kufi","Trebuchet MS",Tahoma,sans-serif;
 --f-body:"IBM Plex Sans Arabic",system-ui,-apple-system,"Segoe UI",Tahoma,sans-serif;--f-glyph:"Noto Sans Egyptian Hieroglyphs","Segoe UI Historic",serif;--ls:0;--rs:1;
 position:absolute;inset:0;overflow:hidden;background:var(--bg);color:var(--papyrus);font:calc(15px*var(--rs))/1.5 var(--f-body);-webkit-font-smoothing:antialiased;-webkit-tap-highlight-color:transparent;color-scheme:dark;contain:strict}
.rihla.en{--f-title:"Reem Kufi","Trebuchet MS",Tahoma,sans-serif;--f-alt:"Aref Ruqaa","Reem Kufi",Tahoma,serif;--ls:.14em}
.rihla *{box-sizing:border-box}
.rihla [hidden]{display:none!important}
.rihla canvas.r-scene{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;outline:none}
.rihla .r-vignette{position:absolute;inset:0;pointer-events:none;z-index:1;background:radial-gradient(ellipse 85% 75% at 50% 45%,transparent 55%,rgba(20,10,4,.38) 100%)}
.rihla button{font-family:inherit}
.rihla svg.i{width:18px;height:18px;flex:none;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.rihla .r-labels{position:absolute;inset:0;pointer-events:none;z-index:1;overflow:hidden;user-select:none;-webkit-user-select:none}
.rihla .tag{position:absolute;left:0;top:0;display:flex;flex-direction:column;align-items:center;gap:5px;pointer-events:auto;cursor:pointer;will-change:transform}
.rihla .tag.me{pointer-events:none}
.rihla .tag .name{display:flex;align-items:center;gap:6px;padding:3px 10px 3px 8px;border-radius:999px;background:var(--glass);border:1px solid var(--line);font-size:13px;font-weight:500;white-space:nowrap;color:var(--papyrus);box-shadow:0 4px 14px rgba(5,10,25,.28)}
.rihla .tag.npc .name,.rihla .tag.body .name{border-color:rgba(233,180,76,.7);font-family:var(--f-title);font-size:15px;padding-block:1px}
.rihla .tag.ride .name,.rihla .tag.craft .name{border-color:rgba(51,183,169,.65)}
.rihla .tag.gold .name{border-color:rgba(233,180,76,.75);background:rgba(60,40,6,.75)}
.rihla .tag.small .name{font-size:12.5px}
.rihla .tag .dot{width:9px;height:9px;border-radius:50%;flex:none;box-shadow:inset 0 0 0 1px rgba(255,255,255,.4)}
.rihla .tag .ok{display:grid;place-items:center;width:16px;height:16px;border-radius:50%;background:var(--gold);color:var(--gold-ink);font:700 10px/1 var(--f-body)}
.rihla .tag .chip{font:600 10.5px/1.5 var(--f-label);color:var(--gold-ink);background:linear-gradient(180deg,var(--gold-hi),var(--gold));padding:0 7px;border-radius:999px}
.rihla .tag .bang{display:grid;place-items:center;width:17px;height:17px;border-radius:50%;background:var(--gold);color:var(--gold-ink);font-weight:700;font-size:11px;box-shadow:0 0 10px rgba(233,180,76,.8)}
.rihla .tag svg.i{width:15px;height:15px;color:var(--gold-hi)}
.rihla .bubble{max-width:220px;padding:6px 11px;border-radius:14px;background:var(--papyrus);color:var(--lapis);font-size:13.5px;line-height:1.4}
.rihla .mlabel{position:absolute;left:0;top:0;font:600 16px/1 var(--f-title);color:var(--papyrus);text-shadow:0 1px 10px rgba(10,15,30,.85);white-space:nowrap;pointer-events:none;letter-spacing:var(--ls)}
.rihla .card{background:linear-gradient(180deg,var(--glass-hi),var(--glass));border:1px solid var(--line);border-radius:18px;backdrop-filter:blur(12px) saturate(1.15);-webkit-backdrop-filter:blur(12px) saturate(1.15);box-shadow:inset 0 1px 0 rgba(255,236,196,.09),0 14px 34px rgba(5,8,20,.34);pointer-events:auto;overflow:hidden}
.rihla .band{height:7px;background:var(--band) repeat-x;background-size:var(--band-size);box-shadow:0 1px 0 rgba(0,0,0,.3)}
.rihla .kicker{font:500 11.5px/1.3 var(--f-label);letter-spacing:var(--ls);text-transform:uppercase;color:var(--gold)}
.rihla .btn{pointer-events:auto;appearance:none;border:1px solid var(--line);background:var(--glass);color:var(--papyrus);font:500 14px/1 var(--f-body);padding:9px 14px;border-radius:999px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:40px;touch-action:manipulation;backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);box-shadow:0 6px 18px rgba(5,8,20,.25);white-space:nowrap;user-select:none;-webkit-user-select:none}
.rihla .btn:hover{border-color:rgba(233,180,76,.65)}
.rihla .btn:focus-visible,.rihla .icon:focus-visible,.rihla .opt:focus-visible,.rihla .chipb:focus-visible,.rihla .thumb:focus-visible,.rihla canvas.r-mini:focus-visible{outline:2px solid var(--gold-hi);outline-offset:2px}
.rihla .btn.gold{background:linear-gradient(180deg,#f4d07c,#d79e36);color:var(--gold-ink);border-color:rgba(255,230,170,.5);font-weight:600;box-shadow:inset 0 1px 0 rgba(255,255,255,.45),0 6px 16px rgba(120,70,0,.35)}
.rihla .btn.teal{background:linear-gradient(180deg,#46d3c4,#21998d);color:#04201d;border-color:rgba(160,255,240,.4);font-weight:600}
.rihla .btn.sm{min-height:32px;padding:6px 12px;font-size:13px}
.rihla .btn.round{width:62px;height:62px;border-radius:50%;padding:0;flex-direction:column;gap:2px;font-size:12px}
.rihla .btn.round svg.i{width:22px;height:22px}
.rihla .btn.round.on{border-color:var(--gold);background:rgba(233,180,76,.28)}
.rihla .btn:disabled{opacity:.5;cursor:default}
.rihla .btn .kbd{font:600 10.5px/1 var(--f-body);padding:3px 5px;border-radius:5px;background:rgba(43,28,4,.18);border:1px solid rgba(43,28,4,.25)}
.rihla .cnt{background:var(--gold);color:var(--gold-ink);font:600 11px/1 var(--f-body);padding:3px 7px;border-radius:999px}
.rihla .net{width:8px;height:8px;border-radius:50%;background:#8b8b8b;flex:none}.rihla .net.on{background:#5fd38a;box-shadow:0 0 8px rgba(95,211,138,.8)}
.rihla .icon{appearance:none;border:0;background:transparent;color:var(--papyrus);width:38px;height:38px;border-radius:50%;font-size:22px;line-height:1;cursor:pointer;flex:none}
.rihla .icon:hover{background:rgba(244,231,201,.1)}
.rihla .r-hud{position:absolute;inset:0;z-index:2;pointer-events:none;display:grid;grid-template-rows:auto 1fr auto auto;row-gap:8px;
 padding-top:calc(env(safe-area-inset-top,0px) + 12px);padding-bottom:calc(env(safe-area-inset-bottom,0px) + 14px);padding-inline:max(16px,env(safe-area-inset-left,0px));user-select:none;-webkit-user-select:none}
.rihla .r-hud>*{min-width:0}
.rihla .top{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}
.rihla .side{display:flex;flex-direction:column;gap:8px;align-items:flex-start;min-width:0}
.rihla .side.end{align-items:flex-end}
.rihla .qcard{width:min(290px,calc(100vw - 176px))}
.rihla .qbody{padding:10px 13px 12px}
.rihla .qtitle{font:700 21px/1.15 var(--f-title);color:var(--gold-hi);margin-top:2px}
.rihla .scarabs{display:flex;gap:4px;margin-top:6px}
.rihla .scarab{width:20px;height:23px;color:var(--faience)}
.rihla .scarab .sb,.rihla .scarab .sh{fill:none;stroke:var(--faience);stroke-width:1.6}
.rihla .scarab .lg{stroke:var(--faience);stroke-width:1.5;stroke-linecap:round;opacity:.7}
.rihla .scarab .sm{stroke:transparent;stroke-width:1.2}
.rihla .scarab.on .sb,.rihla .scarab.on .sh{fill:var(--faience);filter:drop-shadow(0 0 4px rgba(51,183,169,.8))}
.rihla .scarab.on .sm{stroke:rgba(10,30,30,.6)}
.rihla .dots{display:flex;gap:5px}
.rihla .dots i{width:12px;height:12px;border-radius:50%;border:1.5px solid var(--faience)}
.rihla .dots i.on{background:var(--faience);box-shadow:0 0 8px rgba(51,183,169,.8)}
.rihla .dots.diamonds i{border-color:var(--gold);border-radius:3px;transform:rotate(45deg);width:10px;height:10px}
.rihla .dots.diamonds i.on{background:var(--gold);box-shadow:0 0 8px rgba(233,180,76,.8)}
.rihla .goal{font-size:14px;line-height:1.45;margin-top:4px}
.rihla .cta{display:flex;gap:6px;flex-wrap:wrap;margin-top:9px}
.rihla .stats{display:grid;grid-template-columns:auto 1fr;gap:3px 10px;margin:8px 0 0;font-size:13px}
.rihla .stats dt{color:var(--muted)}.rihla .stats dd{margin:0;font-variant-numeric:tabular-nums}
.rihla .note{font-size:12.5px;color:var(--muted);margin-top:6px;line-height:1.45}
.rihla .finds{display:flex;align-items:center;gap:8px;margin-top:8px;font-size:12.5px;color:var(--muted);flex-wrap:wrap}
.rihla .vtitle{font:700 19px/1.2 var(--f-title);color:var(--gold-hi);margin-top:2px}
.rihla .vsub{font-size:13.5px;line-height:1.5;margin-top:3px;font-variant-numeric:tabular-nums}
.rihla .altbar{height:6px;border-radius:999px;background:rgba(244,231,201,.12);margin-top:8px;overflow:hidden}
.rihla .altbar i{display:block;height:100%;width:0;background:linear-gradient(90deg,var(--faience),var(--gold));border-radius:999px}
.rihla .row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.rihla .mapwrap{position:relative;flex:none;width:132px;height:132px;pointer-events:auto}
.rihla canvas.r-mini{display:block;width:132px;height:132px;border-radius:50%;cursor:pointer;box-shadow:0 0 0 3px rgba(11,19,40,.9),0 0 0 4.5px var(--gold),0 10px 28px rgba(5,8,20,.45)}
.rihla .north{position:absolute;top:-8px;left:50%;transform:translateX(-50%);width:22px;height:22px;border-radius:50%;background:linear-gradient(180deg,var(--gold-hi),var(--gold));color:var(--gold-ink);font:700 12px/22px var(--f-label);text-align:center;pointer-events:none}
.rihla .mid{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:10px;padding-block:8px;min-height:0}
.rihla .place{position:absolute;top:5%;left:50%;transform:translate(-50%,8px);text-align:center;opacity:0;transition:opacity 1s ease,transform 1s ease;pointer-events:none;width:100%}
.rihla .place.on{opacity:1;transform:translate(-50%,0)}
.rihla .placeA{font:700 clamp(30px,6vw,48px)/1.15 var(--f-title);color:var(--gold-hi);text-shadow:0 2px 18px rgba(30,12,0,.7);text-wrap:balance}
.rihla .placeB{font:500 clamp(14px,2.4vw,18px)/1.3 var(--f-alt);color:var(--papyrus);letter-spacing:var(--ls);text-shadow:0 1px 10px rgba(10,15,30,.7);margin-top:2px}
.rihla .toasts{display:flex;flex-direction:column;gap:6px;align-items:center;width:min(480px,100%)}
.rihla .toast{pointer-events:auto;max-width:100%;padding:10px 15px;border-radius:14px;background:var(--glass);border:1px solid var(--line);color:var(--papyrus);font:500 14px/1.5 var(--f-body);box-shadow:0 8px 24px rgba(5,10,25,.3);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);text-align:center;transition:opacity .35s ease,transform .35s ease;overflow-wrap:anywhere}
.rihla button.toast{cursor:pointer;border-color:rgba(233,180,76,.65)}
.rihla .toast.gold{background:linear-gradient(180deg,#f4d07c,#d79e36);color:var(--gold-ink);border-color:transparent;font-weight:600}
.rihla .toast.warn{border-color:rgba(207,90,64,.8);background:rgba(70,18,10,.85)}
.rihla .toast.out{opacity:0;transform:translateY(-6px)}
.rihla .hint{padding:9px 15px;font-size:13px;line-height:1.6;text-align:center;max-width:620px}
.rihla .hint b{color:var(--gold-hi);font-weight:600}
.rihla .ocard{width:min(460px,100%)}
.rihla .orow{display:flex;align-items:center;gap:14px;flex-wrap:wrap}
.rihla .orow .grow{flex:1;min-width:150px}
.rihla .swatch{width:46px;height:46px;border-radius:50%;flex:none;box-shadow:inset -8px -6px 14px rgba(0,0,0,.55),0 0 0 2px rgba(233,180,76,.5)}
.rihla .dialog{width:min(600px,100%)}
.rihla .dlg{display:grid;grid-template-columns:auto 1fr;gap:10px 14px;padding:14px 16px 12px;align-items:start}
.rihla .portrait{width:54px;height:54px;border-radius:50%;display:grid;place-items:center;background:radial-gradient(circle at 35% 30%,#2b3e78,#0e1834);box-shadow:0 0 0 2px var(--gold),0 0 0 6px rgba(233,180,76,.16);font:700 27px/1 var(--f-title);color:var(--gold-hi);overflow:hidden}
.rihla .portrait .scarab{width:28px;height:32px}.rihla .portrait svg.i{width:28px;height:28px}
.rihla .who{font:700 19px/1.25 var(--f-title);color:var(--gold-hi)}
.rihla .dtext{font-size:calc(16px*var(--rs));line-height:1.7;margin:4px 0 0;text-wrap:pretty}
.rihla .dmedia{grid-column:1/-1}.rihla .dmedia img{max-width:100%;border-radius:10px;display:block}
.rihla .dsrc{grid-column:1/-1;font-size:11.5px;color:var(--muted)}
.rihla .opts{grid-column:1/-1;display:grid;gap:8px}
.rihla .opt{appearance:none;text-align:start;border:1px solid var(--line);background:rgba(244,231,201,.06);color:var(--papyrus);font:500 15px/1.4 var(--f-body);padding:11px 14px;border-radius:12px;cursor:pointer}
.rihla .opt:hover{border-color:var(--gold)}
.rihla .opt.prime{border-color:var(--gold);background:rgba(233,180,76,.18)}
.rihla .opt.right{background:rgba(51,183,169,.25);border-color:var(--faience)}
.rihla .opt.wrong{background:rgba(207,90,64,.22);border-color:var(--carnelian)}
.rihla .opt.picked{border-color:var(--gold-hi);background:rgba(233,180,76,.25)}
.rihla .numrow{grid-column:1/-1;display:flex;gap:8px;align-items:center}
.rihla .numrow input,.rihla input.r-text{flex:1;min-width:0;appearance:none;border:1px solid var(--line);background:rgba(244,231,201,.08);color:var(--papyrus);font:16px/1.3 var(--f-body);padding:11px 14px;border-radius:12px;outline:none}
.rihla .numrow input:focus,.rihla input.r-text:focus{border-color:var(--gold)}
.rihla .dacts{grid-column:1/-1;display:flex;justify-content:flex-end;gap:8px}
.rihla .travelbar{pointer-events:auto;display:flex;gap:8px;overflow-x:auto;padding:2px 2px 4px;scrollbar-width:none;justify-content:safe center;-webkit-mask-image:linear-gradient(90deg,transparent,#000 16px,#000 calc(100% - 16px),transparent);mask-image:linear-gradient(90deg,transparent,#000 16px,#000 calc(100% - 16px),transparent)}
.rihla .travelbar::-webkit-scrollbar{display:none}
.rihla .chipb{appearance:none;flex:none;display:inline-flex;align-items:center;gap:7px;border:1px solid var(--line);background:var(--glass);color:var(--papyrus);font:600 14.5px/1 var(--f-title);padding:6px 12px 6px 8px;border-radius:999px;cursor:pointer;min-height:38px;backdrop-filter:blur(10px)}
.rihla .chipb .pd{width:18px;height:18px;border-radius:50%;box-shadow:inset -3px -2px 5px rgba(0,0,0,.5)}
.rihla .chipb.here{border-color:var(--gold);background:rgba(233,180,76,.2)}
.rihla .chipb .ok{display:grid;place-items:center;width:15px;height:15px;border-radius:50%;background:var(--gold);color:var(--gold-ink);font:700 9px/1 var(--f-body)}
.rihla .bottom{display:flex;justify-content:space-between;align-items:flex-end;gap:12px}
.rihla .joy{pointer-events:auto;width:136px;height:136px;border-radius:50%;background:radial-gradient(circle,rgba(11,19,40,.25),rgba(11,19,40,.5));border:1px solid var(--line);position:relative;touch-action:none;flex:none;backdrop-filter:blur(6px)}
.rihla .joy::after{content:"";position:absolute;inset:18px;border-radius:50%;border:1px dashed rgba(233,180,76,.35)}
.rihla .joy .knob{position:absolute;left:50%;top:50%;width:60px;height:60px;margin:-30px 0 0 -30px;border-radius:50%;background:radial-gradient(circle at 40% 35%,#fff7e4,#e9d7ae);box-shadow:0 0 0 2px rgba(233,180,76,.7),0 6px 16px rgba(5,10,25,.35);z-index:1}
.rihla .joy.run .knob{background:radial-gradient(circle at 40% 35%,#ffe7a8,#e9b44c)}
.rihla .br{margin-inline-start:auto;justify-content:flex-end;align-items:flex-end}
.rihla .act{min-height:52px;padding:10px 18px;font-size:15px;border-radius:16px;max-width:min(230px,46vw)}
.rihla .act .lbl{overflow:hidden;text-overflow:ellipsis}
.rihla .modal{position:absolute;inset:0;z-index:5;display:flex;align-items:center;justify-content:center;background:rgba(8,14,30,.55);overflow-y:auto;padding:calc(env(safe-area-inset-top,0px) + 16px) max(16px,env(safe-area-inset-left,0px)) calc(env(safe-area-inset-bottom,0px) + 16px)}
.rihla .pane{width:min(600px,100%);margin:auto}
.rihla .pbody{padding:12px 16px 16px}
.rihla .ph{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:0 2px 8px}
.rihla .ph h2{font:700 22px/1.2 var(--f-title);color:var(--gold-hi);margin:0}
.rihla .psub{font-size:13.5px;color:var(--muted);margin-top:-4px}
.rihla .entry{display:grid;grid-template-columns:auto 1fr auto;gap:2px 12px;align-items:center;padding:10px 0;border-top:1px solid var(--line)}
.rihla .entry:first-of-type{border-top:0}
.rihla .entry .ai{width:38px;height:38px;border-radius:50%;display:grid;place-items:center;background:rgba(244,231,201,.07);border:1px solid var(--line);color:var(--gold-hi)}
.rihla .entry.done .ai{background:linear-gradient(180deg,#f4d07c,#d79e36);color:var(--gold-ink);border-color:transparent}
.rihla .entry .an b{display:block;font-weight:600}
.rihla .entry .an small{display:block;color:var(--muted);font-size:12.5px;line-height:1.45}
.rihla .sec{font:700 18px/1.2 var(--f-title);color:var(--gold-hi);margin:16px 0 2px;display:flex;align-items:center;gap:8px}
.rihla .album{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px;margin-top:10px}
.rihla .thumb{appearance:none;padding:0;border:1px solid var(--line);border-radius:10px;overflow:hidden;cursor:pointer;background:#000;aspect-ratio:16/10}
.rihla .thumb img{display:block;width:100%;height:100%;object-fit:cover}
.rihla .pnote{font-size:12.5px;color:var(--muted);text-align:center;margin-top:10px;line-height:1.6}
.rihla .stamps{display:grid;grid-template-columns:repeat(auto-fill,minmax(88px,1fr));gap:14px 8px;margin-top:14px}
.rihla .stamp{display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center}
.rihla .stamp .disc{position:relative;width:58px;height:58px;border-radius:50%;box-shadow:inset -10px -8px 16px rgba(0,0,0,.55);filter:grayscale(.85) brightness(.6)}
.rihla .stamp.got .disc{filter:none;box-shadow:inset -10px -8px 16px rgba(0,0,0,.45),0 0 0 3px var(--gold),0 0 18px rgba(233,180,76,.35)}
.rihla .stamp.thump .disc{animation:rthump .5s ease}
@keyframes rthump{0%{transform:scale(1.8) rotate(-18deg);opacity:0}60%{transform:scale(.92) rotate(3deg);opacity:1}100%{transform:none}}
.rihla .stamp .disc b{position:absolute;inset:auto -4px -4px auto;width:22px;height:22px;border-radius:50%;background:var(--gold);color:var(--gold-ink);display:none;place-items:center;font:700 12px/1 var(--f-body);transform:rotate(-12deg)}
.rihla .stamp.got .disc b{display:grid}
.rihla .stamp span{font:600 14px/1.2 var(--f-title)}.rihla .stamp small{font-size:11px;color:var(--muted)}
.rihla .cert{margin-top:16px;padding:14px;border-radius:14px;border:1px solid var(--gold);background:radial-gradient(circle at 50% 0,rgba(233,180,76,.18),transparent 70%);text-align:center}
.rihla .cert h3{font:700 24px/1.2 var(--f-title);color:var(--gold-hi);margin:0 0 6px}
.rihla .chk{width:22px;height:22px;border-radius:50%;flex:none;display:grid;place-items:center;border:1.5px solid var(--line);font:700 12px/1 var(--f-body)}
.rihla .chk.on{background:var(--gold);color:var(--gold-ink);border-color:transparent}
.rihla .cartwrap{display:flex;justify-content:center;margin-top:6px}.rihla .cartwrap img{max-width:100%;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.35)}
.rihla .legend{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-top:12px}
.rihla .legend span{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;background:rgba(244,231,201,.07);border:1px solid var(--line);font-size:13px}
.rihla .legend b{font:400 22px/1 var(--f-glyph);color:var(--gold-hi)}
.rihla .mrow{display:flex;justify-content:center;gap:8px;margin-top:12px;flex-wrap:wrap}
.rihla .bigmap canvas{display:block;border-radius:12px;cursor:crosshair;max-width:100%;touch-action:none;box-shadow:inset 0 0 0 1px var(--line)}
.rihla .intro{position:absolute;inset:0;z-index:6;display:flex;overflow-y:auto;padding:calc(env(safe-area-inset-top,0px) + 20px) max(16px,env(safe-area-inset-left,0px)) calc(env(safe-area-inset-bottom,0px) + 20px);background:linear-gradient(180deg,rgba(12,21,48,0) 0%,rgba(12,21,48,.55) 100%)}
.rihla .icard{margin:auto;width:min(560px,100%)}
.rihla .ibody{padding:20px 24px 20px}
.rihla .irow{display:flex;justify-content:space-between;align-items:center;gap:12px}
.rihla .lang{appearance:none;border:1px solid var(--line);background:rgba(244,231,201,.06);color:var(--papyrus);font:500 13px/1 var(--f-body);padding:8px 13px;border-radius:999px;cursor:pointer;min-height:34px}
.rihla .ititle{font:700 clamp(46px,11vw,72px)/1.05 var(--f-title);margin:10px 0 0;background:linear-gradient(180deg,#fbe3a6 10%,#e2a640 90%);-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 2px 10px rgba(120,60,0,.35));text-wrap:balance}
.rihla.en .ititle{font-size:clamp(36px,8vw,54px)}
.rihla .ialt{font:500 clamp(16px,3.4vw,22px)/1.3 var(--f-alt);opacity:.85;letter-spacing:var(--ls);margin-top:2px}
.rihla.en .ialt{font-size:clamp(22px,4.6vw,30px);color:var(--gold-hi);opacity:1;letter-spacing:0}
.rihla .orn{display:flex;align-items:center;gap:10px;margin:16px 0 4px}
.rihla .orn span{flex:1;height:1px;background:linear-gradient(90deg,transparent,var(--gold),transparent)}
.rihla .orn i{width:8px;height:8px;transform:rotate(45deg);background:var(--gold);box-shadow:0 0 0 3px rgba(233,180,76,.22)}
.rihla .story{font-size:15.5px;line-height:1.8;margin:10px 0 0;max-width:62ch;text-wrap:pretty}
.rihla .news{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px}
.rihla .news span{display:inline-flex;align-items:center;gap:6px;font-size:13px;padding:5px 10px;border-radius:999px;background:rgba(233,180,76,.12);border:1px solid var(--line)}
.rihla .news svg.i{width:15px;height:15px;color:var(--gold-hi)}
.rihla .sform{display:grid;gap:14px;margin-top:18px}
.rihla .flabel{display:block;font:500 12.5px/1.3 var(--f-label);letter-spacing:var(--ls);text-transform:uppercase;color:var(--muted);margin-bottom:7px;padding:0}
.rihla fieldset{border:0;margin:0;padding:0;min-width:0}
.rihla .swatches{display:flex;gap:10px;flex-wrap:wrap}
.rihla .sw{position:relative;display:block}
.rihla .sw input{position:absolute;opacity:0;inset:0;margin:0;cursor:pointer}
.rihla .sw span{display:block;width:34px;height:34px;border-radius:50%;border:2px solid rgba(244,231,201,.3);box-shadow:inset 0 -5px 0 rgba(0,0,0,.18)}
.rihla .sw input:checked+span{border-color:var(--gold-hi);box-shadow:0 0 0 3px rgba(233,180,76,.4)}
.rihla .sw input:focus-visible+span{outline:2px solid var(--papyrus);outline-offset:3px}
.rihla .btn.big{min-height:50px;font-size:17px;margin-top:2px;border-radius:14px}
.rihla .controls{font-size:13px;color:var(--muted);margin:10px 0 0;line-height:1.6}
.rihla .err{color:#ffb4a3;font-size:14px;margin:12px 0 0}
.rihla .fade{position:absolute;inset:0;z-index:7;background:var(--lapis);opacity:0;pointer-events:none;transition:opacity .55s ease}
.rihla .fade.on{opacity:1;pointer-events:auto}
.rihla .flash{position:absolute;inset:0;z-index:7;background:#fff;opacity:0;pointer-events:none;transition:opacity .45s ease}
.rihla .flash.on{opacity:.85;transition:none}
.rihla canvas.warp{position:absolute;inset:0;z-index:7;width:100%;height:100%;pointer-events:none}
.rihla .frame{position:absolute;inset:max(14px,4vmin);z-index:3;border:2px solid rgba(246,213,138,.85);border-radius:14px;pointer-events:none;box-shadow:0 0 0 100vmax rgba(0,0,0,.18)}
.rihla .teacher{position:absolute;inset:0;z-index:8;display:grid;place-items:center;background:rgba(8,14,30,.6);pointer-events:auto}
.rihla .teacher .card{padding:20px 26px;text-align:center;font:600 20px/1.4 var(--f-title);color:var(--gold-hi)}
.rihla .perf{position:absolute;top:4px;inset-inline-start:50%;z-index:9;font:11px/1.3 ui-monospace,monospace;background:rgba(0,0,0,.65);color:#9f9;padding:3px 8px;border-radius:6px;pointer-events:none;transform:translateX(-50%)}
.rihla .phrases{display:flex;flex-wrap:wrap;gap:6px}
.rihla .loading{position:absolute;inset:0;display:grid;place-items:center;z-index:9;background:var(--lapis)}
.rihla .loading .card{padding:22px 28px;text-align:center}
.rihla .loading .bar{height:6px;width:220px;border-radius:999px;background:rgba(244,231,201,.12);margin-top:12px;overflow:hidden}
.rihla .loading .bar i{display:block;height:100%;width:0;background:linear-gradient(90deg,var(--faience),var(--gold));transition:width .2s}
.rihla .twod{position:absolute;inset:0;overflow-y:auto;z-index:4;padding:20px 16px;background:radial-gradient(circle at 50% 0,#1b2a58,var(--lapis))}
.rihla .twod .pane{margin:0 auto 16px}
.rihla .range{display:flex;align-items:center;gap:10px;margin:8px 0}.rihla .range label{flex:1}.rihla .range input{flex:1}
.rihla .sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
@media (max-width:640px){.rihla .mapwrap,.rihla canvas.r-mini{width:116px;height:116px}.rihla .qcard{width:min(280px,calc(100vw - 162px))}.rihla .btn .lbl2{display:none}.rihla .btn.round{width:56px;height:56px}.rihla .joy{width:124px;height:124px}.rihla .side.end .btn .lbl{display:none}}
@media (prefers-reduced-motion:reduce){.rihla .place,.rihla .toast,.rihla .fade,.rihla .flash{transition:none}.rihla .stamp.thump .disc{animation:none}}
.rihla.calm .place,.rihla.calm .toast,.rihla.calm .fade{transition:none}
`;
