export function mapDocument() {
  const tiles = process.env.EXPO_PUBLIC_MAP_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
  return `<!doctype html><html><head>
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
  <style>
    html,body,#map{height:100%;margin:0;background:#e9eee6;font-family:system-ui}
    #message{position:absolute;left:15px;bottom:28px;z-index:999;background:white;padding:8px 12px;border-radius:12px;font-size:12px;color:#14213d}
    .pin{width:42px;height:42px;box-sizing:border-box;border-radius:50%;background:#14213d;color:white;border:3px solid white;box-shadow:0 4px 16px #14213d44;display:grid;place-items:center;position:relative}
    .pin span{font-weight:800;font-size:17px}.pin.home{background:white;color:#14213d;border-color:#14213d}
    .pin.selected{background:#f2b134;color:#14213d;scale:1.12}.pin.live:after{content:'';width:9px;height:9px;border:2px solid white;background:#1ca76d;border-radius:50%;position:absolute;right:-2px;bottom:-2px}
    .leaflet-control-attribution{font-size:9px!important}.leaflet-container{font-family:system-ui}
  </style></head><body><div id="map"></div><div id="message">Loading map…</div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script><script>
  const message=document.getElementById('message');
  function bridge(value){const payload=JSON.stringify(value);if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(payload);else window.parent.postMessage(payload,'*');}
  if(!window.L){message.textContent='Map unavailable. Use the cards below.';}else{
    const map=L.map('map',{zoomControl:false}).setView([12.9716,77.5946],14);
    const markers=new Map();let initialized=false,follow=false,selected=null,userMarker=null;
    L.control.zoom({position:'topright'}).addTo(map);
    const layer=L.tileLayer(${JSON.stringify(tiles)},{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors'}).addTo(map);
    layer.on('load',()=>{message.style.display='none'});
    layer.on('tileerror',()=>{message.style.display='block';message.textContent='Map tiles unavailable. Use the cards below.'});
    function valid(point){return point&&point.latitude!=null&&point.longitude!=null&&Number.isFinite(Number(point.latitude))&&Number.isFinite(Number(point.longitude))&&Math.abs(Number(point.latitude))<=90&&Math.abs(Number(point.longitude))<=180;}
    function icon(point){return L.divIcon({className:'',html:'<div class="pin '+(point.kind==='home'?'home':'chef')+(point.is_live?' live':'')+'"><span>'+(point.kind==='home'?'⌂':'C')+'</span></div>',iconSize:[42,42],iconAnchor:[21,21]});}
    function select(id){selected=id;markers.forEach((marker,key)=>{const element=marker.getElement();if(element)element.querySelector('.pin').classList.toggle('selected',key===id);});}
    function animate(marker,position){
      if(marker.chefosFrame)cancelAnimationFrame(marker.chefosFrame);
      const origin=marker.getLatLng(),started=performance.now();
      function frame(now){const progress=Math.min(1,(now-started)/900);marker.setLatLng([origin.lat+(position[0]-origin.lat)*progress,origin.lng+(position[1]-origin.lng)*progress]);if(progress<1)marker.chefosFrame=requestAnimationFrame(frame);}
      marker.chefosFrame=requestAnimationFrame(frame);
    }
    function update(input){
      const points=(Array.isArray(input.points)?input.points:[]).filter(valid),ids=new Set(points.map(point=>point.id));
      follow=Boolean(input.follow);
      markers.forEach((marker,id)=>{if(!ids.has(id)){if(marker.chefosFrame)cancelAnimationFrame(marker.chefosFrame);map.removeLayer(marker);markers.delete(id);}});
      points.forEach(point=>{
        const position=[Number(point.latitude),Number(point.longitude)];let marker=markers.get(point.id);
        if(!marker){marker=L.marker(position,{icon:icon(point)}).addTo(map);markers.set(point.id,marker);marker.on('click',()=>{select(point.id);bridge({type:'select',id:point.id});});}
        else{marker.setIcon(icon(point));animate(marker,position);}
        const label=document.createElement('strong');label.textContent=point.name||'Chef';marker.unbindTooltip().bindTooltip(label,{direction:'top',offset:[0,-25]});
      });
      select(input.selectedId||selected);
      if(valid(input.center)){
        const position=[Number(input.center.latitude),Number(input.center.longitude)];
        if(!userMarker)userMarker=L.circleMarker(position,{radius:7,color:'white',weight:3,fillColor:'#2478e5',fillOpacity:1}).addTo(map);else userMarker.setLatLng(position);
      }else if(userMarker){map.removeLayer(userMarker);userMarker=null;}
      const bounds=points.map(point=>[Number(point.latitude),Number(point.longitude)]);
      if(valid(input.center))bounds.push([Number(input.center.latitude),Number(input.center.longitude)]);
      if(bounds.length&&(!initialized||input.recenter||follow)){
        if(follow&&selected&&markers.has(selected))map.panTo(markers.get(selected).getLatLng(),{animate:true,duration:.7});
        else map.fitBounds(bounds,{padding:[48,48],maxZoom:16,animate:initialized,duration:.7});
        initialized=true;
      }
    }
    function receive(event){try{const input=typeof event.data==='string'?JSON.parse(event.data):event.data;if(input.type==='update')update(input);if(input.type==='select'&&markers.has(input.id)){select(input.id);map.panTo(markers.get(input.id).getLatLng());}}catch{}}
    window.addEventListener('message',receive);document.addEventListener('message',receive);
    map.on('dragstart',()=>{follow=false;bridge({type:'follow',enabled:false});});
    bridge({type:'ready'});setTimeout(()=>map.invalidateSize(),100);
  }
  </script></body></html>`;
}
