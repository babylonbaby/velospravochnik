(() => {
  if (!window.L) return;
  const style=document.createElement('style');
  style.textContent=`.route-map-wrap{margin-top:16px;background:#f1f4ec;border:1px solid #d9dfd4;border-radius:8px;overflow:hidden}.route-map{height:390px;min-height:260px;z-index:0}.route-map-tools{display:flex;gap:7px;flex-wrap:wrap;padding:9px}.route-map-tools button{font-size:13px;padding:7px 9px}.route-map-status{padding:0 10px 8px;font-size:12px;color:#586b63}.route-map-wrap:fullscreen{background:white;display:flex;flex-direction:column}.route-map-wrap:fullscreen .route-map{flex:1;height:auto}.leaflet-container{font:13px system-ui,Arial}.leaflet-container svg{background:transparent;border-radius:0}.leaflet-container a{color:#176d56}.route-map-label{background:white;border:2px solid var(--marker);border-radius:20px;color:#172f2c;font:bold 12px system-ui;padding:3px 8px;white-space:nowrap;width:max-content!important;height:auto!important}.route-map-legend{font-size:12px;padding:0 10px 8px}@media(max-width:600px){.route-map{height:340px}.card{padding:15px}}`;
  document.head.append(style);
  const originalCard=card;
  let map=null,controller=null,request=0;
  const cache=new Map();
  card=function(r){
    request++; const token=request;
    controller?.abort(); if(map){map.remove();map=null;}
    originalCard(r);
    const sketch=document.querySelector('#card > svg');
    const wrap=document.createElement('section'); wrap.className='route-map-wrap'; wrap.setAttribute('aria-label','Карта маршрута');
    wrap.innerHTML='<div class="route-map" tabindex="0" aria-label="Интерактивная карта маршрута"></div><div class="route-map-tools"><button type="button" data-fit>Весь маршрут</button><button type="button" data-full>На весь экран</button><button type="button" data-location>Моё местоположение</button></div><div class="route-map-legend">🟢 Старт → 🟠 Финиш · Линия повторяет запись GPX</div><div class="route-map-status" role="status" aria-live="polite">Загружаем GPX…</div>';
    if(sketch)sketch.replaceWith(wrap);else document.querySelector('#card h2').after(wrap);
    const status=wrap.querySelector('[role=status]');
    const m=map=L.map(wrap.querySelector('.route-map'),{scrollWheelZoom:false,preferCanvas:true});
    const tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(m);
    tiles.on('tileerror',()=>{if(token===request)status.textContent='Подложка карты недоступна. Трек и скачивание GPX продолжают работать.';});
    let line=null,position=null,accuracy=null;
    const draw=segments=>{
      if(line)m.removeLayer(line);
      line=L.polyline(segments,{color:'#176d56',weight:4,opacity:.95}).addTo(m);
      if(line.getBounds().isValid())m.fitBounds(line.getBounds(),{padding:[30,30],maxZoom:15});
    };
    draw(r.line);
    const marker=(p,label,color)=>L.marker(p,{icon:L.divIcon({className:'route-map-label',html:`<span style="--marker:${color}">${label}</span>`,iconAnchor:[12,12]}),title:label}).addTo(m).bindPopup(label);
    marker(r.start,'Старт','#176d56');marker(r.end,'Финиш','#d87928');
    wrap.querySelector('[data-fit]').onclick=()=>line&&m.fitBounds(line.getBounds(),{padding:[30,30],maxZoom:15});
    const full=wrap.querySelector('[data-full]');
    if(!wrap.requestFullscreen)full.hidden=true;
    full.onclick=async()=>{try{if(document.fullscreenElement===wrap)await document.exitFullscreen();else await wrap.requestFullscreen();}catch{status.textContent='Полноэкранный режим недоступен в этом браузере.';}};
    wrap.onfullscreenchange=()=>{m.invalidateSize();full.textContent=document.fullscreenElement===wrap?'Свернуть':'На весь экран';};
    wrap.querySelector('[data-location]').onclick=()=>{
      if(!navigator.geolocation){status.textContent='Браузер не поддерживает определение местоположения.';return;}
      status.textContent='Ожидаем разрешение на местоположение…';
      navigator.geolocation.getCurrentPosition(p=>{
        if(token!==request)return;
        const point=[p.coords.latitude,p.coords.longitude];
        if(position)m.removeLayer(position);if(accuracy)m.removeLayer(accuracy);
        accuracy=L.circle(point,{radius:p.coords.accuracy,color:'#2879c2',weight:1,fillOpacity:.1}).addTo(m);
        position=L.circleMarker(point,{radius:7,color:'white',weight:2,fillColor:'#2879c2',fillOpacity:1}).addTo(m).bindPopup('Вы здесь');
        m.setView(point,14);status.textContent='Ваше положение отмечено синим. Данные не сохраняются.';
      },()=>{if(token===request)status.textContent='Не удалось определить местоположение. Проверьте разрешение браузера.';},{enableHighAccuracy:true,timeout:15000,maximumAge:60000});
    };
    controller=new AbortController();
    const load=cache.has(r.file)?Promise.resolve(cache.get(r.file)):fetch(encodeURI(r.file).replace(/#/g,'%23'),{signal:controller.signal}).then(res=>{if(!res.ok)throw Error('GPX');return res.text();}).then(text=>{
      const xml=new DOMParser().parseFromString(text,'application/xml');if(xml.querySelector('parsererror'))throw Error('XML');
      const segments=Array.from(xml.getElementsByTagName('trkseg')).map(seg=>Array.from(seg.getElementsByTagName('trkpt')).map(p=>[Number(p.getAttribute('lat')),Number(p.getAttribute('lon'))]).filter(p=>p.every(Number.isFinite)&&Math.abs(p[0])<=90&&Math.abs(p[1])<=180)).filter(s=>s.length);
      if(!segments.length)throw Error('Empty'); if(cache.size>=8)cache.delete(cache.keys().next().value);cache.set(r.file,segments);return segments;
    });
    load.then(segments=>{if(token!==request)return;draw(segments);status.textContent='GPX загружен · Кнопки +/− меняют масштаб; карту можно двигать.';}).catch(e=>{if(e.name!=='AbortError'&&token===request)status.textContent='Не удалось загрузить GPX. Показана упрощённая линия маршрута.';});
  };
  if(selected)card(DATA.find(r=>r.id===selected));
})();
