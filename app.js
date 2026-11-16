/* PixelPress: static GitHub Pages PWA, RSS via configurable Cloudflare Worker */
(() => {
'use strict';
const $ = id => document.getElementById(id);
const WORKER_DEFAULT = 'https://rss-proxy.rjmclarenphotography.workers.dev';
const READ_WINDOW = 72 * 3600 * 1000;
const MAX_ENTRIES = 600;
const PRESETS = [
  {id:'ign',name:'IGN',url:'https://feeds.ign.com/ign/all',color:'#ffd772'},
  {id:'pcgamer',name:'PC Gamer',url:'https://www.pcgamer.com/rss/',color:'#b9ead9'},
  {id:'nintendolife',name:'Nintendo Life',url:'https://www.nintendolife.com/feeds/latest',color:'#ffb9cf'},
  {id:'eurogamer',name:'Eurogamer',url:'https://www.eurogamer.net/feed',color:'#b7d5ff'},
  {id:'gamespot',name:'GameSpot',url:'https://www.gamespot.com/feeds/mashup/',color:'#ffe6a8'},
  {id:'kotaku',name:'Kotaku',url:'https://kotaku.com/rss',color:'#dbc6ff'},
  {id:'polygon',name:'Polygon',url:'https://www.polygon.com/rss/index.xml',color:'#c9e9de'},
  {id:'rps',name:'Rock Paper Shotgun',url:'https://www.rockpapershotgun.com/feed/',color:'#ffd0b4'},
  {id:'steamdeckhq',name:'Steam Deck HQ',url:'https://steamdeckhq.com/feed/',color:'#d1e5ff'}
];
const load = (key, fallback) => {try {const x=JSON.parse(localStorage.getItem('pixelpress_'+key));return x ?? fallback;} catch {return fallback;}};
const save = (key, x) => {try {localStorage.setItem('pixelpress_'+key,JSON.stringify(x));} catch(e) {console.warn('Storage unavailable',e);}};
const cleanUrl = (value) => {try {const u = new URL(value);return /^https?:$/.test(u.protocol) ? u.href : '';} catch {return '';}};
const escapeHtml = value => String(value??'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Decode character references at the text boundary; the RSS Worker returns XML unchanged.
// XML DOMParser has already decoded outer XML references. CDATA and embedded HTML may
// still contain character references (occasionally double-encoded by a publisher).
function decodeEntities(input) {
  let value = String(input ?? '');
  for (let i = 0; i < 4 && /&(?:#|[a-z][a-z0-9]{1,31};?)/i.test(value); i++) {
    // A small number of feeds send '&#8217:' instead of '&#8217;'.
    const corrected = value.replace(/&#(x[0-9a-f]{1,6}|[0-9]{1,7}):/gi, '&#$1;');
    const box = document.createElement('textarea');
    box.innerHTML = corrected.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const next = box.value;
    if (next === value) break;
    value = next;
  }
  return value.replace(/\u00a0/g, ' ').normalize('NFC');
}
function plain(html) {
  const box = document.createElement('template');
  box.innerHTML = String(html ?? '');
  box.content.querySelectorAll('script,style,iframe,object,embed,svg').forEach(node => node.remove());
  return decodeEntities(box.content.textContent || '').replace(/\s+/g, ' ').trim();
}
// Cached and extracted article text may predate the decoding fix. Decode at display time,
// then escape exactly once. Never apply this to URLs, image sources or other attributes.
const displayText = value => escapeHtml(decodeEntities(value));
const PIXEL_ASSETS = {"book":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAAXNSR0IArs4c6QAAAclJREFUWIXtV79rAjEU/iyFUwoWBLFDt5vt6Hj/QCfp1kIhLcLBLR26ONlO/QtEQaxFUKfidP+Ao+tNHdw9hIKTvSkd7IXzfuQSzbVLvym5vLx8+fJe8g74Y+RUOCE1QsPfNGeB7maW6v9YBQEAeLm+Ze2P4gkm1qPQvCNVBPaFMgVO7z9Z21j2MDmEQNyZpmHdL7H2vPgAr9oBgU41Z7FjF46LCAFSI/R15MmuD9fe7fs+XPsZlcseXLuB5ngI0wENkkg8gq+zq9RF88t3rp2ID24M1NurxLGpVU51LgIlWcAjmgauAqK7nFplrPsZEABnd0Fy9fYKb/lSrN3BBERUUKaAWTBoMAFFg1BWAbNgsFRkBEiN0M7Iw91N/CI8ZBYDQQWmVjnSD9plEgNhBZIUUaLAYD7IaRcGRVVng3Ex4CuRiQLdzSxHoLOHiLfjcF9GAaG3ABlmQRDKbsL8ssf6FVUEZBQAjJ2xbZwcSEBGgX3nRghsK5hzIEaBJKe+He+uECbgVXUAnrCDsJ1snRCpB8I1XNaIjQHXbghNXiPdzq8Hn5otBC85LoHmeChEQAhjDZrT+jnaKGJ/ncyCIV2Wi0Lkd+0fv4pvRoa5j5NHmzUAAAAASUVORK5CYII=","readFolder":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAAXNSR0IArs4c6QAAARBJREFUWIVjYBgFIx0w4pNMNEv8j0tu/qn5ePUSC1jwWT5trw9unc4M/6nhCCZ8lnO8WMvwca4QVro9Kg5vCBELMEIAZijHi7UML7emMoh7z8ZKo6snFqCHGgqHYLBTCD7OFWKoXLYIxRFY0wDHi7W0cQBDKgP75bsoYljTAD3BgDsAZzZEB8gJj4GBgUHcezZJ8rgAUSGAbji6GCF5fIDoECDWYaSCAU8DQ8MBxCYocvQQHQKkOIIUtSRFATEGkxpaJKcBfBaQE1VkJUJsFpFjOdkOQLeQXMsZKC2ISLEYV6FFl3IA1pDBBrCGwA+JYIaPc4Wo7ghsAKNRmcFpR3E7Dx+Y8f0QVVrTo2AUUA0AAMVsaG3aoHDQAAAAAElFTkSuQmCC","controller":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAAXNSR0IArs4c6QAAAbVJREFUWIXtVq9vwkAYfSxLOuzEFK7JHIiJSgyWv6CiyakBhswsqaJTlWQGZjYykuFwWMzkJNUVSxALbkGQqpvZddf2rj+uTUgWnry7fu/dfd/3vgInHBk1lY969TbNe/bp8K7EUQl5nvNnpRWVxNEFnMs2iEGETxcAINCp5vkImjo0zw/3VPItFEAMQifrbqFAg84KPQ+0qIiEAEY+6KzCNde0MgOxFykqIlIDPLnm+Zisu9A8H449Sg1iL+aYbhp/Igp0irQIx7shLr6WmG4ameSuaaHf2sJxHyJ7vXo78zWkAu6uHgEA/dY2lfzz9RaOPUqQ54VQgGtaCJp6SC4L7poWrm/ulcmR1oZ84dmLeaTdACBo6pisu3CgTg7RLGCF+P18mRDA8hn3CJEnxCGrBeEi7wOsI3hyFY/gY/AQpmD2MauhA4rf28XJq/SI3IYR94jxbhh2SloR2os5Xt4C9FvbME28CKVhVIVHlBJQpUcUFlC1R0h9IEsEQ1mPyC2AdUbcIxj4wiLQE8Mo7iXKIAahh/2SHvZLSgxCZZMv7zklNcwJs25EDEJZeir/Oz7hhH+DH23pFLNOqsmOAAAAAElFTkSuQmCC","games":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAAXNSR0IArs4c6QAAAdlJREFUWIXtl7FLAlEcx7/FgR5BgUNTTkKbS4PjDbn6FzgEj4YOgyIQwUmdJJfIwVpEashBbnMKbmkKB4duiBSHNmkQxEGE4LX0zPPeeXfvTIf6Lr575/t9P++93+8HB/x1bfhZrMoKnX2+HT/5iufZfDzS6HikUdpN0sPXZzoPtBJzvxCbIuY3L3vcd7pURqddslzNUgGYgn3NMo5/nnmOIwTAjIJ9zWSuS+XVAOhS2bRbZi5yAkJSZYXSbnKaeOxXJAmF61aVFdppl0xz+wcZz71g7Y1IuAqYJtEIJtGI8HrfABU9gWLyaH0AfiV5XUBi5OfejR6G1RD/3ZxqrRo3PzwBkBihAaOHq49zAMDF7jV2jgdTiIqesKxpNcKon6ahygrlJalrABIj9P3u5Ns4g3yxAACmE5gdA8Db9hbqp2lMohEEjB43risAtvPB5aNpPl8sIJ/NTcd25ovkWLckRmhFT2BYDdmazYtnHjB63D6xEICZtxphJ06TeDu3A7C9ApbRqXjTEogFt7tXL41pYQ7wsnqRUvGmLZQQADiZLSK743cFAAD5bG56rKzt8ua8muO3W7GTOVyfAKfsnErRjbkrgOzDvdNfhM3h1AdEPjRW+nX0r2XoC6bX+SV6AMhwAAAAAElFTkSuQmCC","gear":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAAXNSR0IArs4c6QAAAhhJREFUWIXVV79Lw0AU/iqFUIQWOgkKHRycHFw6unS0m1uHSijS0qVjyaROoS6iQ1WkYByyiFsdFLr4B7gUlAqlFnRxCFSQKgh1aF68tJfr2R9Wv+nuvXf3fffuJXkBpgyfTJAaVTvjJFWqdRy1b3xSAtSo2ilW4sKYbKyMppGGVbjGyl0DMvEkwi+rulUKC/1W4Voqthacdc2lBdSCszg9OvT0r9w1nLFmnvX5i5U4V5i0AMKSkfzpEhsW1yoloFUKA0G3Le8/Ea4pfG5KyZqRipogpDIQSlnAubt43ufWsfY0z42/+LyXvtz/kQFeDRAq/gPurnlmKqqHkTJwufA8ynJgmMeQsP/UfaZzC961AIl6mHoNTF3A0FfAQlQL748TFkC14M0g9v+vK+h+5/kflYkLWHp9G9gTjF3AdzckPnWrFEYoZTkCQynLsbPg9RRCAUq1jmysPOAMNkyP8QB4FqEaVTt7Lzk0jTT0RBJ6IgmlWkfTSDs2AK4x+XvnvTYW3AxQ6rOxMiIANNuuADCv2oDddjWNNMyrNjTzDEq1jofb3b457DVk+1hedHH1dcVETu93ItzWtpwNIxvHUuSRjWPoiWQfOduW+weRU4Op9JxERL6t70CTIHdlgO3/2cKjO2M34I15c148S+4IkPn5GBZ0GB452CuYxEuG4EUOykAmsNrpTd1vkIOtgUxgdaw/oAQR+Z/AFzDEKPytwWr2AAAAAElFTkSuQmCC","internet":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAAXNSR0IArs4c6QAAAxFJREFUWIXtVjFo20AUfSqCWEu6pQULKjC4ZLApHrTVYyi4W7YWGtQSYk8mS0CTlUmQJWSpbQoRCSSbR0MJdHE3D6G4Q2gg4IICSYZAs8gCgzpYdzmddI6cdEvfdL4v6b3//7vvAx47pDQPGboRiGJO30n1DRHkNMQv9z6In1lB8BAhQgGGbgTTiI+gYAkefu+toTM+wZx+FrS83swiEl+YRk6I6+o13RsNbwAApu5gVhFP0pAfQRGSA0BGmwcA2H0DVaUs9MudAkTkS/AiIqbh9HhrJhFUgKEbwedvbyPZ8eRJGA1vaAvuIyLRhHX1GhU3KyTnCQFgWV5MwxeDBCZ7HhU3K3yxMz6ha1N3YvHT4y3kSxt3mnLqHEhCVz0PxU0yzpc2YNmbsees0kaq78VOAQs2S/KblL8zPhGSA6D7d3lBKIDvc1c9p8eNjz39dJ24BoDmQEVVKQciIbQFScZiUXGztCLEcPkwlrno4A9WY2sAqBVdNAfq5EexHJuWVEBb1gAAa+MhDWa0eXRBep4VOv2yu4o3P77j66vXuOyuRmItryehOMm+OVBjImItIEL4qhDzsevT4y1YZiNRFLvf8npSy+tJtaKL7at6xBdUCT8FSSX4vvNVyIdut+xNmIf7AIC5n2e32XOoKuWgOVBRK7poeT1JaMK2rKEta3TSLcuLieR+IQe/kAMA2O8mCfiFHCx7M9U0pAKcviP9WtmPBI+goC1rEeKueh45goQ0CSIRo+fLdB0ZRE7fkaqls8DuG2FUi/0fVNwsIGfpCQBTclIFy2xQD7BtqCrlYPuqjvWFHbqfOCarSjmw+wbtf8XNRkxIRjTpf3OgxtxvmQ1KQqrAk8cqQNDyehJ00Ep0cIPR8NaQBH4hh90Dn5JbZgN+IUfbwhJnLjqoceTCCrCVQHjRICB+eLHSxu6BD4RzAACeVb7g4/s5+iyJ14rubWIcUl2feCORzFly83Cf7hGTrS/sCIlnEsDC0I2AEAGgGbN70zJ+kADRvSEJvNn+mQCEx44MH/YIsrjPFf0/Hif+AmwijAMrnpjDAAAAAElFTkSuQmCC","chat":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAAXNSR0IArs4c6QAAAT9JREFUWIXtlT0KwkAQhScSMBcQLFJbprCw9A7iCVKp2HsQQUy3eIBgZWmTMqW9haAQyAG0i9VqjPszmd2oha9cZvd9O7u8Afjry3JEi+EgLJowYyl783NF5qfNxLr53l1COxgW0TV5gXgD4Nr5F7sEmXhZCgAAMFrlyjO3846wbjvvPNZ4jUxKAN1mVR12r1EHqmbVW49W+Wc6IKvH7Cd3QPT+qjUSAOYGJu+vBRB1QPbeVJE7YGqsBfCy2PjwW3dcH4ClzJn2j8XM2B5gfYi1EMIOVPOarGBY6CCUfwAMJiNLmRNdE4dDkACok7E8+Z4Qfn0ArtqTsTL5OAQZABSZgM0D2b9CA8gMGg2islQz3wTIqAM20hANAJbSkQzgZTHMgjP6YGyYoQC4ubWELKmFKWrKHAXQ6y8aM//rJ3QHjU2VZohxDY8AAAAASUVORK5CYII=","star":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAABwUlEQVR4nO1WPWsCQRB9J0GQWEi6VCHl/QD7JFwIeN1Z+gvO0h+jnZ3lXWcgRMQykCqVZco0IVgogs2m0Alzu/exHweBkIErbndn5u3bN7ML/Juj9boD4eLfqAuIrondSojd6ge0EwDavQsLzgzMk46T/5mto7zrXncgHl9nXt5aTrk8ZgxAbBMl2DxZIuxvTEMBqFmERVrwzm88+uSx2gDYaqH2MqyqCJkJYwDhbQp8LbPfyWxYyIjQtauZxKGKUcqm1x0IZScXd2oEtnMTC/sb8HJVjuCw3U9sS0on+WG7nwR+NA78aAzkMAAANPn8dBkDqIWB+4ePCf9frNNhIQAOotluxS7tlnadl7wUAAdiC0JOzhOTVZbhYp0ObXShk1wLQJkz2efLW+Yz8dduRKZHQOurwGsBsG1QzXYrrlpj/R4AwK7gK+vLyApA2N9gOnrHdMTHrgGoRxX40VhbA/KDkYwHLaoGUjyf12GlkgE6fwrMSitzvot1Ogz86ATyODdPOqSDQgY8IP/NBhzvbi7Aso5GxjsojRW9FQFNDegklueIjWa7FZfpoAGorxT+L6Ovqmt5nQzeyojW3/L/2/YNRfnv58sLoBQAAAAASUVORK5CYII=","starOutline":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAABdElEQVR4nO2VPU7DQBCFX1AUKSiXoHQP1C5Mgzu3cAGnpnVFS22fgDYdNKSghz4d0OUCBktuTJOxJs56f2ZXioR4kgsnO/u+mZ0dA//y1PXFTecTfxIK5CgAlL1PFbwr8PR67xUvBhhm7dsL1upU+v7opABBm1ACEQxA2gvBr6FrFZwB0stb4Odz/9lJUoUpfwnVyTb7PL89TgBgogo+yOT07HAHlrmL0rjozQHFEbR1U6VxIdrcxrytmyqJsjKJshJQVAAA6M+X94ccQJAKXJ3fVfx9vVktRwE4xGwxz33GLWWtMtcCcBApxNCcG5OM13C9WS0lfWFjbgWgCyZtv7Z7j0u89SByPQJab4K3ApAOqNlinpvWTE0LdOJ9Ib0pIgAy5k2WxkWuAkmirPTuAb6pypy/u1bFWAE6/zFjnl0SZQTZV2PXB6MVMA4i3oA6cwbRT1D6jX98RAA2xjqQtm4q8SAa0tuY83VDeJEom2PF/239AqrI6mhoMcTkAAAAAElFTkSuQmCC","starFilled":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAABwUlEQVR4nO1WPWsCQRB9J0GQWEi6VCHl/QD7JFwIeN1Z+gvO0h+jnZ3lXWcgRMQykCqVZco0IVgogs2m0Alzu/exHweBkIErbndn5u3bN7ML/Juj9boD4eLfqAuIrondSojd6ge0EwDavQsLzgzMk46T/5mto7zrXncgHl9nXt5aTrk8ZgxAbBMl2DxZIuxvTEMBqFmERVrwzm88+uSx2gDYaqH2MqyqCJkJYwDhbQp8LbPfyWxYyIjQtauZxKGKUcqm1x0IZScXd2oEtnMTC/sb8HJVjuCw3U9sS0on+WG7nwR+NA78aAzkMAAANPn8dBkDqIWB+4ePCf9frNNhIQAOotluxS7tlnadl7wUAAdiC0JOzhOTVZbhYp0ObXShk1wLQJkz2efLW+Yz8dduRKZHQOurwGsBsG1QzXYrrlpj/R4AwK7gK+vLyApA2N9gOnrHdMTHrgGoRxX40VhbA/KDkYwHLaoGUjyf12GlkgE6fwrMSitzvot1Ogz86ATyODdPOqSDQgY8IP/NBhzvbi7Aso5GxjsojRW9FQFNDegklueIjWa7FZfpoAGorxT+L6Ovqmt5nQzeyojW3/L/2/YNRfnv58sLoBQAAAAASUVORK5CYII=","folder":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAAXNSR0IArs4c6QAAAVlJREFUWIVjYBgFIx0wElKQaJb4H5fc/FPzCeonBFgIWT5trw9uBc4M/yl1BBMhy0+tlmU4tVqWgePFWhT61GpZhnlLf+INIWIA1hCAGcrxYi0DA0MBityhwwU41RMLkEMNI/jQgx3iCNzgh0QwKXYzfJwrxFC5bBHcETjTACGLSVUHdwBDKgP75btwPs40QC8w6gCUNICcAElNXPgAvnQCdwDMclITFTEgU+8Jw/RLMljlBjwK6OaAl1tTB9YB4t6zsToC7oD5p+YzZjlvoWrig4GG9kaGTL0nWOVoEgIwn77cmooz6KnmAGTLYDQsuMW9ZxPUj+IAXNGAzRJslmGjYaChvZGhobKe4SYfN24H4LKUkCWELCc6BJABJZYSazkDrjYhcqlILZ/Cgn55dgkDAwMDw4zvhxjxhgADgbgnxafo8Y4McDYoMzjtKGrr4QMw34+CUTAoAAC8Admz7xWZVAAAAABJRU5ErkJggg==","newspaper":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAAXNSR0IArs4c6QAAAb5JREFUWIXtljFIAlEYx/9FcDgJgdBgELi0OLgcTa4uLSJOLpkExg0uLW05hGM0GC2pBNoQ4VJEQ4ujQ8tBmzTkkoLQVDddw3HHu/O9d+/dU1r8b/fex/f93v977/iAlf5Za7zNsl62oyRtD9vcvKQ2eMVbXUu46GFJgxdfKtuiEEwAV79bBUGERy++1X0QhlgXzE7V5XiTuu5AWKjGsqEtjAzgFv++YUOcNeqhEKEt4BUP6uvpaG7NSqdQNWFf/wyo7ZAGcIsfvACdnH/vtHcrm04OgCwer8wAwomr131qO8KghAFI2zs5+Iq7ildmvm/W/ZAGIE9OimxBvjn17fWNhEjqcIA52wPrsgWlAWrJGdXK4PrSHAClt7T1qA4o/QkXISEHaPYO77eZ8XfGCS4mtcUBsOxtTN4AAM+FATLnu8i8fwAANKHSjoRakG9OPReCbqhK2oGol00JgPXEduo9AMBxHdjDeHkAtFPrxU/oRbGLpgwg2ve+kfBilX9EmjkCkJRKJhvLBbDSKQDOkMlzgDx1FJCFOKDyMrh3gDZiyUhkQmKOzdVY1nbaoCbNHIE1D3IBXAhVAF7xlQDgD5IWp5b6/Y+EAAAAAElFTkSuQmCC","notepad":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAAXNSR0IArs4c6QAAAYxJREFUWIVjYBgFOIDT9RP/DRKa/pPDJgUwogskmiX+Z2BgYDivpchgeO0+A6ls9st3Ucyb8f0Qih0ZnHb/kcWY0C2ft/Qnw7ylPxkYGBgY+ubakcxuaG9k+KmrzMDAwMDQ0N7IkMFp9x/Z/BPhLihiKA6AgR8SwWSzSQUsuCSOT9Ymi/0Tj2Xsl+8yWKBFEdYQoBaoXLYIhf9TV5lh+iUZFDGcIRA49TUKf322KFxsfbYohjpkMRhoj4pjaKisx+tInA7AZiC6GLIjA6e+xpCvXLaIgR2v9SSEACHHEQMgWZTIKCDGElzRQgogKgSQLUK3jBSLIeUDaj4hOgRwWURqCEDKjImEHUAsIDfoCToAWyKk1DKSHEALyxgYGBg4XqxF4dO0JMQG0OsNssoBbIDYEEMPAbpHATqgewgQ7QBahABJRfGwDAGCRTFyEA1IQYTsQnqlASZMBfQFGGng5dZUigxEbweig0y9J/gdQMgAYgD75bvwvgE6aGhvRGknYvSMkDsN1ACEekajAADIFNZJ65YEqgAAAABJRU5ErkJggg==","articles":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAAXNSR0IArs4c6QAAAUtJREFUWIVjYBhgwIhPMtEs8T8uufmn5uPVSyxgwWf5tL0+uHU6M/ynhiOY8FnO8WItw8e5Qljp9qg4vCFELMAIAZihHC/WMrzcmsog7j0bK42unliAHmooHILBTiH4OFeIoXLZIhRHYE0DHC/W0sYBDKkM7JfvoohhTQPYwMutqShBTy0ADwFCcSnuPZvqljPAQoCYuMcXApSEDs5yAB3gCgFYzkBnEwuITgPIFlKaFpCjm2QHUAMgF2JERwEMUCsxwrLjgIQAMhh1wNBzALWLZJJzATpArp7JySFUyYaUZM0BTwNYQ+CHRDDDx7lC9HfAvKU/GTLFJtLUwumXZBhebsXhAJgCaoOXW1MZGirrsZo9uNIAPeMexQHzT81nZBe7S3EbHx/AFbXwEJjx/RC8qYzcMaE1wFsQ0SNKcPbtMjjtaBolyCE+oAAAQruUICX44uwAAAAASUVORK5CYII="};
const icon = (name, px=24) => `<img class="library-pixel-icon" width="${px}" height="${px}" alt="" aria-hidden="true" src="${PIXEL_ASSETS[name]||PIXEL_ASSETS.controller}" style="width:${px}px;height:${px}px;image-rendering:pixelated">`;
const ago = date => {const d=Date.now()-new Date(date).getTime(); if(!Number.isFinite(d)) return ''; if(d<3600000)return 'Just now';if(d<86400000)return Math.floor(d/3600000)+'h ago';if(d<604800000)return Math.floor(d/86400000)+'d ago';return new Date(date).toLocaleDateString();};
const readableDate = str => {let t=Date.parse(str);return Number.isFinite(t)?new Date(t).toISOString():new Date().toISOString();};
const safeText = x => plain(typeof x==='string'?x: (x?.['#text']||x?.value||x?.text||''));
let worker = load('workerUrl',WORKER_DEFAULT);
let feeds = load('feeds',PRESETS.slice(0,6));
if(!Array.isArray(feeds)) feeds=PRESETS.slice(0,6);
feeds=feeds.filter(f=>f&&cleanUrl(f.url)&&f.name).map(f=>({id:String(f.id||'custom'),name:String(f.name).slice(0,75),url:cleanUrl(f.url),color:f.color||'#d9ecfa'}));
let articles=load('cachedArticles',[]);
if(!Array.isArray(articles))articles=[];
let savedStories=load('savedStories',[]);
if(!Array.isArray(savedStories))savedStories=[];
let readIds=new Set(load('readIds',[]));
let tab='new', search='',listMode=load('listMode',true),busy=false,sourceErrors=[],lastSync=load('lastSync',''),freezeNewList=false;
const idFor = article => article.url;
const setMessage = msg => { $('manageMessage').textContent=msg; };
const invalidate = () => {save('feeds',feeds); save('readIds',[...readIds].slice(-2500)); save('savedStories',savedStories);};
const allKnown=()=>{const map=new Map();for(const a of [...articles,...savedStories])if(a?.url)map.set(a.url,a);return [...map.values()];};

function candidateImage(url,base){
 try {const full=cleanUrl(new URL(String(url||'').trim().replace(/&amp;/g,'&'),base).href);return full && !/\.(?:mp4|webm|mp3|gif)(?:[?#]|$)/i.test(full) ? full : '';}catch{return '';}
}
function imageFromHtml(html,base){
 const doc=document.createElement('template');doc.innerHTML=String(html||'');
 for(const img of doc.content.querySelectorAll('img')){
  const srcset=img.getAttribute('data-srcset')||img.getAttribute('srcset')||'';
  const highest=srcset.split(',').map(x=>x.trim().split(/\s+/)).filter(x=>x[0]).sort((a,b)=>parseInt(b[1]||'0')-parseInt(a[1]||'0'))[0]?.[0];
  for(const value of [highest,img.getAttribute('data-original'),img.getAttribute('data-src'),img.getAttribute('src')]){
   const candidate=candidateImage(value,base);if(candidate)return candidate;
  }
 }
 return '';
}
function imageFromNode(el,base){
 const candidates=[];
 for(const node of el.getElementsByTagName('*')){
  const tag=node.localName?.toLowerCase();
  if(!['thumbnail','content','enclosure','image','group'].includes(tag))continue;
  const medium=(node.getAttribute('medium')||node.getAttribute('type')||'').toLowerCase();
  if(medium.includes('video')||medium.includes('audio'))continue;
  const src=node.getAttribute('url')||node.getAttribute('href')||node.querySelector('url')?.textContent||'';
  const width=parseInt(node.getAttribute('width')||'0',10);
  const height=parseInt(node.getAttribute('height')||'0',10);
  if((width&&width<80)||(height&&height<60))continue;
  const image=candidateImage(src,base);
  if(image)candidates.push({image,score:(tag==='thumbnail'?1000:tag==='content'?900:tag==='enclosure'?750:600)+Math.min(width,1500)});
 }
 const description=xmlText(el,['encoded','description','summary','content']);
 const embedded=imageFromHtml(description,base);
 if(embedded)candidates.push({image:embedded,score:500});
 candidates.sort((a,b)=>b.score-a.score);
 return candidates[0]?.image||'';
}
function xmlText(el,names){
 for(const name of names){
  const node=[...el.children].find(x=>x.localName?.toLowerCase()===name.toLowerCase());
  if(node?.textContent?.trim())return node.textContent.trim();
 }
 return '';
}
// Keep the proxied RSS intact until it reaches the browser. Repair only invalid
// XML character-reference spellings that some feeds emit, outside CDATA blocks.
function repairFeedXml(raw) {
  return String(raw).split(/(<!\[CDATA\[[\s\S]*?\]\]>)/g).map(part => {
    if (part.startsWith('<![CDATA[')) return part;
    return part
      .replace(/&#(x[0-9a-f]{1,6}|[0-9]{1,7}):/gi, '&#$1;')
      .replace(/&([a-z][a-z0-9]+);/gi, (match, name) => {
        if (/^(amp|lt|gt|quot|apos)$/i.test(name)) return match;
        const decoded=decodeEntities(match);
        return decoded===match ? match : decoded.replace(/&/g, '&amp;').replace(/</g, '&lt;');
      });
  }).join('');
}
function rssXmlToItems(raw,feed){
 const doc=new DOMParser().parseFromString(repairFeedXml(raw),'text/xml');
 if(doc.querySelector('parsererror'))throw Error('Invalid XML returned by proxy');
 const entries=[...doc.querySelectorAll('item, entry')];
 if(!entries.length)throw Error('No RSS or Atom items found');
 return entries.slice(0,70).map(el=>{
  const title=plain(xmlText(el,['title']));
  const atomLink=[...el.children].find(x=>x.localName==='link'&&x.getAttribute('href')&&(x.getAttribute('rel')!=='self'))?.getAttribute('href');
  const link=cleanUrl(atomLink||xmlText(el,['link']));
  const html=xmlText(el,['encoded','description','summary','content']);
  const excerpt=safeText(html).slice(0,600);
  const date=readableDate(xmlText(el,['pubDate','published','updated','date']));
  const image=imageFromNode(el,link||feed.url);
  return {url:link,title,source:feed.id,sourceName:feed.name,date,snippet:excerpt,content:safeText(html).slice(0,35000),image,category:plain(xmlText(el,['category'])).slice(0,48)||'News'};
 }).filter(a=>a.title&&a.url);
}
function jsonToItems(result,feed){
 let list=[];
 if(Array.isArray(result))list=result;
 else if(Array.isArray(result?.items))list=result.items;
 else if(Array.isArray(result?.articles))list=result.articles;
 else if(Array.isArray(result?.entries))list=result.entries;
 else if(typeof result?.xml==='string')return rssXmlToItems(result.xml,feed);
 else if(typeof result?.rss==='string')return rssXmlToItems(result.rss,feed);
 else if(typeof result?.content==='string' && /<rss|<feed|<rdf/i.test(result.content))return rssXmlToItems(result.content,feed);
 else if(typeof result?.body==='string' && /<rss|<feed|<rdf/i.test(result.body))return rssXmlToItems(result.body,feed);
 else if(typeof result?.data==='string' && /<rss|<feed/i.test(result.data))return rssXmlToItems(result.data,feed);
 else if(Array.isArray(result?.data?.items))list=result.data.items;
 if(!list.length)throw Error('Unsupported proxy response (expected RSS XML or articles array)');
 return list.map(item=>{
  const url=cleanUrl(item.link?.href||item.url||item.link||item.guid||'');
  const description=item.content_text||item.content_text_plain||item.content?.text||item.content_html||item.content||item.description||item.summary||item.excerpt||'';
  let image=item.thumbnail?.url||item.image?.url||item.image||item.thumbnail||item.enclosure?.url||item.media?.thumbnail?.url||item.image_url||item.featured_image||item.featuredImage||'';
  if(typeof image !=='string')image='';
  if(!image)image=imageFromHtml(description,url);
  return {url,title:safeText(item.title),source:feed.id,sourceName:feed.name,
    date:readableDate(item.pubDate||item.published||item.date_published||item.isoDate||item.date||item.updated),
    snippet:safeText(item.description||item.summary||item.excerpt||description).slice(0,600),
    content:safeText(description).slice(0,20000),image:candidateImage(image,url),category:safeText(item.category||item.categories?.[0]||'News').slice(0,48)||'News'};
 }).filter(x=>x.url&&x.title);
}
async function fetchFeed(feed){
 const base=worker.replace(/\/+$/,'');
 // Common RSS proxy contract: GET /?url=<feed-url>. The provided worker could use a different API.
 const request=new URL(base+'/');request.searchParams.set('url',feed.url);
 const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),16000);
 try{
  const response=await fetch(request.href,{signal:controller.signal,headers:{Accept:'application/rss+xml, application/atom+xml, application/xml, text/xml, application/json, text/plain, */*'},cache:'no-store',credentials:'omit'});
  if(!response.ok)throw Error('HTTP '+response.status);
  const type=response.headers.get('content-type')||'';
  const raw=await response.text();
  if(/json/i.test(type)||/^[\s]*[\[{]/.test(raw))return jsonToItems(JSON.parse(raw),feed);
  if(/<rss|<feed|<rdf/i.test(raw))return rssXmlToItems(raw,feed);
  throw Error('Proxy returned neither RSS XML nor JSON');
 } catch(e){if(e.name==='AbortError')throw Error('Request timed out');throw e;}finally{clearTimeout(timeout);}
}
function healthy(){
 $('sourceHealth').innerHTML=sourceErrors.map(s=>`<div class="feed-health ${s.error?'fail':'ok'}"><span>${s.error?'✕':'●'}</span><b>${escapeHtml(s.name)}</b> <em>${escapeHtml(s.error||s.count+' stories loaded')}</em></div>`).join('');
}
async function refreshFeeds(){
 if(busy)return;
 freezeNewList=false;newSessionIds.clear();seenOnScreen.clear();
 if(!feeds.length){articles=[];save('cachedArticles',articles);render();showStatus('Add a feed under Manage to start reading.','warning');return;}
 if(!cleanUrl(worker)){showStatus('Set a valid Cloudflare Worker URL in Manage.','error');return;}
 busy=true; sourceErrors=[]; $('refreshBtn').disabled=true;$('refreshBtn').textContent='↻ Syncing…';
 showStatus('Getting the latest stories from '+feeds.length+' feeds…','');
 const outcome=[];
 // Run small groups to avoid overloading a Free Worker.
 for(let i=0;i<feeds.length;i+=4){
   const part=await Promise.all(feeds.slice(i,i+4).map(async feed=>{
     try{const items=await fetchFeed(feed); sourceErrors.push({name:feed.name,count:items.length});return {feed,items};}
     catch(e){sourceErrors.push({name:feed.name,error:e.message||'Could not load'});return {feed,error:true,items:[]};}
   }));outcome.push(...part);healthy();
 }
 const previous=new Map(articles.map(a=>[a.url,a]));
 const failed=new Set(outcome.filter(o=>o.error).map(o=>o.feed.id));
 const loaded=outcome.flatMap(o=>o.items);
 const seen=new Map();
 for(const a of [...loaded,...articles.filter(a=>failed.has(a.source))]){if(a?.url&&!seen.has(a.url))seen.set(a.url,a);}
 articles=[...seen.values()].sort((a,b)=>Date.parse(b.date)-Date.parse(a.date)).slice(0,MAX_ENTRIES);
 if(loaded.length){lastSync=new Date().toISOString();save('lastSync',lastSync);save('cachedArticles',articles);}
 render();healthy();
 const failures=sourceErrors.filter(s=>s.error);
 if(failures.length===feeds.length){showStatus('Could not connect to any RSS feed. The Worker may expect a different API than ?url=, or may not allow browser CORS. See Manage for each feed error. Cached stories are shown if available.','error');}
 else if(failures.length){showStatus('Loaded '+loaded.length+' stories; '+failures.length+' feed'+(failures.length===1?'':'s')+' could not be reached. Check Manage for details.','warning');}
 else{showStatus('Latest stories loaded from '+feeds.length+' feeds.','');setTimeout(()=>{if($('feedStatus').textContent.startsWith('Latest'))$('feedStatus').innerHTML='';},4500);}
 busy=false;$('refreshBtn').disabled=false;$('refreshBtn').innerHTML='<span class="btn-art">↻</span> Refresh';
}
function showStatus(text,kind){$('feedStatus').innerHTML=`<div class="feed-banner ${kind||''}">${escapeHtml(text)}</div>`;}
function filterFor(section){
 let arr=allKnown().filter(a=>a?.title&&a.url&&feeds.some(f=>f.id===a.source));
 if(search)arr=arr.filter(a=>(a.title+' '+a.snippet+' '+a.sourceName).toLowerCase().includes(search.toLowerCase()));
 if(section==='new')arr=arr.filter(a=>Date.now()-Date.parse(a.date)<=READ_WINDOW&&(!readIds.has(idFor(a))||(freezeNewList&&newSessionIds.has(idFor(a)))));
 if(section==='readlater')arr=arr.filter(a=>savedStories.some(s=>s.url===a.url));
 return arr.sort((a,b)=>Date.parse(b.date)-Date.parse(a.date));
}
window.pixelpressModalImageFallback = function(img){
 if(!img.dataset.proxyTried){img.dataset.proxyTried='1';const req=new URL(worker.replace(/\/+$/,'')+'/');req.searchParams.set('image',img.dataset.originImage);img.src=req.href;return;}
 img.remove();
};
window.pixelpressImageFallback = function(img){
 if(!img.dataset.proxyTried){
   img.dataset.proxyTried='1';
   const original=img.dataset.originImage;
   if(original && cleanUrl(worker)){
     const req=new URL(worker.replace(/\/+$/,'')+'/');req.searchParams.set('image',original);
     img.src=req.href;return;
   }
 }
 img.style.display='none';const placeholder=img.nextElementSibling;if(placeholder)placeholder.style.display='flex';
};
function renderCard(article){
 const read=readIds.has(idFor(article)),saved=savedStories.some(s=>s.url===article.url);
 const bg=feeds.find(f=>f.id===article.source)?.color||'#ead8ff';
 const img=article.image?`<img class="article-thumbnail" loading="lazy" decoding="async" src="${escapeHtml(article.image)}" alt="" data-origin-image="${escapeHtml(article.image)}" onerror="window.pixelpressImageFallback(this)">`:'';
 return `<article class="article-card ${read?'read':''}" data-url="${escapeHtml(article.url)}">
    <div class="thumb" style="background:linear-gradient(135deg,${bg},#fff2f7)">
      ${img}
      <div class="image-placeholder" style="${article.image?'display:none':''}" aria-label="No thumbnail"><svg viewBox="0 0 64 48" width="48" height="40" fill="none" aria-hidden="true"><rect x="3" y="3" width="58" height="42" rx="2" stroke="currentColor" stroke-width="3"/><circle cx="19" cy="16" r="5" fill="currentColor" opacity=".45"/><path d="M6 39L24 23L34 31L43 20L58 38" stroke="currentColor" stroke-width="3"/></svg><span>NO IMAGE</span></div>
      <span class="source-tag">${icon('newspaper',12)} ${displayText(article.sourceName)}</span>
      <button class="bookmark-float ${saved?'saved':''}" aria-pressed="${saved}" aria-label="${saved?'Remove from Read Later':'Save for later'}" title="${saved?'Remove from Read Later':'Save for later'}" data-save="${escapeHtml(article.url)}">${icon(saved?'starFilled':'starOutline',24)}</button>
    </div>
    <div class="article-body">
      <div class="top-meta"><span class="tag-chip">${displayText(article.category||'News')}</span><span class="time">${escapeHtml(ago(article.date))}</span></div>
      <h4 class="article-title">${displayText(article.title)}</h4>
      <p class="article-snippet">${displayText(article.snippet||'')}</p>
    </div>
  </article>`;
}
function emptyMarkup(title,subtitle){return `<div class="empty-state"><span class="ico">✧</span><h4>${escapeHtml(title)}</h4><p>${escapeHtml(subtitle)}</p></div>`;}
function render(){
 seenOnScreen.clear();
 const current=filterFor('new'),later=filterFor('readlater'),all=filterFor('all');
 $('newBadge').textContent=current.length; $('savedBadge').textContent=savedStories.length;
 $('newResultText').textContent=current.length+' unread stories · all subscribed sources';
 $('savedResultText').textContent=later.length+' saved stories'; $('allResultText').textContent=all.length+' available stories';
 for(const [id,arr,title,desc] of [
 ['newGrid',current,'No new stories','Tap Refresh, or open Manage to check your feeds.'],
 ['savedGrid',later,'No saved stories','Tap the star on any article to save it for later.'],
 ['allGrid',all,'No articles yet','Refresh to load RSS news.']]){
  $(id).classList.toggle('list',listMode);
  $(id).innerHTML=arr.length?arr.slice(0,300).map(renderCard).join(''):emptyMarkup(title,desc);
 }
 $('footerDate').textContent=new Date().toLocaleDateString(undefined,{month:'short',day:'numeric'});
 document.querySelectorAll('[data-save]').forEach(btn=>btn.addEventListener('click',e=>{e.stopPropagation();toggleSave(btn.dataset.save);}));
 document.querySelectorAll('[data-open]').forEach(btn=>btn.addEventListener('click',()=>openArticle(btn.dataset.open)));
 document.querySelectorAll('.article-card').forEach(card=>card.addEventListener('click',e=>{if(e.target.closest('button'))return;openArticle(card.dataset.url);}));
 observeScroll();
}
function toggleSave(url){
 const story=allKnown().find(a=>a.url===url);if(!story)return;
 if(savedStories.some(s=>s.url===url))savedStories=savedStories.filter(s=>s.url!==url);
 else savedStories=[story,...savedStories].slice(0,300);
 invalidate();render();
}
function markRead(url){if(readIds.has(url))return;readIds.add(url);save('readIds',[...readIds].slice(-2500));render();}
let observer=null,seenOnScreen=new Set(),newSessionIds=new Set();
function observeScroll(){
 if(observer)observer.disconnect();
 if(tab!=='new'||!('IntersectionObserver'in window))return;
 observer=new IntersectionObserver(entries=>{
  let count=0;
  for(const entry of entries){
   const url=entry.target.dataset.url;if(!url)continue;
   if(entry.isIntersecting)seenOnScreen.add(url);
   else if(seenOnScreen.has(url)&&entry.boundingClientRect.bottom<0&&!readIds.has(url)){
    readIds.add(url);newSessionIds.add(url);count++;
    entry.target.classList.add('read');
    const state=entry.target.querySelector('.read-state');if(state)state.textContent='READ';
   }
  }
  if(count){
   freezeNewList=true;save('readIds',[...readIds].slice(-2500));
   const remaining=filterFor('new').filter(a=>!readIds.has(a.url)).length;
   $('newBadge').textContent=remaining;
   $('newResultText').textContent=remaining+' unread stories · all subscribed sources';
  }
 },{threshold:[0,.15]});
 document.querySelectorAll('#newGrid .article-card').forEach(node=>observer.observe(node));
}
function showTab(name){if(name!==tab){freezeNewList=false;newSessionIds.clear();seenOnScreen.clear();}tab=name;document.querySelectorAll('.pixel-tab').forEach(n=>{const on=n.dataset.tab===name;n.classList.toggle('active',on);n.setAttribute('aria-selected',on?'true':'false');});document.querySelectorAll('.view-panel').forEach(n=>n.classList.toggle('active',n.id==='view-'+name));render();if(name==='manage')renderManage();}
const articleCache=new Map();
let currentArticleRequest=0;
function readerBlocks(blocks){
 return blocks.slice(0,160).map(block=>{
   const value=displayText(block.text||'');
   if(!value)return '';
   if(block.type==='h2')return `<h3 class="reader-heading">${value}</h3>`;
   if(block.type==='h3')return `<h4 class="reader-subheading">${value}</h4>`;
   if(block.type==='quote')return `<blockquote class="reader-quote">${value}</blockquote>`;
   if(block.type==='li')return `<p class="reader-list-item">• ${value}</p>`;
   return `<p>${value}</p>`;
 }).join('');
}
function updateReadBadge(){
 const count=allKnown().filter(a=>a?.url && feeds.some(f=>f.id===a.source) && Date.now()-Date.parse(a.date)<=READ_WINDOW&&!readIds.has(a.url)).length;
 $('newBadge').textContent=count;
 $('newResultText').textContent=count+' unread stories · all subscribed sources';
}
function markReadInPlace(url){
 if(readIds.has(url))return;
 readIds.add(url);newSessionIds.add(url);freezeNewList=true;
 save('readIds',[...readIds].slice(-2500));
 document.querySelectorAll('.article-card').forEach(card=>{if(card.dataset.url===url)card.classList.add('read');});
 updateReadBadge();
}
async function loadFullArticle(article,requestId){
 const status=$('readerStatus'),content=$('readerContent');
 const rssText=(article.content||article.snippet||'').trim();
 if(articleCache.has(article.url)){
   const cached=articleCache.get(article.url);
   if(cached?.blocks?.length){status.textContent=`Fuller text extracted from ${article.sourceName}.`;content.innerHTML=readerBlocks(cached.blocks);return;}
 }
 // Show all available RSS content while the full-article request runs.
 if(rssText.length)content.innerHTML=readerBlocks(rssText.split(/\n\s*\n/).filter(Boolean).map(text=>({type:'p',text})));
 else content.innerHTML='<p>No article text was included in this feed.</p>';
 status.textContent='Loading more of the article…';
 const requestUrl=new URL(worker.replace(/\/+$/,'')+'/');
 requestUrl.searchParams.set('article',article.url);
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),18000);
 try{
   const res=await fetch(requestUrl.href,{signal:controller.signal,headers:{Accept:'application/json'},credentials:'omit'});
   if(!res.ok){const message=(await res.text()).slice(0,180);throw Error(`Worker HTTP ${res.status}${message?': '+message:''}`);}
   const data=await res.json();
   if(requestId!==currentArticleRequest)return;
   const blocks=Array.isArray(data.blocks)?data.blocks.filter(b=>b&&typeof b.text==='string'&&b.text.trim()):[];
   const chars=blocks.reduce((n,b)=>n+b.text.length,0);
   if(chars>Math.max(350,rssText.length*0.9)){
     content.innerHTML=readerBlocks(blocks);
     articleCache.set(article.url,{blocks});
     if(articleCache.size>15)articleCache.delete(articleCache.keys().next().value);
     status.textContent='Expanded article text · '+Math.max(1,Math.round(chars/1000))+'k characters loaded';
   } else if(rssText.length){
     status.textContent='Showing all text provided by the RSS feed. No longer article text was available.';
   } else if(chars>80){
     content.innerHTML=readerBlocks(blocks);
     status.textContent='Article text extracted from the publisher.';
   } else throw Error('No readable article body found');
 }catch(e){
   if(requestId!==currentArticleRequest)return;
   status.textContent=(rssText.length?'Showing RSS content only. ':'Unable to extract this article. ')+
     'Some sites restrict automatic extraction. Use “Open on website” for the full story.';
   console.info('Reader extraction:',String(e?.message||e));
 }finally{clearTimeout(timer);}
}
function openArticle(url){
 const article=allKnown().find(a=>a.url===url);if(!article)return;
 markReadInPlace(url);
 const img=article.image?`<img class="modal-image" src="${escapeHtml(article.image)}" alt="" data-origin-image="${escapeHtml(article.image)}" onerror="window.pixelpressModalImageFallback(this)">`:'';
 $('modalBody').innerHTML=`<h2 id="modalTitle">${displayText(article.title)}</h2>
 <p class="modal-meta">${displayText(article.sourceName)} · ${escapeHtml(ago(article.date))}</p>
 ${img}
 <div class="reader-note" id="readerStatus" role="status">Loading more of the article…</div>
 <div class="modal-content reader-full" id="readerContent"><p>Loading article…</p></div>
 <a class="out-link" href="${escapeHtml(article.url)}" target="_blank" rel="noopener noreferrer">Open on website ↗</a>`;
 $('articleModal').classList.add('show');$('articleModal').setAttribute('aria-hidden','false');
 $('closeModalBtn').focus();
 const requestId=++currentArticleRequest;
 loadFullArticle(article,requestId);
}

function closeModal(){currentArticleRequest++;$('articleModal').classList.remove('show');$('articleModal').setAttribute('aria-hidden','true');}
function makeId(url){let hash=0;for(const ch of url)hash=(hash*31+ch.charCodeAt(0))|0;return 'custom-'+(hash>>>0).toString(36);}
function addFeed(url){
 url=cleanUrl(url.trim());if(!url){setMessage('Please enter a valid http or https RSS URL.');return;}
 if(feeds.some(f=>f.url===url)){setMessage('That RSS feed is already subscribed.');return;}
 const preset=PRESETS.find(f=>f.url===url);
 const label=preset?.name||new URL(url).hostname.replace(/^www\./,'');
 feeds=[...feeds, preset||{id:makeId(url),url,name:label,color:'#d9ecfa'}];
 save('feeds',feeds);$('feedUrlInput').value='';setMessage(label+' added. Fetching…');renderManage();render();refreshFeeds();
}
function removeFeed(id){const f=feeds.find(x=>x.id===id);feeds=feeds.filter(x=>x.id!==id);save('feeds',feeds);articles=articles.filter(a=>a.source!==id);save('cachedArticles',articles);savedStories=savedStories.filter(a=>a.source!==id);invalidate();setMessage((f?.name||'Feed')+' removed.');renderManage();render();}
function renderManage(){
 $('workerUrlInput').value=worker;
 $('subscriptionList').innerHTML=feeds.length?feeds.map(f=>`<div class="sub-item"><div class="sub-main"><div class="pixel-mini">${icon('internet',22)}</div><div><div class="sub-name">${escapeHtml(f.name)}</div><div class="sub-url">${escapeHtml(f.url)}</div></div></div><div class="sub-actions"><button class="remove-btn" data-remove="${escapeHtml(f.id)}">Remove</button></div></div>`).join(''):emptyMarkup('No feeds','Add one from the popular feeds list.');
 $('popularList').innerHTML=PRESETS.map(f=>{const exists=feeds.some(x=>x.url===f.url);return `<div class="popular-item"><div class="sub-main"><div class="pixel-mini">${icon('controller',22)}</div><div><div class="sub-name">${escapeHtml(f.name)}</div></div></div><button class="${exists?'ghost-btn':'add-btn'}" ${exists?'disabled':''} data-quick="${escapeHtml(f.id)}">${exists?'Added':'Add'}</button></div>`;}).join('');
 document.querySelectorAll('[data-remove]').forEach(n=>n.onclick=()=>removeFeed(n.dataset.remove));
 document.querySelectorAll('[data-quick]').forEach(n=>n.onclick=()=>{const f=PRESETS.find(x=>x.id===n.dataset.quick);if(f)addFeed(f.url);});
 healthy();
}
function saveWorker(){let value=$('workerUrlInput').value.trim();let parsed=cleanUrl(value);if(!parsed){setMessage('Enter a valid HTTPS Worker URL.');return;} worker=parsed;save('workerUrl',worker);setMessage('Worker URL saved. Refreshing feeds…');refreshFeeds();}
// Initial state and navigation.
document.querySelectorAll('[data-pixel]').forEach(el=>{const key=el.dataset.pixel;el.innerHTML=icon(key,el.closest('.brand-icon')?32:el.classList.contains('toolbar-icon')?28:19);});
document.querySelectorAll('.pixel-tab').forEach(n=>n.onclick=()=>showTab(n.dataset.tab));
$('jumpManageBtn').onclick=()=>showTab('manage');
$('searchInput').addEventListener('input',e=>{search=e.target.value.trim();render();});
$('refreshBtn').onclick=refreshFeeds;
$('layoutBtn').onclick=()=>{listMode=!listMode;save('listMode',listMode);$('layoutBtn').innerHTML=listMode?'<span class="btn-art">▦</span> Grid':'<span class="btn-art">▤</span> List';render();};
$('layoutBtn').innerHTML=listMode?'<span class="btn-art">▦</span> Grid':'<span class="btn-art">▤</span> List';
$('closeModalBtn').onclick=closeModal;
$('articleModal').onclick=e=>{if(e.target===$('articleModal'))closeModal();};
$('saveWorkerBtn').onclick=saveWorker;
$('addFeedBtn').onclick=()=>addFeed($('feedUrlInput').value);
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal();if(e.key==='/'&&!/INPUT|TEXTAREA/.test(document.activeElement?.tagName)){e.preventDefault();$('searchInput').focus();}});
renderManage();showTab('new');showStatus(articles.length?'Showing cached headlines while feeds refresh…':'Connecting to your news feeds…','');refreshFeeds();
if('serviceWorker'in navigator && location.protocol==='https:')navigator.serviceWorker.register('./sw.js?v=17', {updateViaCache:'none'}).catch(console.warn);
})();
